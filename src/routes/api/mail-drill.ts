import { createFileRoute } from "@tanstack/react-router";
import { mailConfigured, sendTemplatePreviews } from "@/lib/mail";
import { handleMailDrill } from "@/lib/mail-drill";

// Off unless MAIL_DRILL_TOKEN is set. See handleMailDrill for the contract.
const handle = ({ request }: { request: Request }) =>
  handleMailDrill(request, {
    token: process.env.MAIL_DRILL_TOKEN,
    mailConfigured,
    sendPreviews: sendTemplatePreviews,
  });

export const Route = createFileRoute("/api/mail-drill")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});
