/**
 * Daily cap on assistant questions per user, so one tester (or a stolen
 * session) cannot burn the free AI Gateway credit. Default 30/day; `AI_DAILY_LIMIT`
 * overrides it (0 = assistant off for everyone).
 */
export const DEFAULT_AI_DAILY_LIMIT = 30;

export function aiDailyLimit(raw: string | undefined): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_AI_DAILY_LIMIT;
}

export function aiLimitMessage(limit: number): string {
  return limit === 0
    ? "El asistente está pausado por ahora."
    : `Llegaste al límite de ${limit} usos del asistente por hoy (cada pregunta usa 1 y cada resumen en PDF, 6). Mañana se renueva.`;
}

/** Why a statement PDF cannot be read today (6 units of the daily cap, max 3 PDFs). */
export function pdfLimitMessage(o: { limit: number; used: number; pdfs: number; units: number }): string {
  if (o.limit === 0) return aiLimitMessage(0);
  if (o.pdfs >= 3) return "Ya leíste 3 resúmenes hoy. Mañana podés seguir.";
  const left = Math.max(0, o.limit - o.used);
  return `Leer un resumen usa ${o.units} de tus ${o.limit} usos diarios del asistente y hoy te ${left === 1 ? "queda 1" : `quedan ${left}`}. Mañana se renueva.`;
}

/** Calendar day in Buenos Aires (the cap resets at local midnight). */
export function aiUsageDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const MODES = new Set(["chat", "parse", "report"]);

type Hist = { role: "user" | "assistant"; content: string };
type Cat = { id: string; name: string; kind: string };

/** Validate/trim what the browser sends before it reaches the AI provider. */
export function cleanAskInput(input: unknown): {
  mode: "chat" | "parse" | "report";
  message: string;
  snapshot: string;
  history: Hist[];
  categories: Cat[];
} {
  const i = (input ?? {}) as Record<string, unknown>;
  const mode = typeof i.mode === "string" && MODES.has(i.mode) ? (i.mode as "chat" | "parse" | "report") : null;
  if (!mode) throw new Error("Pedido inválido");
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const history = Array.isArray(i.history)
    ? i.history
        .filter(
          (h): h is Hist =>
            !!h &&
            typeof h === "object" &&
            ((h as Hist).role === "user" || (h as Hist).role === "assistant") &&
            typeof (h as Hist).content === "string",
        )
        .slice(-8)
        .map((h) => ({ role: h.role, content: h.content.slice(0, 1200) }))
    : [];
  const categories = Array.isArray(i.categories)
    ? i.categories
        .filter((c): c is Cat => !!c && typeof c === "object" && typeof (c as Cat).id === "string")
        .slice(0, 80)
        .map((c) => ({ id: str(c.id, 60), name: str(c.name, 60), kind: str(c.kind, 20) }))
    : [];
  return { mode, message: str(i.message, 2000), snapshot: str(i.snapshot, 14000), history, categories };
}
