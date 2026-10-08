import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Goal } from "../goals.ts";
import type { Account, Card, Transaction } from "../types.ts";
import { money } from "../format.ts";
import type { AiProvider } from "../ai-provider.ts";
import { checkText, finalAnswer } from "./answer.ts";
import { assistantData, cleanPending, type LedgerForAssistant } from "./context.ts";
import { historyMessages, toolBody, toolCalls } from "./llm.ts";
import {
  chipById,
  cleanAssistantInput,
  retryWhenBusy,
  runAssistant,
  type ModelCall,
} from "./run.ts";
import { runTool, ToolRun, type AssistantData } from "./tools.ts";
import { answerBlocks } from "./blocks.ts";

const today = "2026-10-08";

const card: Card = {
  id: "visa",
  bookId: "p",
  name: "Visa",
  bank: "",
  network: "visa",
  last4: "",
  closingDay: 23,
  dueDay: 5,
  limitArs: 2_000_000,
  accountArsId: "visa-ars",
  accountUsdId: "visa-usd",
  payAccountId: "bank",
  usdPerceptionPct: 30,
  tna: 75,
  archived: false,
};

const accounts: Account[] = [
  {
    id: "bank",
    bookId: "p",
    name: "Banco",
    kind: "bank",
    currency: "ARS",
    opening: 1_000_000,
    archived: false,
  },
  {
    id: "visa-ars",
    bookId: "p",
    name: "Visa",
    kind: "card",
    currency: "ARS",
    opening: 0,
    archived: false,
  },
  {
    id: "visa-usd",
    bookId: "p",
    name: "Visa USD",
    kind: "card",
    currency: "USD",
    opening: 0,
    archived: false,
  },
];

let n = 0;
const tx = (extra: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  type: "expense",
  amount: 1000,
  currency: "ARS",
  categoryId: "compras",
  note: "",
  merchant: "",
  date: "2026-09-10",
  method: "credito",
  createdAt: "",
  bookId: "p",
  accountId: "visa-ars",
  counterpartyId: "",
  amountTo: 0,
  rateArs: 0,
  rateLocked: false,
  recurringId: "",
  cardPeriod: "",
  purchaseId: "",
  installmentNo: 0,
  installmentCount: 0,
  ...extra,
});

const goal: Goal = {
  id: "brasil",
  bookId: "p",
  kind: "viaje",
  name: "Brasil",
  currency: "ARS",
  target: 3_000_000,
  saved: 0,
  deadline: "2027-02-08",
  priority: 2,
  active: true,
  createdAt: "",
  updatedAt: "",
};

const txs = [
  tx({ amount: 30_000 }),
  tx({
    amount: 900_000,
    type: "income",
    categoryId: "sueldo",
    accountId: "bank",
    method: "transferencia",
    date: "2026-10-01",
  }),
  tx({
    amount: 120_000,
    categoryId: "alimentos",
    accountId: "bank",
    method: "debito",
    date: "2026-10-03",
  }),
];

const data = (): AssistantData => ({
  plan: {
    today,
    bookId: "p",
    txs,
    accounts,
    cards: [card],
    statements: [],
    recurrings: [],
    rates: { usd: 1000, usdt: 1000 },
  },
  goals: [goal],
  categories: [
    { id: "compras", name: "Compras", kind: "expense" },
    { id: "alimentos", name: "Alimentación", kind: "expense" },
    { id: "sueldo", name: "Sueldo", kind: "income" },
  ],
  topes: { alimentos: 100_000 },
});

const responder = (args: Record<string, unknown>) => ({
  choices: [
    {
      message: {
        tool_calls: [
          {
            id: "r1",
            type: "function",
            function: { name: "responder", arguments: JSON.stringify(args) },
          },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 900, completion_tokens: 80 },
});

const calls = (list: [string, Record<string, unknown>][]) => ({
  choices: [
    {
      message: {
        tool_calls: list.map(([name, args], i) => ({
          id: `c${i}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        })),
      },
    },
  ],
  usage: { prompt_tokens: 800, completion_tokens: 40 },
});

/** A fake model that answers each call in order and records the bodies. */
function fake(answers: unknown[]) {
  const bodies: Record<string, unknown>[] = [];
  const provider: AiProvider = { id: "gateway", url: "x", token: "x", model: "m" };
  const call: ModelCall = async (build) => {
    bodies.push(build(provider));
    const next = answers.shift();
    return next === "fail" ? { ok: false, failure: "busy" } : { ok: true, body: next };
  };
  return { call, bodies };
}

describe("never a number the app did not compute", () => {
  const run = new ToolRun(data());
  const f1 = run.facts.ars(30_000);
  const f2 = run.facts.pct(0.4);

  it("replaces markers with Cifra's values", () => {
    const r = checkText(`Tenés que pagar {${f1}}, el {${f2}} del límite.`, run, "¿cuánto pago?");
    assert.deepEqual(r, {
      ok: true,
      text: `Tenés que pagar ${money(30_000, "ARS")}, el 40% del límite.`,
    });
  });

  it("tolerates a $ or % next to a marker that already has it", () => {
    const r = checkText(`Pagás $ {${f1}} ({${f2}}%).`, run, "x");
    assert.equal(r.ok && r.text, `Pagás ${money(30_000, "ARS")} (40%).`);
  });

  it("rejects invented numbers, signs, number words and unknown markers", () => {
    assert.deepEqual(checkText("Pagás 45.000 este mes.", run, "x"), {
      ok: false,
      reason: "número sin fuente 45.000",
    });
    assert.equal(checkText("Te sale 2027.", run, "x").ok, false);
    assert.equal(checkText("Gastás el 30% en comida.", run, "x").ok, false);
    assert.equal(checkText("Son como cincuenta mil pesos.", run, "x").ok, false);
    assert.equal(checkText("Mirá {f99}.", run, "x").ok, false);
  });

  it("allows numbers the user wrote", () => {
    assert.equal(
      checkText("En 12 cuotas de {f1} queda bien.", run, "¿y si compro en 12 cuotas de 50 mil?").ok,
      true,
    );
  });

  it("accepts Cifra's values written out instead of their marker", () => {
    const r = new ToolRun(data());
    const pay = r.facts.ars(127_000);
    r.facts.day("2026-10-12");
    r.facts.month("2027-05");
    r.facts.count(12, "cuota", "cuotas");
    const out = checkText(
      `Pagás ${money(127_000, "ARS")} el 12 de octubre, en 12 cuotas hasta Mayo 2027. Son 127.000 justos.`,
      r,
      "¿cuánto pago?",
    );
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(
      out.ok && out.text,
      `Pagás ${money(127_000, "ARS")} el 12 de octubre, en 12 cuotas hasta mayo 2027. Son 127.000 justos.`,
    );
    // Without the space after $, too; and the marker version still works.
    assert.equal(checkText(`Son $127.000 ({${pay}}).`, r, "x").ok, true);
  });

  it("a written-out value is never found inside a longer number", () => {
    const r = new ToolRun(data());
    r.facts.day("2026-10-05");
    r.facts.count(3, "cuota", "cuotas");
    assert.deepEqual(checkText("Vence el 15 de octubre.", r, "x"), {
      ok: false,
      reason: "número sin fuente 15",
    });
    assert.equal(checkText("Son 13 cuotas.", r, "x").ok, false);
    // A small number alone (not the value "3 cuotas") is still an invented count.
    assert.equal(checkText("Tenés 3 metas.", r, "x").ok, false);
  });

  it("the user's '600 mil' may come back as 600.000, $ 600.000 or 600 mil, nothing else", () => {
    const r = new ToolRun(data());
    const q = "¿y si compro una tele de 600 mil en 12 cuotas?";
    for (const t of [
      "Una tele de 600.000 en 12 cuotas entra.",
      "Una tele de $ 600.000 entra.",
      "Con 600 mil en 12 cuotas, el mes más justo es este.",
    ])
      assert.equal(checkText(t, r, q).ok, true, t);
    assert.deepEqual(checkText("Mejor una de 400 mil.", r, q), {
      ok: false,
      reason: "monto sin fuente 400 mil",
    });
    assert.equal(checkText("Mejor una de 400.000.", r, q).ok, false);
    assert.equal(checkText("Cada cuota es de $ 12.", r, q).ok, false);
    assert.equal(checkText("Son 50 mil por mes.", r, q).ok, false);
    assert.equal(checkText("Son cincuenta mil por mes.", r, q).ok, false);
    assert.equal(
      checkText("Con 1,5 palos llegás.", r, "¿me alcanza con 1,5 palos?").ok,
      true,
      "decimals in the user's amount",
    );
    assert.equal(checkText("Son $ 1.500.000.", r, "¿me alcanza con 1,5 palos?").ok, true);
  });

  it("final answer: unknown proposals and follow-ups with numbers are dropped", () => {
    const r2 = new ToolRun(data());
    runTool(r2, "plan_mes", {});
    const a = finalAnswer(
      {
        texto: "Listo.",
        propuestas: ["p1", "p99", "p1"],
        seguir: ["¿Y si gasto 200 mil?", "¿Llego con Brasil?"],
      },
      r2,
      "x",
    );
    assert.equal(a.source, "ia");
    assert.deepEqual(
      a.proposals.map((p) => p.id),
      r2.proposals.length ? ["p1"] : [],
    );
    assert.deepEqual(a.followUps, ["¿Llego con Brasil?"]);
  });

  it("a bad answer falls back to Cifra's template, never retried", () => {
    const r3 = new ToolRun(data());
    runTool(r3, "tarjetas", {});
    const a = finalAnswer({ texto: "Pagás 45.000.", propuestas: [], seguir: [] }, r3, "x");
    assert.equal(a.source, "plantilla");
    assert.match(a.text, /Visa: pagá \$\s?30\.000; venció el 5 de octubre\./);
    assert.equal(finalAnswer(null, r3, "x").reason, "esquema");
  });
});

describe("tools", () => {
  it("tarjetas: numbers only as ids, values from card math", () => {
    const run = new ToolRun(data());
    const r = runTool(run, "tarjetas", {});
    const visa = (r.data.tarjetas as Record<string, Record<string, unknown>>[])[0]!;
    const cerrado = visa.resumen_cerrado as Record<string, unknown>;
    assert.match(String(cerrado.a_pagar), /^f\d+$/);
    assert.equal(r.valores[String(cerrado.a_pagar)], money(30_000, "ARS"));
    assert.equal(cerrado.vencido, true);
    assert.equal(r.valores[String(visa.tna)], "75%");
    assert.ok(!JSON.stringify(r.data).match(/\d{3,}/), "no raw amounts in the data");
  });

  it("simular cuotas: the plan with and without, a proposal and nothing saved", () => {
    const run = new ToolRun(data());
    const r = runTool(run, "simular", {
      tipo: "cuotas",
      monto: 600_000,
      cuotas: 12,
      tarjeta: "visa",
      que: "Tele",
    });
    assert.equal(r.data.guardado, false);
    const p = run.proposals.find((x) => x.id === r.data.propuesta)!;
    assert.equal(p.kind, "compra_cuotas");
    if (p.kind !== "compra_cuotas") return;
    assert.deepEqual(
      [p.cardId, p.amount, p.installments, p.interestFree, p.what],
      ["visa", 600_000, 12, true, "Tele"],
    );
    assert.match(p.label, /Cargar Tele de \$\s?600\.000 en 12 cuotas en la Visa/);
    const cuotas = r.data.cuotas as Record<string, string>;
    assert.equal(r.valores[cuotas.cada_una!], money(50_000, "ARS"));
    assert.equal(txs.length, 3, "the data was not touched");
  });

  it("plan_deuda: avalancha vs bola de nieve with the card's TNA", () => {
    const run = new ToolRun(data());
    const r = runTool(run, "plan_deuda", {});
    const av = r.data.avalancha as Record<string, unknown>;
    assert.match(String(av.intereses_estimados), /^f\d+$/);
    assert.equal(r.data.las_dos_estrategias_son_iguales, true);
    assert.match(r.summary, /- Avalancha: salís en/);
  });

  it("metas and resumen_mes", () => {
    const run = new ToolRun(data());
    const m = runTool(run, "metas", {});
    assert.equal((m.data.metas as unknown[]).length, 1);
    const r = runTool(run, "resumen_mes", {});
    const cats = r.data.categorias as Record<string, unknown>[];
    const food = cats.find((c) => c.categoria === "Alimentación")!;
    assert.equal(food.pasado, true);
    assert.equal(r.valores[String(food.tope)], money(100_000, "ARS"));
  });

  it("no tool sends the model a raw number (only fact and proposal ids)", () => {
    const run = new ToolRun(data());
    const all: [string, Record<string, unknown>][] = [
      ["resumen_mes", {}],
      ["tendencia_categoria", { categoria: "Alimentación", meses: 3 }],
      ["tarjetas", {}],
      ["proximos", { dias: 15 }],
      ["metas", {}],
      ["plan_mes", {}],
      ["simular", { tipo: "cuotas", monto: 600_000, cuotas: 12, que: "Tele" }],
      ["simular", { tipo: "gasto", monto: 2_500_000 }],
      ["simular", { tipo: "sueldo", monto: 100_000, baja: true }],
      ["plan_deuda", {}],
      ["plan_deuda", { presupuesto: 1 }],
    ];
    for (const [name, args] of all) {
      const r = runTool(run, name, args);
      const text = JSON.stringify(r.data).replace(/"[fp]\d+"/g, '""');
      assert.ok(!/\d/.test(text), `${name}: ${text.match(/.{0,30}\d.{0,10}/)?.[0]}`);
    }
  });

  it("simular: how many goals change is a fact; the template says 'Cambia 1 meta'", () => {
    const run = new ToolRun(data());
    const r = runTool(run, "simular", { tipo: "gasto", monto: 900_000 });
    const changed = r.data.metas_que_cambian as unknown[];
    if (changed.length === 1) {
      assert.equal(r.valores[String(r.data.cuantas_metas_cambian)], "1 meta");
      assert.match(r.summary, /Cambia 1 meta\./);
    }
    assert.doesNotMatch(r.summary, /Cambian 1 meta/);
  });

  it("unknown tool or bad arguments: an error, never a throw", () => {
    const run = new ToolRun(data());
    assert.ok(runTool(run, "borrar_todo", {}).data.error);
    assert.ok(runTool(run, "simular", "nope").data.error);
    assert.ok(runTool(run, "tendencia_categoria", { categoria: "Viajes espaciales" }).data.error);
  });
});

describe("runAssistant", () => {
  it("chip: Cifra runs the tools, one model call forced to responder", async () => {
    const m = fake([
      responder({
        texto: "Del último resumen de la Visa te quedan {f1} y ya venció.",
        propuestas: [],
        seguir: ["¿Cómo salgo de la deuda?"],
      }),
    ]);
    const r = await runAssistant({
      data: data(),
      message: "¿Cuánto pago de tarjeta este mes?",
      chip: chipById("tarjeta"),
      history: [],
      call: m.call,
    });
    assert.equal(r.source, "ia");
    assert.equal(r.modelCalls, 1);
    assert.equal(
      r.text,
      `Del último resumen de la Visa te quedan ${money(30_000, "ARS")} y ya venció.`,
    );
    assert.deepEqual(m.bodies[0]!.tool_choice, {
      type: "function",
      function: { name: "responder" },
    });
    const msgs = m.bodies[0]!.messages as { role: string }[];
    assert.deepEqual(
      msgs.map((x) => x.role),
      ["system", "user", "assistant", "tool"],
    );
    assert.deepEqual(r.usage, { input: 900, output: 80 });
  });

  it("free text: one round of tools, then the answer; an invented number → template", async () => {
    const m = fake([
      calls([["simular", { tipo: "cuotas", monto: 600000, cuotas: 12 }]]),
      responder({ texto: "Vas a pagar 55.000 por mes.", propuestas: ["p1"], seguir: [] }),
    ]);
    const r = await runAssistant({
      data: data(),
      message: "¿y si compro una tele de 600 mil en 12?",
      chip: null,
      history: [],
      call: m.call,
    });
    assert.equal(r.modelCalls, 2);
    assert.equal(r.source, "plantilla");
    assert.match(r.reason ?? "", /número sin fuente/);
    assert.equal(r.proposals[0]?.kind, "compra_cuotas", "the proposal still comes from the tool");
    assert.match(r.text, /No se guardó nada/);
  });

  it("at most 3 tools per turn and two model calls", async () => {
    const m = fake([
      calls([
        ["tarjetas", {}],
        ["metas", {}],
        ["metas", {}],
        ["plan_mes", {}],
        ["resumen_mes", {}],
      ]),
      responder({ texto: "Ok.", propuestas: [], seguir: [] }),
    ]);
    const r = await runAssistant({
      data: data(),
      message: "contame todo",
      chip: null,
      history: [],
      call: m.call,
    });
    const tools = (m.bodies[1]!.messages as { role: string }[]).filter((x) => x.role === "tool");
    assert.equal(tools.length, 3);
    assert.equal(r.modelCalls, 2);
    assert.equal(r.text, "Ok.");
  });

  it("the model can answer directly (no tools) if it says no numbers", async () => {
    const m = fake([
      responder({
        texto: "¡Hola! Preguntame por tus tarjetas o metas.",
        propuestas: [],
        seguir: [],
      }),
    ]);
    const r = await runAssistant({
      data: data(),
      message: "hola",
      chip: null,
      history: [],
      call: m.call,
    });
    assert.equal(r.source, "ia");
    assert.equal(r.modelCalls, 1);
  });

  it("no model (off or out of quota): chips still answer with the template", async () => {
    const r = await runAssistant({
      data: data(),
      message: "x",
      chip: chipById("tarjeta"),
      history: [],
      call: null,
      note: "Hoy no.",
    });
    assert.equal(r.source, "plantilla");
    assert.equal(r.modelCalls, 0);
    assert.match(r.text, /^Hoy no\.\n\nVisa:/);
  });

  it("model failure on a chip: template with the numbers", async () => {
    const m = fake(["fail"]);
    const r = await runAssistant({
      data: data(),
      message: "x",
      chip: chipById("metas"),
      history: [],
      call: m.call,
    });
    assert.equal(r.source, "plantilla");
    assert.equal(r.reason, "modelo: busy");
    assert.match(r.text, /Brasil/);
  });

  it("plan chip: proposals come from the planner (topes, levers), never from the model", async () => {
    const m = fake([
      responder({
        texto: "Mirá las propuestas.",
        propuestas: ["p1", "p2", "p3", "p4"],
        seguir: [],
      }),
    ]);
    const r = await runAssistant({
      data: data(),
      message: "x",
      chip: chipById("plan"),
      history: [],
      call: m.call,
    });
    assert.ok(r.proposals.length <= 3);
    for (const p of r.proposals) assert.ok(["aplicar_topes", "meta"].includes(p.kind));
  });
});

describe("plumbing", () => {
  it("history: last 4 turns, short, numbers of past answers blanked", () => {
    const h = historyMessages([
      { role: "user", content: "a" },
      { role: "user", content: "b" },
      { role: "user", content: "¿cuánto pago?" },
      { role: "assistant", content: "Pagás $ 45.000 el 5 de noviembre (40%)." },
      { role: "user", content: "x".repeat(500) },
    ]);
    assert.equal(h.length, 4);
    assert.equal(
      (h[2] as { content: string }).content,
      "Pagás [dato] el [dato] de noviembre ([dato]).",
    );
    assert.equal((h[3] as { content: string }).content.length, 300);
  });

  it("request body: no prompt training on the Gateway, tool choice", () => {
    const gw: AiProvider = {
      id: "gateway",
      url: "x",
      token: "x",
      model: "spacexai/grok-4.1-fast-non-reasoning",
    };
    const b = toolBody(gw, { messages: [] });
    assert.deepEqual(b.providerOptions, { gateway: { disallowPromptTraining: true } });
    assert.equal(b.tool_choice, "required");
    assert.equal((b.tools as unknown[]).length, 9);
    assert.equal(b.max_tokens, 450);
  });

  it("tool calls: bad JSON arguments become null", () => {
    const c = toolCalls({
      choices: [
        { message: { tool_calls: [{ id: "a", function: { name: "metas", arguments: "{oops" } }] } },
      ],
    });
    assert.deepEqual(c, [{ id: "a", name: "metas", args: null }]);
    assert.deepEqual(toolCalls(null), []);
  });

  it("input: chip text wins, empty is invalid, at most 20 pending ops", () => {
    assert.equal(
      cleanAssistantInput({ chip: "metas", message: "ignorado" }).message,
      "¿Llego con mis metas?",
    );
    assert.throws(() => cleanAssistantInput({ message: "  " }));
    assert.equal(
      cleanAssistantInput({ message: "hola", pending: Array.from({ length: 30 }, () => ({})) })
        .pending.length,
      20,
    );
  });

  it("outbox: pending movements are merged for this answer only, rows cleaned", () => {
    const ops = cleanPending([
      {
        id: "new1",
        action: "add",
        at: 1,
        tries: 0,
        row: {
          id: "new1",
          type: "expense",
          amount: 5000,
          date: "2026-10-07",
          bookId: "p",
          accountId: "bank",
          categoryId: "alimentos",
          merchant: "Coto",
        },
      },
      {
        id: "bad",
        action: "add",
        at: 2,
        tries: 0,
        row: { id: "bad", type: "robo", amount: 5, date: "x" },
      },
      { id: txs[2]!.id, action: "delete", at: 3, tries: 0 },
    ]);
    assert.deepEqual(
      ops.map((o) => o.id),
      ["new1", txs[2]!.id],
    );
    assert.equal(ops[0]!.row?.merchant, "", "merchants are not needed by the tools");
    const ledger: LedgerForAssistant = {
      books: [{ id: "p" }, { id: "n" }],
      activeBookId: "p",
      transactions: txs,
      accounts,
      cards: [card],
      statements: [],
      recurrings: [],
      goals: [goal, { ...goal, id: "otra", bookId: "n" }],
      usdRate: 1000,
      usdtRate: 1000,
      customCategories: [],
      categoryNames: {},
      bookBudgets: { p: { alimentos: 100_000, ocio: 50_000 } },
      bookBudgetLocks: { p: { alimentos: true } },
    };
    const d = assistantData(ledger, "zzz", today, ops);
    assert.equal(d.plan.bookId, "p", "unknown book → active book");
    assert.ok(d.plan.txs.some((t) => t.id === "new1"));
    assert.ok(!d.plan.txs.some((t) => t.id === txs[2]!.id));
    assert.deepEqual(d.topes, { alimentos: 100_000 });
    assert.deepEqual(
      d.goals.map((g) => g.id),
      ["brasil"],
    );
  });
});

describe("busy model", () => {
  const ok = { ok: true as const, body: {} };
  const busy = { ok: false as const, failure: "busy" as const };
  it("a 429 busy gets one more try after a short wait, if there is time", async () => {
    let n = 0;
    const waits: number[] = [];
    const r = await retryWhenBusy(async () => (++n === 1 ? busy : ok), {
      deadline: 100_000,
      now: () => 0,
      sleep: async (ms) => void waits.push(ms),
    });
    assert.equal(r.ok, true);
    assert.equal(n, 2);
    assert.deepEqual(waits, [1_500]);
  });
  it("only once, never for credit or auth, never without time left", async () => {
    let n = 0;
    const sleep = async () => {};
    await retryWhenBusy(async () => (n++, busy), { deadline: 100_000, now: () => 0, sleep });
    assert.equal(n, 2);
    n = 0;
    await retryWhenBusy(async () => (n++, { ok: false, failure: "credit" }), {
      deadline: 100_000,
      now: () => 0,
      sleep,
    });
    assert.equal(n, 1);
    n = 0;
    await retryWhenBusy(async () => (n++, busy), { deadline: 5_000, now: () => 0, sleep });
    assert.equal(n, 1);
  });
});

describe("easy to read on the phone", () => {
  // A month that does not close: Brasil asks for more than what is left.
  const tight = (): AssistantData => {
    const d = data();
    d.goals = [{ ...goal, target: 9_000_000 }];
    return d;
  };

  it("no tool hands the model a negative amount: the key says it ('faltan')", () => {
    const run = new ToolRun(tight());
    for (const [name, args] of [
      ["resumen_mes", {}],
      ["tarjetas", {}],
      ["metas", {}],
      ["plan_mes", {}],
      ["simular", { tipo: "gasto", monto: 5_000_000 }],
      ["simular", { tipo: "cuotas", monto: 3_000_000, cuotas: 3 }],
      ["plan_deuda", {}],
    ] as [string, Record<string, unknown>][]) {
      const r = runTool(run, name, args);
      for (const v of Object.values(r.valores)) assert.doesNotMatch(v, /^[−-]/, `${name}: ${v}`);
      assert.doesNotMatch(r.summary, /[−-]\s?\$/, `${name} template: ${r.summary}`);
    }
    const plan = runTool(new ToolRun(tight()), "plan_mes", {});
    assert.equal(plan.data.cierra, false);
    assert.ok(plan.data.falta);
  });

  it("plan template: the conclusion first, then a list, the topes and what they free", () => {
    const r = runTool(new ToolRun(tight()), "plan_mes", {});
    const [first, ...rest] = r.summary.split("\n");
    assert.match(first!, /^El mes no cierra: te faltan \$\s?[\d.]+ por mes\.$/);
    assert.ok(
      rest.some((l) => l.startsWith("- Entra: ")),
      r.summary,
    );
    assert.ok(rest.some((l) => l.startsWith("- Fijos: ")));
    assert.ok(rest.some((l) => l.startsWith("- Tarjetas: ")));
    assert.ok(rest.some((l) => /^- Para el día a día: /.test(l)));
    const blocks = answerBlocks(r.summary);
    assert.equal(blocks[0]!.kind, "p");
    assert.equal(blocks[1]!.kind, "list");
    assert.equal(
      r.valores[String(r.data.cuantas_metas)],
      "1 meta",
      "counts are facts, not digits to invent",
    );
    const topes = r.data.topes_sugeridos as unknown[];
    if (topes.length) {
      assert.ok(blocks.some((b) => b.kind === "lead" && b.text === "Topes sugeridos:"));
      assert.equal(
        r.valores[String(r.data.cuantos_topes)],
        `${topes.length} tope${topes.length === 1 ? "" : "s"}`,
      );
    }
  });

  it("every template reads as conclusion + list", () => {
    const run = new ToolRun(tight());
    for (const name of ["tarjetas", "metas", "resumen_mes"]) {
      const b = answerBlocks(runTool(run, name, {}).summary);
      assert.equal(b[0]!.kind, "p", name);
      assert.ok(
        b.some((x) => x.kind === "list"),
        name,
      );
    }
    const sim = runTool(run, "simular", {
      tipo: "cuotas",
      monto: 600_000,
      cuotas: 12,
      que: "Tele",
    });
    assert.match(sim.summary, /- Cuotas: 12 de \$\s?50\.000, de /);
    assert.match(sim.summary, /No se guardó nada\.$/);
  });

  it("blocks: paragraphs, a lead line, label/value rows, plain items", () => {
    assert.deepEqual(
      answerBlocks(
        "El mes no cierra: te faltan $ 10.\n\n- Entra: $ 900.000\n- **Fijos**: $ 1\nTopes sugeridos:\n• Ocio: $ 5\n- recortá salidas\nListo.",
      ),
      [
        { kind: "p", text: "El mes no cierra: te faltan $ 10." },
        {
          kind: "list",
          items: [
            { label: "Entra", value: "$ 900.000" },
            { label: "Fijos", value: "$ 1" },
          ],
        },
        { kind: "lead", text: "Topes sugeridos:" },
        { kind: "list", items: [{ label: "Ocio", value: "$ 5" }, { text: "recortá salidas" }] },
        { kind: "p", text: "Listo." },
      ],
    );
    // A line that only ends in ":" without a list after it stays a paragraph.
    assert.deepEqual(answerBlocks("Mirá esto:"), [{ kind: "p", text: "Mirá esto:" }]);
  });

  it("the model's repeated unit around a value goes ('1 meta meta', 'enero 15 de enero')", () => {
    const r = new ToolRun(data());
    const one = r.facts.count(1, "meta", "metas");
    const day = r.facts.day("2027-01-15");
    const days = r.facts.count(8, "día", "días");
    const out = checkText(
      `Cambia {${one}} meta. Bariloche es para enero {${day}}. En {${days}} días gastaste más.`,
      r,
      "x",
    );
    assert.equal(
      out.ok && out.text,
      "Cambia 1 meta. Bariloche es para 15 de enero de 2027. En 8 días gastaste más.",
    );
  });

  it("chips say how to lay out the answer, without digits the model could copy", async () => {
    for (const id of ["tarjeta", "plan", "metas", "informe"]) {
      const c = chipById(id)!;
      assert.ok(c.guide, id);
      assert.doesNotMatch(c.guide!, /\d/, id);
    }
    const m = fake([responder({ texto: "Listo.", propuestas: [], seguir: [] })]);
    await runAssistant({
      data: data(),
      message: "Armame el plan del mes",
      chip: chipById("plan"),
      history: [],
      call: m.call,
    });
    const sys = (m.bodies[0]!.messages as { role: string; content: string }[])[0]!;
    assert.match(sys.content, /Topes sugeridos:/);
    assert.match(sys.content, /te faltan/);
  });

  it("resumen_mes: fijos and cuotas are not stretched to the whole month", () => {
    const d = data();
    d.plan.txs = [
      // Oct 1: rent (fijo), Oct 2-8: 80.000 day to day. Today is Oct 8 of 31 days.
      tx({
        amount: 400_000,
        categoryId: "compras",
        recurringId: "alquiler",
        accountId: "bank",
        method: "debito",
        date: "2026-10-01",
      }),
      tx({
        amount: 80_000,
        categoryId: "alimentos",
        accountId: "bank",
        method: "debito",
        date: "2026-10-05",
      }),
    ];
    const r = runTool(new ToolRun(d), "resumen_mes", {});
    assert.equal(
      r.valores[String(r.data.si_seguis_asi_gastas_en_el_mes)],
      money(400_000 + (80_000 / 8) * 31, "ARS"),
    );
  });

  it("tarjetas: the limit used counts the cuotas to come, like /tarjetas", () => {
    const d = data();
    d.plan.txs = [
      ...txs,
      tx({
        amount: 500_000,
        date: "2027-03-10",
        purchaseId: "heladera",
        installmentNo: 6,
        installmentCount: 6,
      }),
    ];
    const r = runTool(new ToolRun(d), "tarjetas", {});
    const visa = (r.data.tarjetas as Record<string, unknown>[])[0]!;
    assert.equal(r.valores[String(visa.limite_usado)], "27%");
  });
});
