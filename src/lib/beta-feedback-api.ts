import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isBetaOwner } from "@/lib/beta-owner";
import { aiUsageDay } from "@/lib/ai-limit";
import { OWNER_EMAIL, costSummary, monthStart, type CostSummary } from "@/lib/ai-cost";
import { costRowsSince } from "@/lib/ai-cost-db";
import {
  betaMetrics,
  feedbackMail,
  saveFeedback,
  type BetaMetrics,
  type SaveResult,
} from "@/lib/beta-feedback";

/**
 * "Contanos": save what the user wrote and tell the owner by mail (Resend).
 * `BETA_FEEDBACK_MAIL=0` keeps saving but stops the mail.
 */
export const sendFeedback = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { kind: string; message: string; page?: string; contactOk?: boolean }) => input ?? {},
  )
  .handler(async ({ context, data }): Promise<{ result: SaveResult }> => {
    const sql = await getSql();
    const { result, fb } = await saveFeedback(sql, context.userId, data);
    if (result === "ok" && fb && process.env.BETA_FEEDBACK_MAIL?.trim() !== "0") {
      const { mailConfigured, sendMailQuiet } = await import("@/lib/mail");
      if (mailConfigured()) {
        const me = fb.contactOk
          ? await sql<{
              email: string;
            }>`select email from "user" where id = ${context.userId} limit 1`
          : [];
        const r = await sendMailQuiet(feedbackMail(fb, OWNER_EMAIL, me[0]?.email ?? null));
        if (!r.ok) console.warn("[contanos] no salió el aviso al dueño");
      }
    }
    return { result };
  });

export type PanelMetrics =
  | { ok: true; day: string; metrics: BetaMetrics; ai: { today: CostSummary; month: CostSummary } }
  | { ok: false };

/** /panel numbers, only for the owner. Aggregates only. */
export const betaPanelMetrics = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PanelMetrics> => {
    const sql = await getSql();
    const me = await sql<{ email: string; emailVerified: boolean }>`
      select email, "emailVerified" from "user" where id = ${context.userId} limit 1
    `;
    if (!isBetaOwner(me[0]?.email, me[0]?.emailVerified)) return { ok: false };
    const day = aiUsageDay();
    const [metrics, today, month] = await Promise.all([
      betaMetrics(sql),
      costRowsSince(sql, day),
      costRowsSince(sql, monthStart(day)),
    ]);
    return { ok: true, day, metrics, ai: { today: costSummary(today), month: costSummary(month) } };
  });
