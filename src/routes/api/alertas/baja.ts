import { createFileRoute } from "@tanstack/react-router";
import { handleUnsubscribe } from "@/lib/alert-mail";

// Unsubscribe link of the alert mails (no login: the token is the secret).
const handle = async ({ request }: { request: Request }) =>
  handleUnsubscribe(request, {
    unsubscribe: async (token) => (await import("@/lib/alert-mail.server")).unsubscribeToken(token),
  });

export const Route = createFileRoute("/api/alertas/baja")({
  server: { handlers: { GET: handle, POST: handle } },
});
