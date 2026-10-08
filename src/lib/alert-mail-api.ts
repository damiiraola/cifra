import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { alertMailsEnabled } from "@/lib/alert-mail";
import { mailConfigured } from "@/lib/mail";

export type AlertMailPrefs = {
  /** The feature is on in this deploy (ALERT_MAILS_ENABLED + CRON_SECRET + Resend). */
  available: boolean;
  enabled: boolean;
};

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function available() {
  return alertMailsEnabled(process.env) && mailConfigured();
}

export const getAlertMailPrefs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AlertMailPrefs> => {
    if (!available()) return { available: false, enabled: false };
    const sql = await getSql();
    const rows = await sql<{ enabled: boolean | number }>`
      select enabled from alert_mail_prefs where user_id = ${context.userId} limit 1
    `;
    return { available: true, enabled: Boolean(rows[0]?.enabled) };
  });

export const setAlertMailPrefs = createServerFn({ method: "POST" })
  .validator((input: { enabled: boolean }) => ({ enabled: Boolean(input?.enabled) }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<AlertMailPrefs> => {
    if (!available()) throw new Error("Los avisos por mail todavía no están activos.");
    const sql = await getSql();
    await sql`
      insert into alert_mail_prefs (user_id, enabled, token)
      values (${context.userId}, ${data.enabled}, ${newToken()})
      on conflict (user_id) do update set enabled = excluded.enabled, updated_at = now()
    `;
    return { available: true, enabled: data.enabled };
  });
