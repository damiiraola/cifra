import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isBetaOwner } from "@/lib/beta-owner";
import {
  createInvites,
  inviteUsable,
  joinWaitlist,
  listInvites,
  listWaitlist,
  normalizeCode,
  removeFromWaitlist,
  revokeInvite,
  signupMode,
  type InviteRow,
  type SignupMode,
  type WaitlistResult,
} from "@/lib/beta-invites";

/** Public: is sign-up open, and does this code still work? (no side effects) */
export const signupStatus = createServerFn({ method: "GET" })
  .validator((input: { code?: string } | undefined) => ({ code: normalizeCode(input?.code) }))
  .handler(async ({ data }): Promise<{ mode: SignupMode; codeOk: boolean | null }> => {
    const mode = signupMode();
    if (mode === "abierto" || !data.code) return { mode, codeOk: null };
    return { mode, codeOk: await inviteUsable(await getSql(), data.code) };
  });

/** Public: leave the mail to hear when the beta opens. */
export const joinBetaWaitlist = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => ({ email: String(input?.email ?? "").slice(0, 300) }))
  .handler(async ({ data }): Promise<{ result: WaitlistResult }> => ({
    result: await joinWaitlist(await getSql(), data.email),
  }));

async function ownerSql(userId: string) {
  const sql = await getSql();
  const me = await sql<{ email: string; emailVerified: boolean }>`
    select email, "emailVerified" from "user" where id = ${userId} limit 1
  `;
  return isBetaOwner(me[0]?.email, me[0]?.emailVerified) ? sql : null;
}

export type BetaInvitesReport =
  | {
      ok: true;
      mode: SignupMode;
      invites: InviteRow[];
      waitlist: { email: string; createdAt: string }[];
    }
  | { ok: false };

/** /panel: invitations and waiting list, only for the owner. */
export const betaInvitesReport = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BetaInvitesReport> => {
    const sql = await ownerSql(context.userId);
    if (!sql) return { ok: false };
    const [invites, waitlist] = await Promise.all([listInvites(sql), listWaitlist(sql)]);
    return { ok: true, mode: signupMode(), invites, waitlist };
  });

export const createBetaInvites = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { count: number; maxUses: number; note?: string; expiresDays?: number }) => ({
    count: Number(input?.count) || 1,
    maxUses: Number(input?.maxUses) || 1,
    note: typeof input?.note === "string" ? input.note : "",
    expiresDays: Number(input?.expiresDays) || 0,
  }))
  .handler(async ({ context, data }): Promise<{ ok: boolean; codes: string[] }> => {
    const sql = await ownerSql(context.userId);
    if (!sql) return { ok: false, codes: [] };
    return { ok: true, codes: await createInvites(sql, data) };
  });

export const revokeBetaInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code: string }) => ({ code: normalizeCode(input?.code) }))
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    const sql = await ownerSql(context.userId);
    if (!sql || !data.code) return { ok: false };
    await revokeInvite(sql, data.code);
    return { ok: true };
  });

export const removeBetaWaitlist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email: string }) => ({ email: String(input?.email ?? "") }))
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    const sql = await ownerSql(context.userId);
    if (!sql) return { ok: false };
    await removeFromWaitlist(sql, data.email);
    return { ok: true };
  });
