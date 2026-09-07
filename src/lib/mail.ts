type SendInput = {
  to: string;
  subject: string;
  heading: string;
  body: string;
  cta: string;
  url: string;
};

export type SendResult = { ok: true } | { ok: false; error: string };

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function fromAddress(): string {
  const raw = process.env.MAIL_FROM?.trim();
  return raw || "Cifra <beth.t@example.com>";
}

function html({ heading, body, cta, url }: Omit<SendInput, "to" | "subject">): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#09090b;color:#f4f4f0;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;">
          <tr><td style="font-size:36px;letter-spacing:-0.03em;">Cifra</td></tr>
          <tr><td style="padding-top:24px;font-size:22px;">${escapeHtml(heading)}</td></tr>
          <tr><td style="padding-top:12px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.5;color:#8c8c86;">${escapeHtml(body)}</td></tr>
          <tr>
            <td style="padding-top:28px;">
              <a href="${escapeHtml(url)}" style="display:inline-block;background:#c8ccd4;color:#09090b;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;font-weight:600;">${escapeHtml(cta)}</a>
            </td>
          </tr>
          <tr><td style="padding-top:28px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;color:#6a6a66;">Si no fuiste vos, ignora este mail. El enlace vence.</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

export async function sendCifraMail(input: SendInput): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "Falta RESEND_API_KEY en Vercel. Sin eso Cifra no puede mandar mails.",
    };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      html: html(input),
      text: `${input.heading}\n\n${input.body}\n\n${input.url}`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `No pude enviar el mail (${res.status}). ${detail.slice(0, 180)}` };
  }
  return { ok: true };
}
