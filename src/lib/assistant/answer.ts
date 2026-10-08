/**
 * The model's final answer (§2.7): the forced `responder` tool. Cifra checks it
 * and fills it: the model never writes a number, it writes {f3} for a value a
 * tool returned. Any other number, $, % or number word in the text (that the
 * user did not write) rejects the answer, and Cifra shows its own template
 * with the tools' numbers instead. No retry: that would cost twice. Pure.
 */
import type { Proposal, ToolRun } from "./tools.ts";

export const RESPONDER = {
  name: "responder",
  description: "Respuesta final al usuario. Siempre terminá con esta herramienta.",
  parameters: {
    type: "object",
    properties: {
      texto: { type: "string", description: "Hasta 120 palabras. Números solo como {f1}." },
      propuestas: {
        type: "array",
        items: { type: "string" },
        description: "ids p1, p2… de las herramientas",
      },
      seguir: {
        type: "array",
        items: { type: "string" },
        description: "Hasta 3 preguntas cortas, sin números",
      },
    },
    required: ["texto", "propuestas", "seguir"],
    additionalProperties: false,
  },
} as const;

export type Answer = {
  text: string;
  proposals: Proposal[];
  followUps: string[];
  /** "ia": the model's text, checked. "plantilla": Cifra's own text (model failed or was rejected). */
  source: "ia" | "plantilla";
  /** Why the model's answer was not used (for logs/tests, never shown). */
  reason?: string;
};

const MARKER = /\{(f\d+)\}/g;
const NUMBER = /\d+(?:[.,]\d+)*/g;
const NUMBER_WORDS =
  /\b(mil|miles|mill[oó]n|millones|palos?|lucas?|cien|ciento|cientos|doscient\w*|trescient\w*|cuatrocient\w*|quinient\w*|seiscient\w*|setecient\w*|ochocient\w*|novecient\w*|veinte|veinti\w+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|por ciento)\b/gi;

function numbersIn(s: string) {
  return new Set((s.match(NUMBER) ?? []).map((n) => n.replace(/[.,]/g, "")));
}

function wordsIn(s: string) {
  return new Set((s.match(NUMBER_WORDS) ?? []).map((w) => w.toLowerCase()));
}

/**
 * Check one piece of model text against the facts and the user's message.
 * Returns the text with the values in place, or why it was rejected.
 */
export function checkText(
  raw: string,
  run: Pick<ToolRun, "facts">,
  userMessage: string,
): { ok: true; text: string } | { ok: false; reason: string } {
  let text = raw.replace(/\r/g, "").trim();
  if (!text) return { ok: false, reason: "vacío" };
  for (const m of text.matchAll(MARKER)) {
    if (!run.facts.has(m[1]!)) return { ok: false, reason: `dato desconocido ${m[1]}` };
  }
  // "$ {f1}" or "{f2} %" when the value already carries the sign.
  text = text
    .replace(/(?:US)?\$\s*(\{f\d+\})/g, (all, mk: string) =>
      /^(US)?\$/.test(run.facts.get(mk.slice(1, -1)) ?? "") ? mk : all,
    )
    .replace(/(\{f\d+\})\s*%/g, (all, mk: string) =>
      (run.facts.get(mk.slice(1, -1)) ?? "").endsWith("%") ? mk : all,
    );
  const bare = text.replace(MARKER, " ");
  const allowed = numbersIn(userMessage);
  for (const n of bare.match(NUMBER) ?? []) {
    if (!allowed.has(n.replace(/[.,]/g, "")))
      return { ok: false, reason: `número sin fuente ${n}` };
  }
  if (/[$%]/.test(bare) && !/[$%]/.test(userMessage))
    return { ok: false, reason: "signo sin fuente" };
  const words = wordsIn(userMessage);
  for (const w of bare.match(NUMBER_WORDS) ?? []) {
    if (!words.has(w.toLowerCase())) return { ok: false, reason: `número en palabras ${w}` };
  }
  if (bare.split(/\s+/).length > 220) return { ok: false, reason: "muy largo" };
  return { ok: true, text: text.replace(MARKER, (_, id: string) => run.facts.get(id) ?? "") };
}

const DEFAULT_FOLLOW_UPS = [
  "¿Cuánto pago de tarjeta este mes?",
  "¿Llego con mis metas?",
  "Armame el plan del mes",
];

/** Cifra's own answer from the tools' summaries (no model text). */
export function templateAnswer(run: ToolRun, reason: string, note = ""): Answer {
  const body = run.summaries.join("\n\n").trim();
  return {
    text: [note, body || "No pude armar la respuesta. Probá de nuevo en un rato."]
      .filter(Boolean)
      .join("\n\n"),
    proposals: run.proposals.slice(0, 3),
    followUps: DEFAULT_FOLLOW_UPS,
    source: "plantilla",
    reason,
  };
}

/** Parse, check and fill the `responder` arguments; template if anything is off. */
export function finalAnswer(args: unknown, run: ToolRun, userMessage: string): Answer {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  if (typeof a.texto !== "string") return templateAnswer(run, "esquema");
  const checked = checkText(a.texto, run, userMessage);
  if (!checked.ok) return templateAnswer(run, checked.reason);
  const ids = Array.isArray(a.propuestas)
    ? a.propuestas.filter((x): x is string => typeof x === "string")
    : [];
  const proposals = [...new Set(ids)]
    .map((id) => run.proposals.find((p) => p.id === id))
    .filter((p): p is Proposal => Boolean(p))
    .slice(0, 3);
  const followUps = (Array.isArray(a.seguir) ? a.seguir : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x && x.length <= 90 && !/\{f\d+\}/.test(x) && checkText(x, run, userMessage).ok)
    .slice(0, 3);
  return { text: checked.text, proposals, followUps, source: "ia" };
}
