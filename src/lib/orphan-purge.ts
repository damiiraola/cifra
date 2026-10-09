/**
 * Daily cleanup of rows whose owner no longer exists ("filas sin dueño").
 *
 * Deleting an account removes everything in one transaction, but a device
 * that was still open could write a row afterwards (a backup, a movement)
 * while its session lived on. Those rows belong to no one: this deletes them.
 *
 * - Only rows whose `user_id` has no row in "user". Never a row with an owner,
 *   and never a row with a null `user_id` (there is no way to know whose it is).
 * - One transaction per table, in batches, with a cap per run: a surprise does
 *   not turn into a huge delete in a single cron.
 * - Not ai_usage nor ai_call_log: the cost log keeps rows without an owner on
 *   purpose (the global cap counts them) and drops them after 90 days.
 * - If there are no users at all it does nothing (a misconfigured database
 *   must not look like "everything is orphaned").
 */
import type { Sql } from "./db.ts";

export const ORPHAN_TABLES = [
  "ledger_transactions",
  "ledger_recurring",
  "ledger_card_purchases",
  "ledger_card_statements",
  "ledger_cards",
  "ledger_accounts",
  "ledger_books",
  "ledger_settings",
  "ledger_backups",
  "alert_mail_prefs",
  "alert_mail_sent",
] as const;

export const ORPHAN_BATCH = 500;
export const ORPHAN_MAX_PER_RUN = 5000;

export type OrphanPurge = {
  /** Rows deleted per table (only tables with something deleted). */
  deleted: Record<string, number>;
  total: number;
  /** The cap was reached: what is left goes in the next run. */
  capped: boolean;
  /** Why it did nothing, if so. */
  skipped?: string;
};

export async function purgeOrphans(
  sql: Sql,
  withTx: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>,
  opts: { batch?: number; max?: number; log?: (line: string) => void } = {},
): Promise<OrphanPurge> {
  const batch = Math.max(1, Math.floor(opts.batch ?? ORPHAN_BATCH));
  const max = Math.max(0, Math.floor(opts.max ?? ORPHAN_MAX_PER_RUN));
  const log = opts.log ?? ((line: string) => console.log(line));
  const users = await sql<{ n: number }>`select count(*)::int as n from "user"`;
  if (!(Number(users[0]?.n) > 0)) {
    log("[purga] sin usuarios en la base: no borro nada");
    return { deleted: {}, total: 0, capped: false, skipped: "sin usuarios" };
  }
  const deleted: Record<string, number> = {};
  let total = 0;
  for (const table of ORPHAN_TABLES) {
    if (total >= max) break;
    const n = await withTx(async (tx) => {
      let done = 0;
      while (total + done < max) {
        const take = Math.min(batch, max - total - done);
        // Table names come from the fixed list above, never from input.
        const rows = await tx.query<{ x: number }>(
          `delete from ${table} where ctid in (
             select t.ctid from ${table} t
             where t.user_id is not null
               and not exists (select 1 from "user" u where u.id = t.user_id)
             limit $1
           ) returning 1 as x`,
          [take],
        );
        done += rows.length;
        if (rows.length < take) break;
      }
      return done;
    });
    if (n > 0) deleted[table] = n;
    total += n;
  }
  const capped = total >= max && max > 0;
  log(
    `[purga] filas sin dueño borradas: ${total}${capped ? " (tope por corrida)" : ""}` +
      (total
        ? ` · ${Object.entries(deleted)
            .map(([t, n]) => `${t}=${n}`)
            .join(" ")}`
        : ""),
  );
  return { deleted, total, capped };
}
