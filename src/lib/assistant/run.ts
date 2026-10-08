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

export type Chip = {
  id: string;
  text: string;
  tools: [string, Record<string, unknown>][];
  /** Units of the daily cap (chat = 1, informe = 2). */
  units: number;
  maxTokens?: number;
};

export const CHIPS: Chip[] = [
  { id: "tarjeta", text: "¿Cuánto pago de tarjeta este mes?", tools: [["tarjetas", {}]], units: 1 },
  { id: "plan", text: "Armame el plan del mes", tools: [["plan_mes", {}]], units: 1 },
  { id: "metas", text: "¿Llego con mis metas?", tools: [["metas", {}]], units: 1 },
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
  },
];

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
  const add = (body: unknown) => {
    const u = usageOf(body);
    usage.input += u.input;
    usage.output += u.output;
  };
  const done = (a: Answer): AssistantReply => ({ ...a, modelCalls, usage });
  const base: LlmMessage[] = [
    { role: "system", content: systemPrompt(input.data.plan.today) },
    ...historyMessages(input.history),
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
    if (direct) return done(finalAnswer(direct.args, run, input.message));
    return done(templateAnswer(run, "sin herramientas"));
  }
  const ran = wanted.map((c) => {
    const r = runTool(run, c.name, c.args);
    return { id: c.id, name: c.name, args: c.args, result: { ...r.data, valores: r.valores } };
  });
  modelCalls++;
  const second = await input.call((p) =>
    toolBody(p, { messages: [...base, ...toolTurn(ran)], force: "responder" }),
  );
  if (!second.ok) return done(templateAnswer(run, `modelo: ${second.failure}`));
  add(second.body);
  const reply = toolCalls(second.body).find((c) => c.name === "responder");
  return done(finalAnswer(reply?.args, run, input.message));
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
