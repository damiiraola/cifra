import { createFileRoute } from "@tanstack/react-router";
import { mailConfigured, sendTemplatePreviews } from "@/lib/mail";

const TO = "iraoladamian@gmail.com";

export const Route = createFileRoute("/api/mail-drill")({
  server: {
    handlers: {
      GET: async () => {
        if (!mailConfigured()) {
          return Response.json(
            { ok: false, error: "Falta RESEND_API_KEY en Vercel." },
            { status: 500 },
          );
        }
        const result = await sendTemplatePreviews(TO);
        return Response.json({ ...result, to: TO }, { status: result.ok ? 200 : 500 });
      },
    },
  },
});
