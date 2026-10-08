/**
 * OpenAI-compatible tool calling for the assistant (pure: bodies, prompt,
 * parsing). Same providers as the rest of the AI (Gateway with
 * disallowPromptTraining, Groq as optional fallback).
 */
import type { AiProvider } from "../ai-provider.ts";
import { RESPONDER } from "./answer.ts";
import { TOOLS } from "./tools.ts";
import { dayLabel } from "./facts.ts";

export type ToolCall = { id: string; name: string; args: unknown };
export type LlmMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export function systemPrompt(today: string) {
  return `Sos el asistente de Cifra, una app para ordenar la plata. Español rioplatense, claro y breve, sin emojis ni jerga.
La app calcula, vos explicás. Nunca escribas números: ni montos, ni porcentajes, ni fechas, ni años, ni cantidades. Cada número sale de una herramienta: escribí su id entre llaves, por ejemplo {f3}, y Cifra pone el valor. Si te falta un dato, llamá a la herramienta. No hagas cuentas.
Si una herramienta devolvió propuestas (p1, p2…) que sirven para lo que preguntan, ponelas en propuestas: el usuario las confirma con un botón. Vos no cambiás nada.
Terminá siempre con la herramienta responder. texto: hasta 120 palabras. seguir: hasta 3 preguntas cortas que el usuario podría hacer, sin números.
Formato para leer en el celular: arrancá con una frase con la conclusión. Si hay varios números, ponelos en una lista: una línea por dato, que empiece con "- " y diga "Etiqueta: {f3}". Frases cortas, sin títulos, tablas, negritas ni emojis.
Los valores ya traen su unidad ("12 cuotas", "15 de enero de 2027", "mayo 2028"): no la repitas alrededor del {f3}. Nunca hables de montos negativos: si algo falta, decí "te faltan {f3}".
Sin consejos de inversión puntuales ni ilegales. Hoy es ${dayLabel(today)}.`;
}

export function toolSpecs(only?: string[]) {
  const defs = [...TOOLS.filter((t) => !only || only.includes(t.name)), RESPONDER];
  return defs.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function toolBody(
  provider: AiProvider,
  opts: { messages: LlmMessage[]; force?: "responder"; maxTokens?: number },
) {
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: opts.messages,
    tools: toolSpecs(),
    tool_choice: opts.force ? { type: "function", function: { name: opts.force } } : "required",
    parallel_tool_calls: true,
    max_tokens: opts.maxTokens ?? 450,
    temperature: 0.3,
  };
  if (provider.id === "gateway")
    body.providerOptions = { gateway: { disallowPromptTraining: true } };
  if (provider.id === "groq" && /gpt-oss/.test(provider.model)) {
    body.reasoning_effort = "low";
    body.max_tokens = 1600;
  }
  return body;
}

/** Tool calls of the first choice; arguments parsed (null when not JSON). */
export function toolCalls(body: unknown): ToolCall[] {
  const b = body as { choices?: { message?: { tool_calls?: unknown } }[] } | null;
  const raw = b?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(raw)) return [];
  const out: ToolCall[] = [];
  for (const c of raw) {
    const fn = (c as { function?: { name?: unknown; arguments?: unknown } })?.function;
    if (!fn || typeof fn.name !== "string") continue;
    let args: unknown = null;
    if (typeof fn.arguments === "string") {
      try {
        args = fn.arguments.trim() ? JSON.parse(fn.arguments) : {};
      } catch {
        args = null;
      }
    } else if (fn.arguments && typeof fn.arguments === "object") args = fn.arguments;
    const id =
      typeof (c as { id?: unknown }).id === "string"
        ? (c as { id: string }).id
        : `call_${out.length + 1}`;
    out.push({ id, name: fn.name, args });
  }
  return out;
}

export function usageOf(body: unknown): { input: number; output: number } {
  const u = (body as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)
    ?.usage;
  return { input: Number(u?.prompt_tokens) || 0, output: Number(u?.completion_tokens) || 0 };
}

/** Earlier turns, short, with the numbers of past answers blanked (they must come from tools again). */
export function historyMessages(
  history: { role: "user" | "assistant"; content: string }[],
): LlmMessage[] {
  return history.slice(-4).map((h) => ({
    role: h.role,
    content: (h.role === "assistant"
      ? h.content.replace(/(?:(?:US)?\$\s?)?\d(?:[\d.,]*\d)?%?/g, "[dato]")
      : h.content
    ).slice(0, 300),
  })) as LlmMessage[];
}

/** The assistant message + tool messages for calls Cifra already ran. */
export function toolTurn(
  calls: { id: string; name: string; args: unknown; result: unknown }[],
): LlmMessage[] {
  return [
    {
      role: "assistant",
      content: null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
      })),
    },
    ...calls.map((c) => ({
      role: "tool" as const,
      tool_call_id: c.id,
      content: JSON.stringify(c.result),
    })),
  ];
}
