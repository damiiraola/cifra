/**
 * Server side of the alert mails: who gets one today and with what. Builds the
 * same alerts the app shows (lib/plan) from the ledger in the database, keeps
 * only the important ones not mailed before, sends one digest per user and
 * remembers what went out. Never logs addresses.
 */
import { getSql } from "@/lib/db";
import { readLedger } from "@/lib/ledger-api";
import { appOrigin, sendCifraMail } from "@/lib/mail";
import { argentinaDay } from "@/lib/market-hours";
import { alertDigest, ledgerAlerts, newMailAlerts, type CronSummary } from "@/lib/alert-mail";

type Target = { user_id: string; token: string; email: string; name: string; last_sent_day: string | null };

export async function runAlertMails(opts: { today?: string; origin?: string } = {}): Promise<CronSummary> {
  const sql = await getSql();
  const today = opts.today ?? argentinaDay();
  const origin = opts.origin ?? appOrigin();
  const targets = await sql<Target>`
    select p.user_id, p.token, u.email, u.name,
           to_char(p.last_sent_at at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') as last_sent_day
      from alert_mail_prefs p
      join "user" u on u.id = p.user_id
     where p.enabled and u."emailVerified"
  `;
  const summary: CronSummary = { users: targets.length, sent: 0, skipped: 0, failed: 0 };
  for (const t of targets) {
    try {
      if (t.last_sent_day === today) {
        summary.skipped += 1;
        continue;
      }
      const sentRows = await sql<{ alert_id: string }>`
        select alert_id from alert_mail_sent where user_id = ${t.user_id}
      `;
      const sent = new Set(sentRows.map((r) => r.alert_id));
      const alerts = newMailAlerts(ledgerAlerts(await readLedger(sql, t.user_id), today), sent);
      if (!alerts.length) {
        summary.skipped += 1;
        continue;
      }
      const result = await sendCifraMail({ to: t.email, ...alertDigest({ name: t.name, alerts, origin, token: t.token }) });
      if (!result.ok) {
        summary.failed += 1;
        continue;
      }
      for (const a of alerts) {
        await sql`
          insert into alert_mail_sent (user_id, alert_id) values (${t.user_id}, ${a.id})
          on conflict do nothing
        `;
      }
      await sql`update alert_mail_prefs set last_sent_at = now() where user_id = ${t.user_id}`;
      summary.sent += 1;
    } catch (err) {
      summary.failed += 1;
      console.error("[alertas] falló un usuario:", err instanceof Error ? err.message : "error");
    }
  }
  return summary;
}

/** Turns the mails off for the owner of an unsubscribe token. */
export async function unsubscribeToken(token: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    update alert_mail_prefs set enabled = false, updated_at = now()
     where token = ${token}
     returning user_id
  `;
  return rows.length > 0;
}
