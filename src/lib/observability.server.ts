import { buildEnvelope, parseDsn, scrub, sendToSentry } from "./observability";

/**
 * Server-side: always log; also send to Sentry when `SENTRY_DSN` is set.
 * Never throws (reporting must not break the request that failed).
 */
export async function reportServerError(
  err: unknown,
  tags: Record<string, string | number | boolean | undefined> = {},
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[cifra] ${tags.where ?? "error"}: ${scrub(msg)}`);
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  await sendToSentry(
    dsn,
    buildEnvelope(err, {
      platform: "node",
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
      tags,
    }),
  );
}

/**
 * Errors that are the user's doing (wrong mail, invalid amount, logged out),
 * not bugs. They are shown to the user and not worth an alert.
 */
export function isExpectedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (/^(Unauthorized|Forbidden)$/i.test(err.message)) return true;
  return /inválid|no coincide|límite de|Elegí|Poné|Pedido/i.test(err.message);
}
