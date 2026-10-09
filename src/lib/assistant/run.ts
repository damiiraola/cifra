/**
 * One question to the assistant (§2.7), with the model injected so it can be
 * tested without spending tokens:
 *
 * - Chip: Cifra runs the chip's tools itself and calls the model once, forced
 *   to `responder`, with the results attached.
 * - Free text: one round of tools (up to 3, in parallel) and the answer: at
 *   most two model calls.
 * - No model (assistant off, daily cap reached): chips still answer with
 *   Cifra's template. Pure apart from the injected call.
 */
import type { AiProvider, Failure } from "../ai-provider.ts";
import { finalAnswer, templateAnswer, type Answer } from "./answer.ts";
import {
  historyMessages,
  systemPrompt,
  toolBody,
  toolCalls,
  toolTurn,
  usageOf,
  type LlmMessage,
} from "./llm.ts";
import { runTool, TOOL_NAMES, ToolRun, type AssistantData } from "./tools.ts";
import {
  deniesFeature,
  guideAnswer,
  isAppQuestion,
  UNSURE_LINKS,
  UNSURE_TEXT,
  type GuideLink,
} from "./app-guide.ts";

export type Chip = {
  id: string;
  text: string;
  tools: [string, Record<string, unknown>][];
  /** Units of the daily cap (chat = 1, informe = 2). */
  units: number;
  maxTokens?: number;
  /** How to lay out this answer (added to the system prompt). */
  guide?: string;
};

export const CHIPS: Chip[] = [
  {
    id: "tarjeta",
    text: "¿Cuánto pago de tarjeta este mes?",
    tools: [["tarjetas", {}]],
    units: 1,
    guide:
      'Formato: una frase por tarjeta con cuánto pagar y hasta cuándo. Después una lista: "- Mínimo:" con el id de minimo, solo si esa tarjeta tiene minimo, y "- Próximo resumen, cargado hasta hoy:" con el id de total_cargado_hasta_hoy. Ese total no es un mínimo: nunca lo llames así.',
  },
  {
    id: "plan",
    text: "Armame el plan del mes",
    tools: [["plan_mes", {}]],
    units: 1,
    guide:
      'Formato: primero una frase con la conclusión: si el mes cierra y cuánto sobra, o si no cierra y cuánto falta. Después una lista con Entra, Fijos, Tarjetas, Metas (el total por mes) y Día a día (el id de dia_a_dia, que ya dice "quedan" o "faltan"). Después la línea "Topes sugeridos:" y una línea por tope: "- " más la categoría, dos puntos y el id de su tope. Al final una frase con cuánto liberan los topes. Nada más.',
  },
  {
    id: "metas",
    text: "¿Llego con mis metas?",
    tools: [["metas", {}]],
    units: 1,
    guide:
      'Formato: arrancá con el id de conclusion tal cual, sin nada antes y sin decirlo con otras palabras y cuánto sobra por mes, sin mezclar compras que se simularon antes. Después una línea por meta, "- " más el nombre y dos puntos: "llega a tiempo", o "llegaría en" más el mes en que llegaría con lo que sobra y "; a tiempo necesita" más el id y "por mes". Si no le toca nada de lo que sobra, decilo así. Sin "no;" ni fechas sueltas.',
  },
  {
    id: "gasto",
    text: "¿Dónde más estoy gastando este mes?",
    tools: [["resumen_mes", {}]],
    units: 1,
  },
  {
    id: "proximos",
    text: "¿Qué vence en los próximos días?",
    tools: [["proximos", { dias: 15 }]],
    units: 1,
  },
  {
    id: "deuda",
    text: "¿Cómo salgo de la deuda de la tarjeta?",
    tools: [["plan_deuda", {}]],
    units: 1,
  },
  {
    id: "informe",
    text: "Informe del mes",
    tools: [
      ["resumen_mes", {}],
      ["plan_mes", {}],
      ["tarjetas", {}],
    ],
    units: 2,
    maxTokens: 600,
    guide:
      'Formato: una frase con la conclusión del mes. Después tres bloques cortos, cada uno con una línea que termina en ":" y una lista: "Este mes:" (entró, gastaste, si seguís así), "Plan:" (una sola línea: "- Mes: cierra, sobran" o "- Mes: no cierra, faltan" más el id de sobra o falta) y "Tarjetas:" (a pagar y vencimiento). Cada línea de cada lista en su propio renglón. Breve.',
  },
];

/**
 * Free text has no chip: when the model asked for a single tool, the second
 * call gets the layout for that tool (the same as its chip, or its own).
 */
const TOOL_GUIDES: Record<string, string> = {
  funciones_app:
    'Formato: una frase con dónde está, con la ruta tal cual ("Más → Tarjetas → «Importar resumen PDF»"), y después los pasos en frases cortas. Si funciones_app no tiene lo que preguntan, decí que no estás seguro y mandá a Más → Contanos. Nunca digas que no existe.',
  simular:
    'Formato: una frase corta con la conclusión (si entra en el plan o no, en palabras simples). Después una lista, una línea por dato con "- Etiqueta: " y el id: la cuota, la primera, la última, el total, lo que queda libre en la tarjeta, lo que sobra por mes (antes y después), cada meta que cambia y el mes más justo. Nada más.',
};

export function toolGuide(names: string[]): string | null {
  const unique = [...new Set(names)];
  if (unique.length !== 1) return null;
  const name = unique[0]!;
  return (
    TOOL_GUIDES[name] ??
    CHIPS.find((c) => c.tools.length === 1 && c.tools[0]![0] === name)?.guide ??
    null
  );
}

export function chipById(id: unknown): Chip | null {
  return CHIPS.find((c) => c.id === id) ?? null;
}

export type ModelCall = (
  build: (p: AiProvider) => Record<string, unknown>,
) => Promise<{ ok: true; body: unknown } | { ok: false; failure: Failure }>;

export type AssistantReply = Answer & {
  modelCalls: number;
  usage: { input: number; output: number };
};

export const MAX_TOOLS_PER_TURN = 3;

type CallResult = { ok: true; body: unknown } | { ok: false; failure: Failure };

/**
 * A 429 "busy" (rate limit, not credit) gets one more try after a short wait,
 * if there is time left: a rejected request costs no tokens. Anything else
 * fails right away.
 */
export async function retryWhenBusy(
  attempt: () => Promise<CallResult>,
  opts: {
    deadline: number;
    waitMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<CallResult> {
  const waitMs = opts.waitMs ?? 1_500;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const first = await attempt();
  if (first.ok || first.failure !== "busy" || opts.deadline - now() < waitMs + 5_000) return first;
  await sleep(waitMs);
  return attempt();
}

export async function runAssistant(input: {
  data: AssistantData;
  message: string;
  chip: Chip | null;
  history: { role: "user" | "assistant"; content: string }[];
  /** null = no model: chips get the template, free text gets nothing. */
  call: ModelCall | null;
  /** Shown above the template when there was no model. */
  note?: string;
}): Promise<AssistantReply> {
  const run = new ToolRun(input.data);
  const usage = { input: 0, output: 0 };
  let modelCalls = 0;
  // "¿Cómo subo el resumen?": Cifra knows where everything is; no model.
  const guide = input.chip ? null : guideAnswer(input.message);
  if (guide) {
    return {
      text: guide.text,
      proposals: [],
      followUps: guide.followUps,
      links: guide.links,
      source: "guia",
      modelCalls: 0,
      usage,
    };
  }
  const add = (body: unknown) => {
    const u = usageOf(body);
    usage.input += u.input;
    usage.output += u.output;
  };
  const done = (a: Answer): AssistantReply => ({ ...a, modelCalls, usage });
  /** Free text: carry the app links, and never let the model deny a feature. */
  const checked = (a: Answer): AssistantReply => {
    if (a.source === "ia" && isAppQuestion(input.message) && deniesFeature(a.text)) {
      return done({
        text: UNSURE_TEXT,
        proposals: [],
        followUps: [],
        links: UNSURE_LINKS,
        source: "guia",
        reason: "negó una función",
      });
    }
    return done({ ...a, links: uniqueLinks(run.links) });
  };
  const layoutGuide = input.chip?.guide ? `\n${input.chip.guide}` : "";
  const base: LlmMessage[] = [
    { role: "system", content: systemPrompt(input.data.plan.today) + layoutGuide },
    // A chip is a fixed question with fixed tools: earlier turns (a simulated
    // purchase, say) only confuse it ("sobran $ X después de la tele").
    ...(input.chip ? [] : historyMessages(input.history)),
    { role: "user", content: input.message.slice(0, 600) },
  ];

  if (input.chip) {
    const ran = input.chip.tools.map(([name, args], i) => {
      const r = runTool(run, name, args);
      return { id: `cifra_${i + 1}`, name, args, result: { ...r.data, valores: r.valores } };
    });
    if (!input.call) return done(templateAnswer(run, "sin modelo", input.note));
    const maxTokens = input.chip.maxTokens;
    modelCalls++;
    const r = await input.call((p) =>
      toolBody(p, { messages: [...base, ...toolTurn(ran)], force: "responder", maxTokens }),
    );
    if (!r.ok) return done(templateAnswer(run, `modelo: ${r.failure}`));
    add(r.body);
    const reply = toolCalls(r.body).find((c) => c.name === "responder");
    return done(finalAnswer(reply?.args, run, input.message));
  }

  if (!input.call) return done(templateAnswer(run, "sin modelo", input.note));
  modelCalls++;
  const first = await input.call((p) => toolBody(p, { messages: base }));
  if (!first.ok) return done(templateAnswer(run, `modelo: ${first.failure}`));
  add(first.body);
  const calls = toolCalls(first.body);
  const seen = new Set<string>();
  const wanted = calls
    .filter((c) => TOOL_NAMES.has(c.name))
    .filter((c) => {
      const key = `${c.name}:${JSON.stringify(c.args ?? {})}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TOOLS_PER_TURN);
  const direct = calls.find((c) => c.name === "responder");
  if (!wanted.length) {
    if (direct) return checked(finalAnswer(direct.args, run, input.message));
    return done(templateAnswer(run, "sin herramientas"));
  }
  const ran = wanted.map((c) => {
    const r = runTool(run, c.name, c.args);
    return { id: c.id, name: c.name, args: c.args, result: { ...r.data, valores: r.valores } };
  });
  const layout = toolGuide(ran.map((t) => t.name));
  const withLayout: LlmMessage[] = layout
    ? [{ role: "system", content: `${base[0]!.content}\n${layout}` }, ...base.slice(1)]
    : base;
  modelCalls++;
  const second = await input.call((p) =>
    toolBody(p, { messages: [...withLayout, ...toolTurn(ran)], force: "responder" }),
  );
  if (!second.ok) return checked(templateAnswer(run, `modelo: ${second.failure}`));
  add(second.body);
  const reply = toolCalls(second.body).find((c) => c.name === "responder");
  return checked(finalAnswer(reply?.args, run, input.message));
}

function uniqueLinks(links: GuideLink[]): GuideLink[] {
  const seen = new Set<string>();
  return links
    .filter((l) => {
      const key = "to" in l ? l.to : l.action;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** What the browser may send to the assistant, trimmed. */
export function cleanAssistantInput(raw: unknown) {
  const i = (raw ?? {}) as Record<string, unknown>;
  const chip = chipById(i.chip);
  const message = chip ? chip.text : str(i.message, 600).trim();
  if (!message) throw new Error("Pedido inválido");
  const history = (Array.isArray(i.history) ? i.history : [])
    .filter(
      (h): h is { role: "user" | "assistant"; content: string } =>
        !!h &&
        typeof h === "object" &&
        ((h as { role?: unknown }).role === "user" ||
          (h as { role?: unknown }).role === "assistant") &&
        typeof (h as { content?: unknown }).content === "string",
    )
    .slice(-4)
    .map((h) => ({ role: h.role, content: h.content.slice(0, 300) }));
  return {
    message,
    chip: chip?.id ?? "",
    history,
    bookId: str(i.bookId, 60),
    pending: Array.isArray(i.pending) ? i.pending.slice(-20) : [],
  };
}
