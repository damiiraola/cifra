/**
 * The SQL behind the AI cost log (ai_call_log, migration 0017). Takes the
 * `sql` tag so it runs the same on Neon, PGLite and in tests.
 */
import type { Sql } from "./db.ts";
import { AI_LOG_DAYS, type AiCallLog, type CostRow } from "./ai-cost.ts";

export async function insertCallLogs(
  sql: Sql,
  userId: string | null,
  day: string,
  logs: AiCallLog[],
) {
  for (const l of logs) {
    await sql`
      insert into ai_call_log
        (day, user_id, kind, provider, model, input_tokens, output_tokens, cost_usd, cost_source, latency_ms, result)
      values
        (${day}::date, ${userId}, ${l.kind}, ${l.provider}, ${l.model}, ${l.inputTokens}, ${l.outputTokens},
         ${l.costUsd}, ${l.costSource}, ${l.latencyMs}, ${l.result})
    `;
  }
}

/** USD spent since `from` (inclusive), whole app. */
export async function spentSince(sql: Sql, from: string): Promise<number> {
  const rows = await sql<{ usd: number | string | null }>`
    select coalesce(sum(cost_usd), 0)::float8 as usd from ai_call_log where day >= ${from}::date
  `;
  return Number(rows[0]?.usd ?? 0) || 0;
}

/** Drop rows older than AI_LOG_DAYS before `today`. Returns how many went. */
export async function purgeCallLog(sql: Sql, today: string): Promise<number> {
  const rows = await sql<{ n: number | string }>`
    with gone as (
      delete from ai_call_log where day < ${today}::date - ${AI_LOG_DAYS}::int returning 1
    )
    select count(*)::int as n from gone
  `;
  return Number(rows[0]?.n ?? 0);
}

/** Account deleted: its rows keep counting for the global cap but are no one's. */
export async function forgetUser(sql: Sql, userId: string) {
  await sql`update ai_call_log set user_id = null where user_id = ${userId}`;
}

export function costRowsSince(sql: Sql, from: string) {
  return sql<CostRow>`
    select kind, result, count(*)::int as n, coalesce(sum(cost_usd), 0)::float8 as usd,
           coalesce(sum(input_tokens), 0)::int as input, coalesce(sum(output_tokens), 0)::int as output
      from ai_call_log where day >= ${from}::date
     group by kind, result
  `;
}

export async function usersOn(sql: Sql, day: string): Promise<number> {
  const rows = await sql<{ n: number }>`
    select count(distinct user_id)::int as n from ai_call_log where day = ${day}::date and result <> 'tope'
  `;
  return Number(rows[0]?.n ?? 0);
}

/** One line per day for the last `n` days that had rows, newest first. */
export async function lastDays(sql: Sql, today: string, n: number) {
  const rows = await sql<{ day: string; usd: number; calls: number }>`
    select to_char(day, 'YYYY-MM-DD') as day, coalesce(sum(cost_usd), 0)::float8 as usd,
           (count(*) filter (where result <> 'tope'))::int as calls
      from ai_call_log where day > ${today}::date - ${n}::int
     group by day order by day desc
  `;
  return rows.map((d) => ({ day: d.day, usd: Number(d.usd) || 0, calls: Number(d.calls) || 0 }));
}
