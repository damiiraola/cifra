/**
 * Where the assistant's questions go (pure logic, no I/O — see ai.ts).
 *
 * 1. Vercel AI Gateway (OpenAI-compatible). Auth: `AI_GATEWAY_API_KEY` if set,
 *    otherwise the Vercel OIDC token every Vercel Function receives
 *    (`x-vercel-oidc-token` header / `VERCEL_OIDC_TOKEN`). Every request asks the
 *    Gateway to route only to providers that do not train on prompts.
 * 2. Groq, only if `GROQ_API_KEY` is set: used when the Gateway is missing or
 *    fails (out of free credit, rate limited, down).
 */

export const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** Free-tier model on the Gateway: Grok, cheap, no training, zero retention. */
export const DEFAULT_AI_MODEL = "spacexai/grok-4.1-fast-non-reasoning";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export const AI_UNAVAILABLE = "El asistente todavía no está disponible. Lo estamos activando.";
export const AI_TIMEOUT = "El asistente no respondió a tiempo. Probá de nuevo.";
export const AI_OUT_OF_CREDIT = "El asistente llegó al límite gratis de este mes. Se renueva el mes que viene.";
export const AI_BUSY = "El asistente está con mucha demanda. Esperá un minuto y probá de nuevo.";

export type AiMode = "chat" | "parse" | "report";
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiProvider = {
  id: "gateway" | "groq";
  url: string;
  token: string;
  model: string;
  /** How the Gateway was authenticated (for logs only, never the token). */
  auth?: "api-key" | "oidc";
};

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => (v ?? "").trim();

/** Providers to try, in order. Empty = assistant off. */
export function aiProviders(env: Env, oidcToken?: string | null): AiProvider[] {
  const out: AiProvider[] = [];
  const key = clean(env.AI_GATEWAY_API_KEY);
  const oidc = clean(oidcToken ?? undefined) || clean(env.VERCEL_OIDC_TOKEN);
  if (key || oidc) {
    out.push({
      id: "gateway",
      url: GATEWAY_URL,
      token: key || oidc,
      model: clean(env.AI_MODEL) || DEFAULT_AI_MODEL,
      auth: key ? "api-key" : "oidc",
    });
  }
  const groq = clean(env.GROQ_API_KEY);
  if (groq) {
    out.push({ id: "groq", url: GROQ_URL, token: groq, model: clean(env.GROQ_MODEL) || DEFAULT_GROQ_MODEL });
  }
  return out;
}

const METHODS = ["efectivo", "debito", "credito", "transferencia", "mercadopago", "crypto", "otro"];

/** JSON schema for "parse" (one movement). Strict: every field required. */
export function parseSchema(categoryIds: string[]) {
  const ids = [...new Set(categoryIds.filter(Boolean))];
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "amount", "currency", "categoryId", "merchant", "note", "date", "method"],
    properties: {
      type: { type: "string", enum: ["expense", "income"] },
      amount: { type: "number" },
      currency: { type: "string", enum: ["ARS", "USD", "USDT"] },
      categoryId: ids.length ? { type: "string", enum: ids } : { type: "string" },
      merchant: { type: "string" },
      note: { type: "string" },
      date: { type: ["string", "null"], description: "YYYY-MM-DD, o null si no dice fecha" },
      method: { type: "string", enum: METHODS },
    },
  };
}

/** OpenAI-compatible request body for one provider. */
export function requestBody(
  provider: AiProvider,
  opts: { mode: AiMode; messages: ChatMessage[]; categoryIds?: string[] },
) {
  const parse = opts.mode === "parse";
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: opts.messages,
    max_tokens: parse ? 400 : 900,
    temperature: parse ? 0.1 : 0.5,
  };
  if (parse) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "movimiento", strict: true, schema: parseSchema(opts.categoryIds ?? []) },
    };
  }
  if (provider.id === "gateway") {
    // Only providers that do not use prompts for training (free, every plan).
    body.providerOptions = { gateway: { disallowPromptTraining: true } };
  }
  if (provider.id === "groq" && /gpt-oss/.test(provider.model)) {
    // gpt-oss thinks before answering; keep it short so it fits max_tokens.
    body.reasoning_effort = "low";
    body.max_tokens = parse ? 1200 : 2000;
  }
  return body;
}

export type Failure = "credit" | "busy" | "auth" | "timeout" | "other";

/** What a non-2xx answer means. 402 / "credit"/"quota" text = out of credit. */
export function classifyFailure(status: number, bodyText = ""): Failure {
  if (status === 402) return "credit";
  if (status === 429) return /credit|quota|insufficient|balance|budget/i.test(bodyText) ? "credit" : "busy";
  if (status === 401 || status === 403) return "auth";
  if (status === 408 || status === 504) return "timeout";
  return "other";
}

/** Message for the user after every provider failed (the last failure wins). */
export function failureMessage(f: Failure | null): string {
  switch (f) {
    case "credit":
      return AI_OUT_OF_CREDIT;
    case "busy":
      return AI_BUSY;
    case "auth":
      return AI_UNAVAILABLE;
    default:
      return AI_TIMEOUT;
  }
}

/** Text of the first choice of an OpenAI-compatible response, or "". */
export function responseText(body: unknown): string {
  const b = body as { choices?: { message?: { content?: unknown } }[] } | null;
  const c = b?.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : "";
}

const MODEL_OWNERS: Record<string, string> = {
  spacexai: "xAI (Grok)",
  xai: "xAI (Grok)",
  openai: "OpenAI",
  google: "Google",
  mistral: "Mistral",
  meta: "Meta",
  alibaba: "Alibaba",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
};

/** "spacexai/grok-…" → "xAI (Grok)", for the privacy page. */
export function modelOwner(model: string): string {
  const prefix = model.split("/")[0]?.toLowerCase() ?? "";
  return MODEL_OWNERS[prefix] ?? (prefix || model);
}

/** Who processes assistant questions (names only, no secrets). */
export function processorsFor(providers: AiProvider[]) {
  const gw = providers.find((p) => p.id === "gateway");
  return { gateway: gw ? modelOwner(gw.model) : null, groq: providers.some((p) => p.id === "groq") };
}
