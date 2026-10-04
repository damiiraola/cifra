import { buildEnvelope, parseDsn, sendToSentry } from "./observability";

/** Browser-side reporting. No-op unless VITE_SENTRY_DSN was set at build time. */
const dsn = parseDsn(import.meta.env.VITE_SENTRY_DSN as string | undefined);
const MAX_PER_PAGE = 20;
let sent = 0;

export function reportClientError(err: unknown, tags: Record<string, string | undefined> = {}) {
  if (!dsn || typeof window === "undefined" || sent >= MAX_PER_PAGE) return;
  sent += 1;
  void sendToSentry(
    dsn,
    buildEnvelope(err, {
      platform: "javascript",
      environment: import.meta.env.MODE,
      url: window.location.href,
      tags: { where: "browser", ...tags },
    }),
  );
}

let installed = false;

export function installGlobalErrorHandlers() {
  if (!dsn || installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => reportClientError(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportClientError(e.reason));
}
