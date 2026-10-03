import type { SendResult } from "./mail";

/** Fixed recipient of the drill: the owner's inbox, never a user's. */
export const MAIL_DRILL_TO = "iraoladamian@gmail.com";

export type MailDrillDeps = {
  /** Value of `MAIL_DRILL_TOKEN`. Unset or blank = the drill does not exist. */
  token: string | undefined;
  /** Whether Resend is configured (`RESEND_API_KEY`). */
  mailConfigured: () => boolean;
  /** Sends the five template previews to `to`. */
  sendPreviews: (to: string) => Promise<SendResult>;
};

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

/**
 * Constant-time comparison. Both sides are hashed first so the loop always
 * runs over 32 bytes and the token's length does not leak through timing.
 */
export async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * `/api/mail-drill`: sends the five live mail templates to the owner.
 *
 * Off by default. It only answers when `MAIL_DRILL_TOKEN` is set, and only
 * sends on `POST` with `Authorization: Bearer <MAIL_DRILL_TOKEN>`.
 * - token env unset → 404 (as if the route did not exist), any method
 * - not POST → 405
 * - missing or wrong token → 401
 */
export async function handleMailDrill(request: Request, deps: MailDrillDeps): Promise<Response> {
  const expected = deps.token?.trim();
  if (!expected) return json({ ok: false, error: "Not found" }, 404);

  if (request.method !== "POST") {
    return json({ ok: false, error: "Usá POST." }, 405, { Allow: "POST" });
  }

  const provided = bearerToken(request);
  if (!provided || !(await tokensMatch(provided, expected))) {
    return json({ ok: false, error: "No autorizado." }, 401, { "WWW-Authenticate": "Bearer" });
  }

  if (!deps.mailConfigured()) {
    return json({ ok: false, error: "Falta RESEND_API_KEY en Vercel." }, 500);
  }

  const result = await deps.sendPreviews(MAIL_DRILL_TO);
  return json({ ...result, to: MAIL_DRILL_TO }, result.ok ? 200 : 500);
}
