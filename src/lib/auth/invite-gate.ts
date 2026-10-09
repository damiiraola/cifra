/**
 * Server-side gate for the closed beta (see `../beta-invites`).
 *
 * Three layers, all on the server:
 * 1. `hooks.before` on `/sign-up/email`: without a usable invitation code the
 *    request is rejected with `INVITE_REQUIRED` before Better Auth does anything.
 *    A usable code is consumed atomically (one slot) right there.
 * 2. `hooks.after`: if the sign-up then failed (bad password, mail could not be
 *    sent…), the slot is given back.
 * 3. `databaseHooks.user.create.before`: no user row is created unless step 1
 *    granted it a moment ago, whatever endpoint tries. Defence in depth.
 *
 * `SIGNUP_MODE=abierto` turns all three off.
 */
import type { Sql } from "../db.ts";
import {
  consumeInvite,
  normalizeCode,
  normalizeEmail,
  refundInvite,
  type SignupMode,
} from "../beta-invites.ts";

export const INVITE_REQUIRED = "INVITE_REQUIRED";
const GRANT_TTL_MS = 2 * 60_000;

/** email -> code granted by the before hook, for the rest of this request. */
export type Grants = Map<string, { code: string; at: number }>;

function prune(grants: Grants, now: number) {
  for (const [k, v] of grants) if (now - v.at > GRANT_TTL_MS) grants.delete(k);
}

/**
 * "pass": let Better Auth handle it (open mode, bad mail, or a mail that
 * already has an account, where no new account can come out of it).
 * "granted": a slot of the code was used. "denied": no usable code.
 */
export async function gateSignUp(input: {
  sql: Sql;
  mode: SignupMode;
  body: unknown;
  grants: Grants;
  now?: number;
  /** The owner never needs a code (they still have to confirm the mail). */
  isOwnerEmail?: (email: string) => boolean;
}): Promise<"pass" | "granted" | "denied"> {
  if (input.mode === "abierto") return "pass";
  const body = (input.body ?? {}) as { email?: unknown; invitation?: unknown };
  const email = normalizeEmail(body.email);
  if (!email) return "pass";
  const now = input.now ?? Date.now();
  prune(input.grants, now);
  const exists = await input.sql`select 1 from "user" where lower(email) = ${email} limit 1`;
  if (exists.length) return "pass";
  if (input.isOwnerEmail?.(email)) {
    input.grants.set(email, { code: "", at: now });
    return "granted";
  }
  const code = normalizeCode(body.invitation);
  if (!(await consumeInvite(input.sql, code))) return "denied";
  input.grants.set(email, { code, at: now });
  return "granted";
}

/** After the sign-up: forget the grant, and give the slot back if it failed. */
export async function settleSignUp(input: {
  sql: Sql;
  body: unknown;
  failed: boolean;
  grants: Grants;
}) {
  const email = normalizeEmail((input.body as { email?: unknown } | null)?.email);
  const g = email ? input.grants.get(email) : undefined;
  if (!g) return;
  input.grants.delete(email);
  if (input.failed && g.code) await refundInvite(input.sql, g.code);
}

/** May a user row with this mail be created right now? */
export function userCreateAllowed(input: {
  mode: SignupMode;
  email: unknown;
  grants: Grants;
  now?: number;
}) {
  if (input.mode === "abierto") return true;
  const g = input.grants.get(normalizeEmail(input.email));
  return Boolean(g && (input.now ?? Date.now()) - g.at <= GRANT_TTL_MS);
}
