import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { aiUsageDay } from "@/lib/ai-limit";
import {
  aiGlobalDailyUsd,
  costSummary,
  daysBefore,
  isOwner,
  monthStart,
  type CostSummary,
} from "@/lib/ai-cost";
import { costRowsSince, lastDays, purgeCallLog, spentSince, usersOn } from "@/lib/ai-cost-db";

export type CostReport =
  | {
      ok: true;
      day: string;
      capUsd: number;
      today: CostSummary;
      month: CostSummary;
      users: number;
      /** Last 30 days, to compare with the $5 free credit that renews every 30 days. */
      last30Usd: number;
      days: { day: string; usd: number; calls: number }[];
    }
  | { ok: false };

/**
 * /costos: what the AI cost today and this month, only for the owner (verified
 * OWNER_EMAIL). Aggregates only: no user ids, no texts. Also trims the log to
 * AI_LOG_DAYS, in case the daily cron is off.
 */
export const aiCostReport = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CostReport> => {
    const sql = await getSql();
    const me = await sql<{ email: string; emailVerified: boolean }>`
      select email, "emailVerified" from "user" where id = ${context.userId} limit 1
    `;
    if (!isOwner(me[0]?.email, me[0]?.emailVerified)) return { ok: false };
    const day = aiUsageDay();
    await purgeCallLog(sql, day);
    const [today, month, users, days, last30Usd] = await Promise.all([
      costRowsSince(sql, day),
      costRowsSince(sql, monthStart(day)),
      usersOn(sql, day),
      lastDays(sql, day, 14),
      spentSince(sql, daysBefore(day, 29)),
    ]);
    return {
      ok: true,
      day,
      capUsd: aiGlobalDailyUsd(process.env.AI_GLOBAL_DAILY_USD),
      today: costSummary(today),
      month: costSummary(month),
      users,
      last30Usd,
      days,
    };
  });
