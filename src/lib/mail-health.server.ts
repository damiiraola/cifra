import { getSql } from "@/lib/db";
import { reportServerError } from "@/lib/observability.server";
import { mailLooksDown } from "@/lib/mail-status";

/**
 * Remember the outcome of every mail send (global, not per user) and report
 * failures to the log/Sentry. Never throws: tracking must not break sending.
 */
export async function trackMailResult(ok: boolean, kind: string, error = ""): Promise<void> {
  try {
    if (!ok) await reportServerError(new Error(`Mail no enviado (${kind}): ${error}`), { where: "mail", kind });
    const sql = await getSql();
    const key = ok ? "mail_last_success" : "mail_last_failure";
    await sql`
      insert into app_status (key, value, at) values (${key}, ${kind}, now())
      on conflict (key) do update set value = excluded.value, at = excluded.at
    `;
  } catch {
    /* tracking is best effort */
  }
}

export async function readMailHealth(): Promise<{ ok: boolean }> {
  try {
    const sql = await getSql();
    const rows = await sql<{ key: string; at: string }>`
      select key, at from app_status where key in ('mail_last_success', 'mail_last_failure')
    `;
    return { ok: !mailLooksDown(rows) };
  } catch {
    return { ok: true };
  }
}
