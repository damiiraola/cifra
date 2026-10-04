/**
 * Error reporting to Sentry (or any Sentry-compatible service, e.g. GlitchTip)
 * without the SDK: one small `fetch` to the envelope endpoint.
 *
 * - Server: reads `SENTRY_DSN`. Browser: reads `VITE_SENTRY_DSN` (baked at
 *   build time). If the variable is not set, nothing is sent — errors are only
 *   written to the log (server) as before.
 * - Never sends cookies, request bodies, amounts or mail addresses: only the
 *   error type/message/stack, the route and an optional small `tags` map.
 */

export type ParsedDsn = { endpoint: string; publicKey: string };

/** `https://<key>@<host>/<projectId>` → envelope URL + key. Null if invalid. */
export function parseDsn(dsn: string | undefined | null): ParsedDsn | null {
  const raw = String(dsn ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const projectId = u.pathname.replace(/^\/+|\/+$/g, "").split("/").pop();
    if (!u.username || !projectId || !/^https?:$/.test(u.protocol)) return null;
    const prefix = u.pathname.replace(/\/?[^/]+\/?$/, "");
    return {
      endpoint: `${u.protocol}//${u.host}${prefix}/api/${projectId}/envelope/`,
      publicKey: u.username,
    };
  } catch {
    return null;
  }
}

const MAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Strip anything that looks like an email address. */
export function scrub(text: string): string {
  return text.replace(MAIL_RE, "[mail]");
}

type Tags = Record<string, string | number | boolean | undefined>;

function eventId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildEnvelope(
  err: unknown,
  opts: { platform: "javascript" | "node"; environment?: string; release?: string; tags?: Tags; url?: string },
): string {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Error desconocido");
  const id = eventId();
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.tags ?? {})) if (v !== undefined) tags[k] = scrub(String(v)).slice(0, 200);
  const event = {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: opts.platform,
    level: "error",
    environment: opts.environment || "production",
    release: opts.release || undefined,
    tags,
    request: opts.url ? { url: scrub(opts.url.split("?")[0]) } : undefined,
    exception: {
      values: [
        {
          type: e.name || "Error",
          value: scrub(e.message || "").slice(0, 1000),
          stacktrace: e.stack ? { frames: stackFrames(e.stack) } : undefined,
        },
      ],
    },
  };
  return [
    JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

function stackFrames(stack: string) {
  // Sentry wants oldest call first.
  return stack
    .split("\n")
    .slice(1, 30)
    .map((line) => {
      const m = line.match(/at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/) || line.match(/^(.*)@(.+?):(\d+):(\d+)$/);
      return m
        ? { function: m[1] || "?", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) }
        : { function: scrub(line.trim()).slice(0, 200) };
    })
    .reverse();
}

export async function sendToSentry(dsn: ParsedDsn, envelope: string): Promise<boolean> {
  try {
    const res = await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=cifra/1.0`,
      },
      body: envelope,
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}
