/**
 * What each AI call costs (pure, no I/O) and the global daily cap that keeps
 * Cifra inside the AI Gateway free credit. Only metadata: never prompts,
 * answers or the user's amounts.
 */
import type { AiProvider, Failure } from "./ai-provider.ts";

/** Which feature called the model. */
export type AiKind = "asistente" | "informe" | "pdf" | "movimiento";
/**
 * ok = the model answered and it was used; plantilla = it answered but Cifra
 * showed its own template (the check rejected the text); 429 = rate limited;
 * credito = out of credit; timeout / error = no answer; tope = not called
 * because the global daily cap was reached.
 */
export type AiResult = "ok" | "plantilla" | "429" | "credito" | "timeout" | "error" | "tope";

export type AiCallLog = {
  kind: AiKind;
  provider: AiProvider["id"] | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** "gateway" = the Gateway's own `usage.cost`; "tabla" = PRICES below. */
  costSource: "gateway" | "tabla" | null;
  latencyMs: number;
  result: AiResult;
};

/**
 * USD per million tokens [input, output], checked on 8 oct 2026.
 * - spacexai/grok-4.1-fast-*: AI Gateway model list
 *   (https://ai-gateway.vercel.sh/v1/models → pricing: 0.0000002 / 0.0000005 per token).
 * - openai/gpt-oss-120b on Groq: https://console.groq.com/docs/model/openai/gpt-oss-120b
 *   ($0.15 / $0.60). On the Gateway: $0.10 / $0.50 (same model list).
 * Only used when the provider does not say what the call cost.
 */
export const PRICES: Record<string, [number, number]> = {
  "gateway:spacexai/grok-4.1-fast-non-reasoning": [0.2, 0.5],
  "gateway:spacexai/grok-4.1-fast-reasoning": [0.2, 0.5],
  "gateway:xai/grok-4.1-fast-non-reasoning": [0.2, 0.5],
  "gateway:openai/gpt-oss-120b": [0.1, 0.5],
  "groq:openai/gpt-oss-120b": [0.15, 0.6],
};
/** Unknown model: price it high on purpose so the cap errs on the safe side. */
export const UNKNOWN_PRICE: [number, number] = [3, 15];

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Tokens and the Gateway's reported cost (`usage.cost`, or `providerMetadata.gateway.cost`). */
export function usageFromBody(body: unknown): {
  input: number;
  output: number;
  cost: number | null;
} {
  const b = (body ?? {}) as {
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown };
    providerMetadata?: { gateway?: { cost?: unknown } };
  };
  return {
    input: Math.round(num(b.usage?.prompt_tokens) ?? 0),
    output: Math.round(num(b.usage?.completion_tokens) ?? 0),
    cost: num(b.usage?.cost) ?? num(b.providerMetadata?.gateway?.cost),
  };
}

export function estimateUsd(
  provider: string,
  model: string,
  input: number,
  output: number,
): number {
  const [i, o] = PRICES[`${provider}:${model}`] ?? UNKNOWN_PRICE;
  return (input * i + output * o) / 1_000_000;
}

export function resultOfFailure(f: Failure): AiResult {
  if (f === "busy") return "429";
  if (f === "credit") return "credito";
  if (f === "timeout") return "timeout";
  return "error";
}

/** One call's log line, from the provider's answer (or failure). */
export function callLog(
  kind: AiKind,
  p: Pick<AiProvider, "id" | "model">,
  outcome: { ok: true; body: unknown } | { ok: false; failure: Failure },
  latencyMs: number,
): AiCallLog {
  const u = outcome.ok ? usageFromBody(outcome.body) : { input: 0, output: 0, cost: null };
  const fromGateway = p.id === "gateway" && u.cost !== null;
  const costUsd = fromGateway ? u.cost! : estimateUsd(p.id, p.model, u.input, u.output);
  return {
    kind,
    provider: p.id,
    model: p.model.slice(0, 80),
    inputTokens: u.input,
    outputTokens: u.output,
    costUsd,
    costSource: u.input || u.output || fromGateway ? (fromGateway ? "gateway" : "tabla") : null,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    result: outcome.ok ? "ok" : resultOfFailure(outcome.failure),
  };
}

/** A request that never reached the model because the global cap was reached. */
export function capLog(kind: AiKind): AiCallLog {
  return {
    kind,
    provider: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    costSource: null,
    latencyMs: 0,
    result: "tope",
  };
}

/**
 * Global daily cap for the whole app, in USD. The AI Gateway free tier gives
 * $5 of credit per month (https://vercel.com/docs/ai-gateway/pricing, "Free
 * and paid tiers": "Monthly credit: $5/month included"). $5 / 30 ≈ $0.167 a
 * day; the default keeps ~30 % margin: $0.12 × 30 = $3.60 a month.
 * `AI_GLOBAL_DAILY_USD` can lower it (0 = AI off for everyone), never raise it
 * above MAX_AI_GLOBAL_DAILY_USD, so a typo cannot burn the free credit. Cifra
 * never buys credits: if the free credit runs out, the Gateway says so and
 * the assistant falls back to its template.
 */
export const DEFAULT_AI_GLOBAL_DAILY_USD = 0.12;
export const MAX_AI_GLOBAL_DAILY_USD = 0.16;

export function aiGlobalDailyUsd(raw: string | undefined): number {
  const s = String(raw ?? "").trim();
  const n = s ? Number(s.replace(",", ".")) : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return DEFAULT_AI_GLOBAL_DAILY_USD;
  return Math.min(n, MAX_AI_GLOBAL_DAILY_USD);
}

export const AI_GLOBAL_CAP =
  "Hoy el asistente ya usó todo lo que Cifra tiene para la IA por día (es gratis y tiene un tope). Mañana vuelve.";
export const AI_GLOBAL_CAP_NOTE =
  "Hoy el asistente descansa: Cifra llegó a su tope diario de IA. Mientras, estos son los números de Cifra:";
export const PDF_GLOBAL_CAP =
  "Hoy no puedo leer más resúmenes: Cifra llegó a su tope diario de IA (es gratis y tiene un tope). Mañana se renueva; mientras, podés cargar los movimientos a mano.";

/** Days of ai_call_log kept. */
export const AI_LOG_DAYS = 90;

/** The only account that sees /costos (already public in mail-drill.ts). */
export const OWNER_EMAIL = "iraoladamian@gmail.com";

export function isOwner(email: unknown, verified: unknown): boolean {
  return (
    verified === true &&
    String(email ?? "")
      .trim()
      .toLowerCase() === OWNER_EMAIL
  );
}

export type CostRow = {
  kind: string;
  result: string;
  n: number;
  usd: number;
  input: number;
  output: number;
};
export type CostSummary = {
  usd: number;
  calls: number;
  blocked: number;
  input: number;
  output: number;
  byKind: { kind: string; calls: number; usd: number }[];
  byResult: { result: string; n: number }[];
};

/** Rows grouped by (kind, result) → totals for the owner's view. "tope" rows are not calls. */
export function costSummary(rows: CostRow[]): CostSummary {
  const kinds = new Map<string, { calls: number; usd: number }>();
  const results = new Map<string, number>();
  const out = { usd: 0, calls: 0, blocked: 0, input: 0, output: 0 };
  for (const r of rows) {
    const n = Number(r.n) || 0;
    const usd = Number(r.usd) || 0;
    results.set(r.result, (results.get(r.result) ?? 0) + n);
    if (r.result === "tope") {
      out.blocked += n;
      continue;
    }
    out.calls += n;
    out.usd += usd;
    out.input += Number(r.input) || 0;
    out.output += Number(r.output) || 0;
    const k = kinds.get(r.kind) ?? { calls: 0, usd: 0 };
    k.calls += n;
    k.usd += usd;
    kinds.set(r.kind, k);
  }
  return {
    ...out,
    byKind: [...kinds].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.usd - a.usd),
    byResult: [...results].map(([result, n]) => ({ result, n })).sort((a, b) => b.n - a.n),
  };
}

/** First day of the Buenos Aires month of `day` ("2026-10-08" → "2026-10-01"). */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** "2026-10-08" minus 29 days → "2026-09-09" (calendar days, no time zone). */
export function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
