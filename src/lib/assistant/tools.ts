/**
 * Read-only tools of the assistant (§2.7). Each one runs Cifra's own engine
 * (src/lib/plan, cards, goals) and returns a small JSON where every number is
 * a fact id ("f3") with its formatted value in `valores`, plus a plain summary
 * Cifra can show if the model fails. Tools never write: changes are returned
 * as proposals the user confirms with a button. Pure, sin IA.
 */
import { featuresAbout, UNSURE_TEXT, type GuideLink } from "./app-guide.ts";
import type { Goal, GoalPriority } from "../goals.ts";
import type { Account, Category, Currency } from "../types.ts";
import { accountBalance, accountLabel } from "../books.ts";
import { closingOf, dueOf, limitUse, periodForCard } from "../card-math.ts";
import { lastClosedBalance } from "../card-pay.ts";
import { money } from "../format.ts";
import { isFixedExpense } from "../diary-math.ts";
import {
  addMonths,
  cardBills,
  monthlySurplus,
  pendingFijos,
  projectCashflow,
  round0,
  txArs,
  type PlanData,
} from "../plan/cashflow.ts";
import { goalPlan } from "../plan/goal-plan.ts";
import { committedByCategory, suggestBudgets } from "../plan/budgets.ts";
import { monthPlan, planLevers } from "../plan/month-plan.ts";
import {
  cardDebts,
  compareDebtPlans,
  minimumFor,
  onlyCuotas,
  peakCuotas,
  suggestedDebtBudget,
} from "../plan/debt.ts";
import { simulate, type Scenario } from "../plan/simulate.ts";
import { Facts, dayLabel, monthLabel } from "./facts.ts";

/** Everything the tools read, for one book. */
export type AssistantData = {
  plan: PlanData;
  goals: Goal[];
  categories: Pick<Category, "id" | "name" | "kind">[];
  /** Topes the user set for this book (category id → ARS). */
  topes: Record<string, number>;
};

export type Proposal =
  | {
      id: string;
      kind: "aplicar_topes";
      label: string;
      topes: { id: string; name: string; tope: number }[];
    }
  | {
      id: string;
      kind: "meta";
      label: string;
      goalId: string;
      deadline?: string;
      target?: number;
      priority?: GoalPriority;
    }
  | {
      id: string;
      kind: "compra_cuotas";
      label: string;
      cardId: string;
      amount: number;
      installments: number;
      interestFree: boolean;
      what: string;
    }
  | {
      id: string;
      kind: "gasto";
      label: string;
      accountId: string;
      amount: number;
      currency: Currency;
      card: boolean;
    };

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ProposalInput = DistOmit<Proposal, "id">;

export type ToolResult = {
  /** Sent to the model: numbers only as fact ids, their values in `valores`. */
  data: Record<string, unknown>;
  /** Plain Spanish built by Cifra (template answer if the model fails). */
  summary: string;
};

export class ToolRun {
  readonly facts: Facts;
  readonly proposals: Proposal[] = [];
  readonly summaries: string[] = [];
  /** Links into the app the answer should carry (from `funciones_app`). */
  readonly links: GuideLink[] = [];
  readonly data: AssistantData;
  constructor(data: AssistantData) {
    this.data = data;
    this.facts = new Facts(data.plan.today.slice(0, 4));
  }
  propose(p: ProposalInput): string {
    const id = `p${this.proposals.length + 1}`;
    this.proposals.push({ ...p, id });
    return id;
  }
}

// ------------------------------------------------------------------ helpers

export function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findByName<T>(list: T[], name: unknown, label: (t: T) => string): T | undefined {
  const q = typeof name === "string" ? norm(name) : "";
  if (!q) return undefined;
  return (
    list.find((t) => norm(label(t)) === q) ??
    list.find((t) => norm(label(t)).includes(q)) ??
    list.find((t) => q.includes(norm(label(t))))
  );
}

const PRIORITY: Record<GoalPriority, string> = { 1: "alta", 2: "media", 3: "baja" };

function catName(d: AssistantData, id: string) {
  return d.categories.find((c) => c.id === id)?.name ?? id;
}

/**
 * A money value that can go below zero, under a key that says which way: the
 * model never gets "−$ 42.222" to explain, it gets "faltan: $ 42.222".
 */
function signed(f: Facts, v: number, positive: string, negative: string) {
  return v >= 0 ? { [positive]: f.ars(v) } : { [negative]: f.ars(-v) };
}

/** "- Etiqueta: valor" lines for Cifra's own text (the chat shows them as a list). */
function textLines(rows: (string | false | null | undefined)[]) {
  return rows.filter(Boolean).join("\n");
}

const ars = (v: number) => money(round0(v), "ARS");

function monthSpend(d: AssistantData, ym: string) {
  const byCat: Record<string, number> = {};
  let spent = 0;
  let fixed = 0;
  let earned = 0;
  for (const t of d.plan.txs) {
    if (!t.date.startsWith(ym)) continue;
    if (t.type === "expense") {
      const v = txArs(t, d.plan.rates);
      spent += v;
      // Fijos and cuotas land once a month: they do not grow with the days.
      if (isFixedExpense(t) || t.purchaseId || t.installmentCount > 0) fixed += v;
      byCat[t.categoryId] = (byCat[t.categoryId] ?? 0) + v;
    } else if (t.type === "income") earned += txArs(t, d.plan.rates);
  }
  return { spent: round0(spent), fixed: round0(fixed), earned: round0(earned), byCat };
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

function cajas(d: AssistantData): Account[] {
  const cardIds = new Set(d.plan.cards.flatMap((c) => [c.accountArsId, c.accountUsdId]));
  return d.plan.accounts.filter(
    (a) => !a.archived && !cardIds.has(a.id) && a.bookId === d.plan.bookId,
  );
}

// -------------------------------------------------------------------- tools

function resumenMes(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const d = run.data;
  const f = run.facts;
  const current = d.plan.today.slice(0, 7);
  const ym =
    typeof args.mes === "string" && /^\d{4}-\d{2}$/.test(args.mes) && args.mes <= current
      ? args.mes
      : current;
  const cur = monthSpend(d, ym);
  const prev = monthSpend(d, addMonths(ym, -1));
  const isCurrent = ym === current;
  const elapsed = isCurrent ? Number(d.plan.today.slice(8, 10)) : daysInMonth(ym);
  // Only the day-to-day spending grows with the days; fijos and cuotas are
  // counted once (and the fijos still to come this month are added).
  const pending = isCurrent
    ? pendingFijos(d.plan, ym, "expense").reduce((sum, x) => sum + x.amount, 0)
    : 0;
  const variable = cur.spent - cur.fixed;
  const projected =
    isCurrent && elapsed > 0
      ? round0(cur.fixed + pending + (variable / elapsed) * daysInMonth(ym))
      : cur.spent;
  const top = Object.entries(cur.byCat)
    .filter(([, v]) => v >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const categorias = top.map(([id, v]) => {
    const tope = d.topes[id] ?? 0;
    const before = prev.byCat[id] ?? 0;
    return {
      categoria: catName(d, id),
      gastado: f.ars(v),
      ...(tope > 0 ? { tope: f.ars(tope), usado: f.pct(v / tope), pasado: v > tope } : {}),
      ...(before >= 1 ? { mes_anterior: f.ars(before) } : {}),
    };
  });
  const data = {
    mes: f.month(ym),
    entro: f.ars(cur.earned),
    gastado: f.ars(cur.spent),
    ...signed(f, cur.earned - cur.spent, "te_quedo", "gastaste_mas_de_lo_que_entro_por"),
    ...(isCurrent
      ? {
          si_seguis_asi_gastas_en_el_mes: f.ars(projected),
          dias_pasados: f.count(elapsed, "día", "días"),
        }
      : {}),
    gastado_mes_anterior: f.ars(prev.spent),
    categorias,
  };
  const net = cur.earned - cur.spent;
  const summary = textLines([
    net >= 0
      ? `En ${monthLabel(ym)} te quedan ${ars(net)} de lo que entró${isCurrent ? ", por ahora" : ""}.`
      : `En ${monthLabel(ym)} gastaste ${ars(-net)} más de lo que entró.`,
    `- Entró: ${ars(cur.earned)}`,
    `- Gastaste: ${ars(cur.spent)}`,
    isCurrent && `- Si seguís así, el mes cierra en: ${ars(projected)}`,
    `- Mes anterior: ${ars(prev.spent)}`,
    top.length > 0 && "Lo que más:",
    ...top.slice(0, 3).map(([id, v]) => `- ${catName(d, id)}: ${ars(v)}`),
  ]);
  return { data, summary };
}

function tendenciaCategoria(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const d = run.data;
  const f = run.facts;
  const cat =
    d.categories.find((c) => c.id === args.categoria) ??
    findByName(d.categories, args.categoria, (c) => c.name);
  if (!cat) {
    return {
      data: {
        error: "No encontré esa categoría.",
        categorias: d.categories.filter((c) => c.kind === "expense").map((c) => c.name),
      },
      summary: "No encontré esa categoría.",
    };
  }
  const n = Math.max(1, Math.min(6, Math.round(Number(args.meses) || 3)));
  const current = d.plan.today.slice(0, 7);
  const rows = [];
  const parts: string[] = [];
  for (let i = n; i >= 0; i--) {
    const ym = addMonths(current, -i);
    const v = round0(monthSpend(d, ym).byCat[cat.id] ?? 0);
    rows.push({ mes: f.month(ym), gastado: f.ars(v), en_curso: i === 0 });
    parts.push(`${monthLabel(ym)} ${money(v, "ARS")}`);
  }
  const tope = d.topes[cat.id] ?? 0;
  return {
    data: { categoria: cat.name, meses: rows, ...(tope > 0 ? { tope: f.ars(tope) } : {}) },
    summary: `${cat.name}: ${parts.join(", ")}.`,
  };
}

function tarjetas(run: ToolRun): ToolResult {
  const d = run.data;
  const f = run.facts;
  const p = d.plan;
  if (!p.cards.length)
    return {
      data: { tarjetas: [], nota: "No hay tarjetas cargadas." },
      summary: "No tenés tarjetas cargadas.",
    };
  const bills = cardBills(p, 3);
  const out = [];
  const parts: string[] = [];
  for (const card of p.cards) {
    const st = lastClosedBalance(card, p.txs, p.today, p.statements, p.accounts);
    const leftArs = round0(st.leftArs + st.leftUsd * (p.rates.usd > 0 ? p.rates.usd : 0));
    const open = periodForCard(p.today, card, p.statements);
    const next = bills.find((b) => b.cardId === card.id && !b.closed);
    // Same as /tarjetas and the alerts: what the card's cajas owe, cuotas to come included.
    const owed = (id: string) => {
      const acc = p.accounts.find((a) => a.id === id);
      return acc ? Math.max(0, -accountBalance(acc, p.txs)) : 0;
    };
    const lim = limitUse(card, owed(card.accountArsId), owed(card.accountUsdId), p.rates.usd);
    const minimo = minimumFor(leftArs, 0, st.minimumArs > 0 ? st.minimumArs : 0, true);
    out.push({
      nombre: card.name,
      resumen_cerrado: {
        ...signed(f, leftArs, "a_pagar", "saldo_a_favor"),
        ...(st.leftUsd > 0 ? { incluye_usd: f.money(st.leftUsd, "USD") } : {}),
        vence: f.day(st.due),
        vencido: leftArs >= 1 && st.due < p.today,
        ...(leftArs >= 1 ? { minimo: f.ars(minimo), minimo_es_del_banco: st.minimumArs > 0 } : {}),
      },
      proximo_cierre: f.day(closingOf(card, open, p.statements)),
      // What the open statement has so far: not a minimum (the model once
      // wrote "Mínimo próximo resumen" for it).
      proximo_resumen: {
        total_cargado_hasta_hoy: f.notMinimum(f.ars(next?.totalArs ?? 0)),
        vence: f.day(next ? next.due : dueOf(card, open, p.statements)),
      },
      ...(card.tna > 0 ? { tna: f.rate(card.tna) } : {}),
      ...(lim ? { limite: f.ars(lim.limit), limite_usado: f.pct(lim.pct) } : {}),
    });
    parts.push(
      textLines([
        leftArs >= 1
          ? `${card.name}: pagá ${ars(leftArs)}; ${st.due < p.today ? "venció" : "vence"} el ${dayLabel(st.due)}.`
          : `${card.name}: no hay nada para pagar del último resumen.`,
        leftArs >= 1 && `- Mínimo: ${ars(minimo)}`,
        `- Próximo resumen, hasta hoy: ${ars(next?.totalArs ?? 0)}`,
        lim && `- Límite usado: ${Math.round(lim.pct * 100)}%`,
      ]),
    );
  }
  return { data: { tarjetas: out }, summary: parts.join("\n\n") };
}

function proximos(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const d = run.data;
  const f = run.facts;
  const p = d.plan;
  const days = Math.max(1, Math.min(45, Math.round(Number(args.dias) || 30)));
  const until = new Date(Date.parse(`${p.today}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const items: { fecha: string; que: string; monto: string; tipo: string; _date: string }[] = [];
  for (const b of cardBills(p, 3)) {
    if (b.due > until || (b.due < p.today && !b.overdue)) continue;
    items.push({
      _date: b.due,
      fecha: f.day(b.due),
      que: `Resumen ${b.cardName}${b.overdue ? " (vencido)" : ""}`,
      monto: f.ars(b.totalArs),
      tipo: "tarjeta",
    });
  }
  const months = [p.today.slice(0, 7), addMonths(p.today.slice(0, 7), 1)];
  for (const ym of months) {
    for (const type of ["expense", "income"] as const) {
      for (const fx of pendingFijos(p, ym, type)) {
        if (fx.date < p.today || fx.date > until) continue;
        items.push({
          _date: fx.date,
          fecha: f.day(fx.date),
          que: fx.name,
          monto: f.ars(fx.amount),
          tipo: type === "income" ? "fijo que entra" : "fijo que sale",
        });
      }
    }
  }
  items.sort((a, b) => a._date.localeCompare(b._date));
  const list = items.slice(0, 12);
  const summary = list.length
    ? `Próximos ${days} días: ${items
        .slice(0, 6)
        .map((i) => `${i.que} el ${dayLabel(i._date)} (${run.facts.get(i.monto)})`)
        .join(", ")}.`
    : `No hay vencimientos ni fijos en los próximos ${days} días.`;
  return {
    data: { dias: f.count(days, "día", "días"), proximos: list.map(({ _date, ...rest }) => rest) },
    summary,
  };
}

/**
 * The one-line answer to "¿Llego con mis metas?", from each goal's onTrack
 * (true / false / null = no date).
 */
export function goalsVerdict(onTrack: (boolean | null)[]): string {
  const dated = onTrack.filter((x) => x !== null);
  const late = dated.filter((x) => x === false).length;
  if (!dated.length) return "tus metas no tienen fecha, así que no hay un plazo que cumplir";
  if (!late)
    return dated.length === 1
      ? "llegás a tiempo con tu meta"
      : "llegás a tiempo con todas tus metas";
  if (late === dated.length) {
    return dated.length === 1
      ? "no llegás a tiempo con tu meta"
      : "no llegás a tiempo con ninguna de tus metas";
  }
  return `no llegás a tiempo con ${late} de tus ${dated.length} metas con fecha`;
}

function metas(run: ToolRun): ToolResult {
  const d = run.data;
  const f = run.facts;
  const goals = d.goals.filter((g) => g.active);
  const flow = projectCashflow(d.plan, 6);
  const surplus = monthlySurplus(flow);
  const lines = goalPlan(goals, surplus, d.plan.today, d.plan.rates);
  if (!lines.length) {
    return {
      data: {
        metas: [],
        ...signed(f, surplus, "sobrante_por_mes", "falta_por_mes"),
        nota: "No hay metas abiertas.",
      },
      summary: "No tenés metas abiertas.",
    };
  }
  const parts: string[] = [];
  const out = lines.map((l) => {
    const g = l.goal;
    parts.push(
      `- ${g.name}: ${
        l.onTrack === true
          ? "llega a tiempo"
          : l.onTrack === false
            ? `no llega para ${monthLabel(g.deadline.slice(0, 7))}; ${l.eta ? `con lo que sobra, llegaría en ${monthLabel(l.eta)}` : "con lo que sobra hoy no llega"}`
            : l.eta
              ? `sin fecha; llegaría en ${monthLabel(l.eta)}`
              : "sin fecha; con lo que sobra hoy no llega"
      }`,
    );
    return {
      nombre: g.name,
      prioridad: PRIORITY[g.priority],
      objetivo: f.money(g.target, g.currency),
      juntado: f.money(g.saved, g.currency),
      ...(g.deadline
        ? {
            fecha: f.day(g.deadline),
            necesita_por_mes_para_llegar_a_tiempo: f.money(l.needed, g.currency),
          }
        : {}),
      ...(l.assigned > 0
        ? { recibe_por_mes_de_lo_que_sobra: f.money(l.assigned, g.currency) }
        : { no_recibe_nada_de_lo_que_sobra: true }),
      llega_a_tiempo: l.onTrack,
      ...(l.eta ? { llegaria: f.month(l.eta) } : { no_llega_con_lo_que_sobra_hoy: true }),
      ...(l.usdHint
        ? { aviso: "En pesos y a más de medio año pierde valor; se puede pasar a dólares." }
        : {}),
    };
  });
  const verdict = goalsVerdict(lines.map((l) => l.onTrack));
  return {
    data: {
      // The model must not decide "sí llegás" on its own: Cifra says it.
      conclusion: f.lead(f.label(verdict)),
      ...signed(f, surplus, "sobrante_por_mes", "falta_por_mes"),
      metas: out,
    },
    summary: textLines([
      `${verdict.charAt(0).toUpperCase()}${verdict.slice(1)}. ${
        surplus > 0
          ? `Te sobran unos ${ars(surplus)} por mes para metas.`
          : surplus < 0
            ? `Hoy no te sobra nada para metas: faltan ${ars(-surplus)} por mes.`
            : "Hoy no te sobra nada para metas."
      }`,
      ...parts,
    ]),
  };
}

function planMes(run: ToolRun): ToolResult {
  const d = run.data;
  const f = run.facts;
  const goals = d.goals.filter((g) => g.active);
  const flow = projectCashflow(d.plan, 6);
  const surplus = monthlySurplus(flow);
  const lines = goalPlan(goals, surplus, d.plan.today, d.plan.rates);
  const plan = monthPlan(flow, lines);
  const suggestion = suggestBudgets({
    usual: flow.history.byCategory,
    committed: committedByCategory(d.plan, d.plan.today.slice(0, 7)),
    cut: Math.max(0, -plan.gap),
    names: Object.fromEntries(d.categories.map((c) => [c.id, c.name])),
  });
  const levers = planLevers({
    plan,
    lines,
    goals,
    surplus,
    suggestion,
    today: d.plan.today,
    rates: d.plan.rates,
  });
  const topes = suggestion.rows.filter((r) => r.tope > 0);
  const propuestas: { id: string; que: string }[] = [];
  if (topes.length) {
    const id = run.propose({
      kind: "aplicar_topes",
      label: `Aplicar ${topes.length} tope${topes.length === 1 ? "" : "s"} en Presupuestos`,
      topes: topes.map((r) => ({ id: r.id, name: r.name, tope: r.tope })),
    });
    propuestas.push({ id, que: "Aplicar los topes sugeridos" });
  }
  for (const l of levers) {
    if (l.kind === "recorte") continue;
    const id = run.propose({
      kind: "meta",
      label: l.text,
      goalId: l.goalId,
      // A "fecha" lever may also lower the amount (when the date alone would be too far).
      ...(l.kind === "fecha"
        ? {
            deadline: l.deadline,
            ...("target" in l && typeof l.target === "number" ? { target: l.target } : {}),
          }
        : {}),
      ...(l.kind === "monto" ? { target: l.target } : {}),
      ...(l.kind === "prioridad" ? { priority: l.priority } : {}),
    });
    propuestas.push({
      id,
      que:
        l.kind === "fecha"
          ? "Mover la fecha de una meta"
          : l.kind === "monto"
            ? "Bajar el monto de una meta"
            : "Subir la prioridad de una meta",
    });
  }
  const data = {
    entra_por_mes: f.ars(plan.income),
    fijos: f.ars(plan.fijos),
    tarjetas: f.ars(plan.cards),
    metas_por_mes_en_total: f.ars(plan.goalsTotal),
    metas: plan.goals.map((g) => ({
      nombre: g.name,
      prioridad: PRIORITY[g.priority],
      por_mes: f.ars(g.needArs),
    })),
    // Ready for a row ("Día a día: faltan $ 42.222"): the word says which way.
    dia_a_dia: f.label(
      plan.dayToDay >= 0 ? `quedan ${ars(plan.dayToDay)}` : `faltan ${ars(-plan.dayToDay)}`,
    ),
    alcanza_para_el_dia_a_dia: plan.dayToDay >= 0,
    gasto_normal_dia_a_dia: f.ars(plan.usual),
    cierra: plan.closes,
    ...(plan.closes ? { sobra: f.ars(plan.gap) } : { falta: f.ars(-plan.gap) }),
    ...(topes.length ? { cuantos_topes: f.count(topes.length, "tope", "topes") } : {}),
    ...(plan.goals.length ? { cuantas_metas: f.count(plan.goals.length, "meta", "metas") } : {}),
    topes_sugeridos: topes.map((r) => ({
      categoria: r.name,
      normal: f.ars(r.usual),
      tope: f.ars(r.tope),
    })),
    ...(suggestion.freed > 0 ? { los_topes_liberan: f.ars(suggestion.freed) } : {}),
    propuestas,
  };
  const summary = textLines([
    plan.closes
      ? `El mes cierra: te sobran ${ars(plan.gap)} por mes.`
      : `El mes no cierra: te faltan ${ars(-plan.gap)} por mes.`,
    `- Entra: ${ars(plan.income)}`,
    `- Fijos: ${ars(plan.fijos)}`,
    `- Tarjetas: ${ars(plan.cards)}`,
    plan.goalsTotal > 0 && `- Metas: ${ars(plan.goalsTotal)}`,
    plan.dayToDay >= 0
      ? `- Para el día a día: ${ars(plan.dayToDay)} (lo normal es ${ars(plan.usual)})`
      : `- Para el día a día: no queda nada, faltan ${ars(-plan.dayToDay)} (lo normal es ${ars(plan.usual)})`,
    topes.length > 0 && "Topes sugeridos:",
    ...topes.map((r) => `- ${r.name}: ${ars(r.tope)}`),
    suggestion.freed > 0 && `Con estos topes liberás ${ars(suggestion.freed)} por mes.`,
  ]);
  return { data, summary };
}

function simular(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const d = run.data;
  const f = run.facts;
  const p = d.plan;
  const tipo = args.tipo;
  const monto = Math.abs(Number(args.monto) || 0);
  if (!(monto > 0))
    return { data: { error: "Falta el monto." }, summary: "Para simular necesito el monto." };
  let scenario: Scenario;
  let proposal: ProposalInput | null = null;
  if (tipo === "cuotas") {
    const card = findByName(p.cards, args.tarjeta, (c) => c.name) ?? p.cards[0];
    if (!card)
      return {
        data: { error: "No hay tarjetas cargadas." },
        summary: "Para simular cuotas necesitás cargar una tarjeta.",
      };
    const n = Math.max(1, Math.min(72, Math.round(Number(args.cuotas) || 1)));
    const interestFree = args.sin_interes !== false;
    scenario = { kind: "cuotas", cardId: card.id, amount: monto, installments: n, interestFree };
    const what = typeof args.que === "string" ? args.que.slice(0, 40) : "";
    const total = interestFree ? monto : monto * n;
    proposal = {
      kind: "compra_cuotas",
      label: `Cargar ${what || "la compra"} de ${money(total, "ARS")} en ${n} cuota${n === 1 ? "" : "s"} en la ${card.name}`,
      cardId: card.id,
      amount: monto,
      installments: n,
      interestFree,
      what,
    };
  } else if (tipo === "gasto") {
    const list = cajas(d);
    const card = findByName(p.cards, args.caja, (c) => c.name);
    const caja = card
      ? p.accounts.find((a) => a.id === card.accountArsId)
      : (findByName(list, args.caja, (a) => a.name) ??
        list
          .filter((a) => a.currency === "ARS")
          .sort((a, b) => accountBalance(b, p.txs) - accountBalance(a, p.txs))[0]);
    if (!caja)
      return {
        data: { error: "No hay cajas en pesos." },
        summary: "Para simular un gasto necesitás una caja.",
      };
    scenario = { kind: "gasto", accountId: caja.id, amount: monto };
    proposal = {
      kind: "gasto",
      label: `Cargar un gasto de ${money(monto, caja.currency)} ${card ? `con la ${card.name}` : `desde ${accountLabel(caja)}`}`,
      accountId: caja.id,
      amount: monto,
      currency: caja.currency,
      card: Boolean(card),
    };
  } else if (tipo === "sueldo") {
    const delta = (args.baja === true ? -1 : 1) * monto;
    scenario = { kind: "sueldo", delta };
  } else {
    return {
      data: { error: "tipo debe ser cuotas, gasto o sueldo." },
      summary: "No entendí qué simular.",
    };
  }
  const r = simulate(
    p,
    d.goals.filter((g) => g.active),
    scenario,
    6,
  );
  if (r.invalid) return { data: { error: r.invalid }, summary: r.invalid };
  const goals = r.goals
    .filter((g) => g.change !== "same")
    .map((g) => ({
      meta: g.name,
      cambio: (
        {
          later: "se atrasa",
          sooner: "se adelanta",
          lost: "deja de llegar",
          gained: "ahora llega",
          same: "igual",
        } as const
      )[g.change],
      antes: g.before.eta ? f.month(g.before.eta) : "nunca",
      despues: g.after.eta ? f.month(g.after.eta) : "nunca",
    }));
  const data: Record<string, unknown> = {
    tipo,
    mes_mas_justo: {
      mes: f.month(r.lowest.ym),
      ...signed(f, r.lowest.balance, "te_queda_en_las_cajas", "en_rojo_por"),
    },
    ...(r.redFrom ? { en_rojo_desde: f.month(r.redFrom) } : { en_rojo: false }),
    ...(r.redFromBase ? { ya_en_rojo_sin_esto_desde: f.month(r.redFromBase) } : {}),
    sobrante_por_mes: {
      ...signed(f, r.surplus.before, "antes", "antes_faltaban"),
      ...signed(f, r.surplus.after, "despues", "despues_faltan"),
    },
    metas_que_cambian: goals,
    ...(goals.length ? { cuantas_metas_cambian: f.count(goals.length, "meta", "metas") } : {}),
    ...(r.cuotas
      ? {
          cuotas: {
            cada_una: f.ars(r.cuotas.each),
            cantidad: f.count(r.cuotas.count, "cuota", "cuotas"),
            total: f.ars(r.cuotas.total),
            primera: f.month(r.cuotas.first),
            ultima: f.month(r.cuotas.last),
          },
        }
      : {}),
    ...(r.limit && r.limit.limit > 0
      ? {
          limite_tarjeta: {
            tarjeta: r.limit.name,
            ...signed(f, r.limit.free, "libre_despues", "se_pasa_del_limite_por"),
            pasa_el_limite: r.limit.free < 0,
          },
        }
      : {}),
    guardado: false,
  };
  if (proposal) data.propuesta = run.propose(proposal);
  const left = (v: number) => (v >= 0 ? ars(v) : `faltan ${ars(-v)}`);
  const eta = (ym: string | null | undefined) => (ym ? monthLabel(ym) : "no llega");
  const summary = textLines([
    r.redFrom
      ? `Con esto quedás en rojo desde ${monthLabel(r.redFrom)}.`
      : `Con esto no quedás en rojo: el mes más justo es ${monthLabel(r.lowest.ym)}, con ${ars(r.lowest.balance)} en tus cajas.`,
    r.cuotas &&
      `- Cuotas: ${r.cuotas.count} de ${ars(r.cuotas.each)}, de ${monthLabel(r.cuotas.first)} a ${monthLabel(r.cuotas.last)}`,
    r.surplus.before !== r.surplus.after &&
      `- Sobra por mes: ${left(r.surplus.before)} antes, ${left(r.surplus.after)} después`,
    ...r.goals
      .filter((g) => g.change !== "same")
      .map((g) => `- ${g.name}: ${eta(g.before.eta)} antes, ${eta(g.after.eta)} después`),
    r.limit &&
      r.limit.limit > 0 &&
      (r.limit.free >= 0
        ? `- ${r.limit.name}: quedan ${ars(r.limit.free)} libres del límite`
        : `- ${r.limit.name}: te pasás del límite por ${ars(-r.limit.free)}`),
    "No se guardó nada.",
  ]);
  return { data, summary };
}

function planDeuda(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const d = run.data;
  const f = run.facts;
  const p = d.plan;
  const debts = cardDebts({
    today: p.today,
    cards: p.cards,
    txs: p.txs,
    statements: p.statements,
    accounts: p.accounts,
    usdRate: p.rates.usd,
  });
  if (!debts.length)
    return {
      data: { deudas: [], nota: "No hay deuda de tarjeta." },
      summary: "No tenés deuda de tarjeta.",
    };
  const surplus = monthlySurplus(projectCashflow(p, 6));
  const asked = Math.round(Number(args.presupuesto) || 0);
  if (onlyCuotas(debts) && asked <= 0) {
    // Nothing accrues interest: no plan to pick, the cuotas are paid with each statement.
    const total = debts.reduce((s, dd) => s + dd.cuotasTotal, 0);
    const end =
      debts
        .map((dd) => dd.cuotasEnd)
        .filter(Boolean)
        .sort()
        .at(-1) ?? "";
    const peak = peakCuotas(debts, p.today);
    return {
      data: {
        deuda_cara: false,
        conclusion: f.label("no tenés deuda cara: solo cuotas que se pagan con cada resumen"),
        cuotas_que_siguen: f.ars(total),
        ...(end ? { ultima_cuota: f.month(end) } : {}),
        mes_con_mas_cuotas: f.ars(peak),
        sobra_por_mes_despues_de_cuotas: f.ars(Math.max(0, surplus)),
      },
      summary: textLines([
        "No tenés deuda cara: no quedan saldos de resúmenes sin pagar.",
        `- Cuotas que siguen: ${ars(total)}${end ? `, hasta ${monthLabel(end)}` : ""}`,
        `- Mes con más cuotas: ${ars(peak)}`,
        "Mientras pagues el total de cada resumen, las cuotas no suman intereses.",
      ]),
    };
  }
  const budget = asked > 0 ? asked : suggestedDebtBudget(debts, p.today, surplus);
  const c = compareDebtPlans(debts, budget, p.today);
  const plan = (x: typeof c.avalancha) => ({
    sale_en: x.end ? f.month(x.end) : f.label("más de 10 años"),
    meses: x.months != null ? f.count(x.months, "mes", "meses") : f.label("más de 120 meses"),
    intereses_estimados: f.ars(x.interest),
    orden: x.order.map((id) => debts.find((dd) => dd.cardId === id)?.name ?? id),
    ...(x.shortFrom ? { no_alcanza_desde: f.month(x.shortFrom) } : {}),
  });
  const data = {
    presupuesto_por_mes: f.ars(c.budget),
    presupuesto_sugerido_por_cifra: asked <= 0,
    obligatorio_este_mes: f.ars(c.mandatory),
    deudas: debts.map((dd) => ({
      tarjeta: dd.name,
      saldo: f.ars(dd.balance),
      ...(dd.tna > 0 ? { tna: f.rate(dd.tna) } : { tna: "sin cargar" }),
      vencido: dd.overdue,
      cuotas_que_siguen: f.ars(dd.cuotasTotal),
    })),
    avalancha: plan(c.avalancha),
    bola_de_nieve: plan(c.bola),
    solo_minimo: plan(c.minimo),
    las_dos_estrategias_son_iguales: c.same,
    ...(c.avalanchaSaves > 0 ? { avalancha_ahorra: f.ars(c.avalanchaSaves) } : {}),
    ...(c.missingTna.length ? { tarjetas_sin_tna: c.missingTna } : {}),
  };
  const out = (end: string | null | undefined) => (end ? monthLabel(end) : "en más de 10 años");
  const summary = textLines([
    `Pagando ${ars(c.budget)} por mes:`,
    `- Avalancha: salís en ${out(c.avalancha.end)}, con unos ${ars(c.avalancha.interest)} de intereses`,
    `- Bola de nieve: salís en ${out(c.bola.end)}, con unos ${ars(c.bola.interest)} de intereses`,
    "Son estimados con la TNA de cada tarjeta.",
  ]);
  return { data, summary };
}

// --------------------------------------------------------------- registry

type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (run: ToolRun, args: Record<string, unknown>) => ToolResult;
};

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false };

/** How to do something in the app: where it is and the steps (never invented). */
function funcionesApp(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const tema = typeof args.tema === "string" ? args.tema.slice(0, 200) : "";
  const list = featuresAbout(tema);
  const found = list.length <= 3;
  if (found) for (const f of list) run.links.push(...f.links);
  else run.links.push({ label: "Abrir Contanos", action: "contanos" });
  return {
    data: {
      funciones: list.map((f) =>
        found
          ? { nombre: f.name, donde: f.where, como: f.how }
          : { nombre: f.name, donde: f.where },
      ),
      regla:
        "Usá estas rutas tal cual. Si lo que preguntan no está en la lista, no digas que no existe ni que no se puede: decí que no estás seguro y que lo pueden pedir en Más → Contanos.",
    },
    summary: found ? list.map((f) => f.how).join("\n\n") : UNSURE_TEXT,
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: "resumen_mes",
    description: "Ingresos, gasto, categorías y topes de un mes (por defecto el actual).",
    parameters: {
      type: "object",
      properties: { mes: { type: "string", description: "YYYY-MM" } },
      additionalProperties: false,
    },
    run: resumenMes,
  },
  {
    name: "tendencia_categoria",
    description: "Gasto de una categoría en los últimos meses.",
    parameters: {
      type: "object",
      properties: {
        categoria: { type: "string" },
        meses: { type: "integer", minimum: 1, maximum: 6 },
      },
      required: ["categoria"],
      additionalProperties: false,
    },
    run: tendenciaCategoria,
  },
  {
    name: "tarjetas",
    description: "Cada tarjeta: a pagar, vencimiento, mínimo, próximo resumen y límite.",
    parameters: NO_ARGS,
    run: (r) => tarjetas(r),
  },
  {
    name: "proximos",
    description: "Vencimientos de tarjeta y fijos de los próximos días.",
    parameters: {
      type: "object",
      properties: { dias: { type: "integer", minimum: 1, maximum: 45 } },
      additionalProperties: false,
    },
    run: proximos,
  },
  {
    name: "metas",
    description: "Metas: cuánto falta, cuánto les toca por mes y si llegan.",
    parameters: NO_ARGS,
    run: (r) => metas(r),
  },
  {
    name: "plan_mes",
    description:
      "Plan de un mes normal: entra, comprometido, metas, si cierra, topes sugeridos y propuestas.",
    parameters: NO_ARGS,
    run: (r) => planMes(r),
  },
  {
    name: "simular",
    description:
      "¿Y si…? compra en cuotas, gasto grande o cambio de sueldo: cajas, metas y límite. No guarda nada.",
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["cuotas", "gasto", "sueldo"] },
        monto: {
          type: "number",
          description: "Pesos. En cuotas sin interés: el precio; con interés: cada cuota.",
        },
        cuotas: { type: "integer", minimum: 1, maximum: 72 },
        sin_interes: { type: "boolean" },
        tarjeta: { type: "string" },
        caja: { type: "string" },
        baja: { type: "boolean", description: "sueldo: true si baja" },
        que: { type: "string", description: "Qué se compra, 1-3 palabras" },
      },
      required: ["tipo", "monto"],
      additionalProperties: false,
    },
    run: simular,
  },
  {
    name: "plan_deuda",
    description:
      "Salir de la deuda de tarjeta: avalancha vs bola de nieve vs mínimo, con fecha e intereses.",
    parameters: {
      type: "object",
      properties: { presupuesto: { type: "number", description: "Pesos por mes" } },
      additionalProperties: false,
    },
    run: planDeuda,
  },
  {
    name: "funciones_app",
    description:
      "Cómo hacer algo en Cifra: dónde está cada función (importar el resumen PDF, tarjetas, cuotas, fijos, metas, presupuestos, simulador, plan de deudas, avisos por mail, Contanos, copia de seguridad…) y los pasos. Usala siempre que pregunten cómo, dónde o si la app tiene algo.",
    parameters: {
      type: "object",
      properties: { tema: { type: "string", description: "Qué quieren hacer, en pocas palabras" } },
      required: ["tema"],
      additionalProperties: false,
    },
    run: funcionesApp,
  },
];

export const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

/** Run one tool. Unknown tools and bad arguments come back as an error, never throw. */
export function runTool(
  run: ToolRun,
  name: string,
  args: unknown,
): ToolResult & { valores: Record<string, string> } {
  const def = TOOLS.find((t) => t.name === name);
  const from = run.facts.cursor;
  let result: ToolResult;
  try {
    result = def
      ? def.run(
          run,
          args && typeof args === "object" && !Array.isArray(args)
            ? (args as Record<string, unknown>)
            : {},
        )
      : { data: { error: `No existe la herramienta ${name}.` }, summary: "" };
  } catch {
    result = { data: { error: "No pude calcular eso." }, summary: "" };
  }
  if (result.summary) run.summaries.push(result.summary);
  return { ...result, valores: run.facts.since(from) };
}
