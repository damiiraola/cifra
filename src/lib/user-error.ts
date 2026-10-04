/**
 * Turn any thrown value into something a tester can read. Our own server
 * validators already throw Spanish ("Monto inválido", "El mail no coincide");
 * everything else (driver errors, "Failed to fetch", stack-y text) becomes a
 * plain Spanish fallback so English or technical text never reaches the UI.
 */
const SPANISH_HINT = /[áéíóúñ¿¡]|\b(no pude|no encontré|inválid[oa]|no coincide|falta|probá|revisá)\b/i;
const NETWORK = /failed to fetch|networkerror|load failed|network request failed|fetch failed/i;

export const NETWORK_MESSAGE = "No hay conexión con Cifra. Revisá internet y probá de nuevo.";

export function userMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;
  if (NETWORK.test(raw)) return NETWORK_MESSAGE;
  // Server-only configuration hints are for Damián's logs, not for testers.
  if (/RESEND_API_KEY|DATABASE_URL|BETTER_AUTH|XAI_API_KEY|Vercel/.test(raw)) return fallback;
  if (SPANISH_HINT.test(raw) && raw.length <= 160) return raw;
  return fallback;
}
