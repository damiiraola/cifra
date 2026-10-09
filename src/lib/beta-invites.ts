/**
 * Closed beta: sign-up needs an invitation code (migration 0018).
 *
 * - `SIGNUP_MODE=abierto` opens sign-up for everyone; anything else (or unset)
 *   keeps the closed beta. The default is closed on purpose.
 * - Codes are single-use by default (`max_uses`), can expire and be revoked.
 * - Nothing here stores who used a code: only how many times it was used.
 *
 * SQL helpers take the `sql` tag so they run the same on Neon, PGLite and tests.
 */
import type { Sql } from "./db.ts";

export type SignupMode = "invitacion" | "abierto";

export function signupMode(env: Record<string, string | undefined> = process.env): SignupMode {
  return env.SIGNUP_MODE?.trim().toLowerCase() === "abierto" ? "abierto" : "invitacion";
}

// No 0/O, 1/I/L: codes get read aloud and typed on a phone.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

/** A random code from crypto bytes (`bytes` must have at least CODE_LENGTH entries). */
export function codeFromBytes(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function newCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return codeFromBytes(bytes);
}

/** What the user typed or pasted (spaces, dashes, lower case) to the stored form. */
export function normalizeCode(raw: unknown): string {
  const s = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return s.length >= 4 && s.length <= 32 ? s : "";
}

export function normalizeEmail(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}

export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/login?modo=crear&invitacion=${encodeURIComponent(code)}`;
}

/**
 * Use one slot of the code, atomically: two people with the same single-use
 * code can't both get in. Returns false when the code is unknown, used up,
 * expired or revoked.
 */
export async function consumeInvite(sql: Sql, code: string): Promise<boolean> {
  if (!code) return false;
  const rows = await sql<{ code: string }>`
    update beta_invites set uses = uses + 1
    where code = ${code} and uses < max_uses and revoked_at is null
      and (expires_at is null or expires_at > now())
    returning code
  `;
  return rows.length === 1;
}

/** Give the slot back when the sign-up failed after the code was used. */
export async function refundInvite(sql: Sql, code: string): Promise<void> {
  await sql`update beta_invites set uses = greatest(uses - 1, 0) where code = ${code}`;
}

/** Whether the code would let someone in right now (no side effects). */
export async function inviteUsable(sql: Sql, code: string): Promise<boolean> {
  if (!code) return false;
  const rows = await sql<{ ok: boolean }>`
    select true as ok from beta_invites
    where code = ${code} and uses < max_uses and revoked_at is null
      and (expires_at is null or expires_at > now())
  `;
  return rows.length === 1;
}

export type InviteRow = {
  code: string;
  maxUses: number;
  uses: number;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
};

export async function createInvites(
  sql: Sql,
  input: { count: number; maxUses: number; note?: string; expiresDays?: number },
  gen: () => string = newCode,
): Promise<string[]> {
  const count = Math.min(20, Math.max(1, Math.floor(input.count)));
  const maxUses = Math.min(100, Math.max(1, Math.floor(input.maxUses)));
  const note = input.note?.trim().slice(0, 60) || null;
  const days =
    input.expiresDays && input.expiresDays > 0
      ? Math.min(365, Math.floor(input.expiresDays))
      : null;
  const codes: string[] = [];
  while (codes.length < count) {
    const code = gen();
    const rows = await sql<{ code: string }>`
      insert into beta_invites (code, max_uses, note, expires_at)
      values (${code}, ${maxUses}, ${note}, case when ${days}::int is null then null else now() + make_interval(days => ${days}::int) end)
      on conflict (code) do nothing
      returning code
    `;
    if (rows.length) codes.push(code);
  }
  return codes;
}

export async function listInvites(sql: Sql): Promise<InviteRow[]> {
  const rows = await sql<{
    code: string;
    max_uses: number;
    uses: number;
    note: string | null;
    created_at: string | Date;
    expires_at: string | Date | null;
    revoked_at: string | Date | null;
  }>`
    select code, max_uses, uses, note, created_at, expires_at, revoked_at
    from beta_invites order by created_at desc limit 200
  `;
  const iso = (d: string | Date | null) => (d == null ? null : new Date(d).toISOString());
  return rows.map((r) => ({
    code: r.code,
    maxUses: Number(r.max_uses),
    uses: Number(r.uses),
    note: r.note,
    createdAt: iso(r.created_at)!,
    expiresAt: iso(r.expires_at),
    revoked: r.revoked_at != null,
  }));
}

export async function revokeInvite(sql: Sql, code: string): Promise<void> {
  await sql`update beta_invites set revoked_at = coalesce(revoked_at, now()) where code = ${code}`;
}

/** Most new waitlist mails accepted per hour, whole app (a cheap brake on bots). */
export const WAITLIST_PER_HOUR = 30;
export const WAITLIST_MAX = 2000;

export type WaitlistResult = "ok" | "invalido" | "ocupado";

export async function joinWaitlist(sql: Sql, rawEmail: unknown): Promise<WaitlistResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return "invalido";
  const [c] = await sql<{ hour: number; total: number }>`
    select count(*) filter (where created_at > now() - interval '1 hour')::int as hour,
           count(*)::int as total
    from beta_waitlist
  `;
  if (Number(c?.hour ?? 0) >= WAITLIST_PER_HOUR || Number(c?.total ?? 0) >= WAITLIST_MAX)
    return "ocupado";
  await sql`insert into beta_waitlist (email) values (${email}) on conflict (email) do nothing`;
  return "ok";
}

export async function listWaitlist(sql: Sql): Promise<{ email: string; createdAt: string }[]> {
  const rows = await sql<{ email: string; created_at: string | Date }>`
    select email, created_at from beta_waitlist order by created_at asc limit 500
  `;
  return rows.map((r) => ({ email: r.email, createdAt: new Date(r.created_at).toISOString() }));
}

export async function removeFromWaitlist(sql: Sql, rawEmail: unknown): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (email) await sql`delete from beta_waitlist where email = ${email}`;
}
