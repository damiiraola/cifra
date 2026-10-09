import { createFileRoute } from "@tanstack/react-router";
import { alertMailsEnabled, handleAlertCron } from "@/lib/alert-mail";
import { mailConfigured } from "@/lib/mail";

// Daily Vercel Cron (vite.config.ts). Off unless ALERT_MAILS_ENABLED=1 and
// CRON_SECRET are set: then it answers 404 as if it did not exist.
const handle = async ({ request }: { request: Request }) =>
  handleAlertCron(request, {
    enabled: alertMailsEnabled(process.env),
    secret: process.env.CRON_SECRET,
    mailConfigured,
    run: async () => (await import("@/lib/alert-mail.server")).runAlertMails(),
    purge: async () => (await import("@/lib/ai-call")).purgeAiCallLog(),
    purgeOrphans: async () => {
      const [{ purgeOrphans }, { getSql, withTransaction }] = await Promise.all([
        import("@/lib/orphan-purge"),
        import("@/lib/db"),
      ]);
      return (await purgeOrphans(await getSql(), withTransaction)).total;
    },
  });

export const Route = createFileRoute("/api/cron/alertas")({
  server: { handlers: { GET: handle } },
});
