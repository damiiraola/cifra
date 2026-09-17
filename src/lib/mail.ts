export type SendInput = {
  to: string;
  subject: string;
  heading: string;
  body: string;
  cta?: string;
  url?: string;
  preheader?: string;
};

export type SendResult = { ok: true } | { ok: false; error: string };

export const APP_ORIGIN = "https://cifra.lol";

export function appOrigin() {
  return (process.env.BETTER_AUTH_URL ?? APP_ORIGIN).replace(/\/+$/, "");
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function fromAddress(): string {
  const raw = process.env.MAIL_FROM?.trim();
  return raw || "Cifra <hola@cifra.lol>";
}

export function greeting(name?: string | null): string {
  const n = name?.trim();
  return n ? `Hola ${n}.` : "Hola.";
}

export const MAIL = {
  verify: (name?: string | null) => ({
    subject: "Confirmá tu mail — Cifra",
    heading: "Confirmá tu cuenta",
    preheader: "Un toque para abrir tu libro.",
    body: `${greeting(name)} Tocá el botón para confirmar el mail y abrir tu libro. El enlace vence.`,
    cta: "Confirmar mail",
  }),
  reset: {
    subject: "Cambiar tu contraseña — Cifra",
    heading: "Cambiar contraseña",
    preheader: "El enlace vale una hora.",
    body: "Pediste una clave nueva. El enlace vale una hora. Si no fuiste vos, ignorá este mail.",
    cta: "Elegir nueva clave",
  },
  passwordChanged: {
    subject: "Tu contraseña de Cifra cambió",
    heading: "Contraseña actualizada",
    preheader: "Si no fuiste vos, cambiala ahora.",
    body: "Si fuiste vos, no tenés que hacer nada. Si no, entrá a cifra.lol/olvide y cambiá la clave ahora.",
    cta: "Abrir Cifra",
  },
  deleted: {
    subject: "Borramos tu cuenta de Cifra",
    heading: "Cuenta eliminada",
    preheader: "El libro ya no está en Cifra.",
    body: "El libro, las cajas y la sesión ya no están. Si no fuiste vos, escribinos a hola@cifra.lol.",
  },
  welcome: {
    subject: "Tu libro ya está en Cifra",
    heading: "Listo",
    preheader: "El diario queda en tu cuenta, no en el teléfono.",
    body: "Confirmaste el mail. El diario y la analítica quedan en tu cuenta, no en el teléfono.",
    cta: "Entrar al libro",
  },
} as const;

function html({ heading, body, cta, url, preheader }: Omit<SendInput, "to" | "subject">): string {
  const preview = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>`
    : "";
  const button =
    cta && url
      ? `<tr>
            <td style="padding-top:28px;">
              <a href="${escapeHtml(url)}" style="display:inline-block;background:#c8ccd4;color:#09090b;text-decoration:none;padding:14px 20px;border-radius:10px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;font-weight:600;">${escapeHtml(cta)}</a>
            </td>
          </tr>`
      : "";
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#09090b;color:#f4f4f0;font-family:Georgia,'Times New Roman',serif;">
  ${preview}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;">
          <tr><td style="font-size:36px;letter-spacing:-0.03em;">Cifra</td></tr>
          <tr><td style="padding-top:24px;font-size:22px;letter-spacing:-0.02em;">${escapeHtml(heading)}</td></tr>
          <tr><td style="padding-top:12px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.5;color:#8c8c86;">${escapeHtml(body)}</td></tr>
          ${button}
          <tr><td style="padding-top:32px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;color:#6a6a66;">cifra.lol · Si no fuiste vos, ignorá este mail.</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function textVersion(input: SendInput) {
  const lines = [input.heading, "", input.body];
  if (input.url) lines.push("", input.url);
  lines.push("", "cifra.lol");
  return lines.join("\n");
}

export async function sendCifraMail(input: SendInput, opts?: { from?: string }): Promise<SendResult> {
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
      from: opts?.from || fromAddress(),
      to: [input.to],
      subject: input.subject,
      html: html(input),
      text: textVersion(input),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `No pude enviar el mail (${res.status}). ${detail.slice(0, 280)}` };
  }
  return { ok: true };
}

export async function sendMailQuiet(input: SendInput): Promise<SendResult> {
  try {
    return await sendCifraMail(input);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Mail falló" };
  }
}

/** One-shot gallery: the five live templates, with placeholder links. */
export async function sendTemplatePreviews(to: string): Promise<SendResult> {
  const origin = appOrigin();
  const name = "Damian";
  const jobs: SendInput[] = [
    { to, url: `${origin}/login`, ...MAIL.verify(name) },
    { to, url: `${origin}/reset?token=preview`, ...MAIL.reset },
    { to, url: origin, ...MAIL.passwordChanged },
    { to, ...MAIL.deleted },
    { to, url: origin, ...MAIL.welcome },
  ];
  let from: string | undefined;
  for (const job of jobs) {
    let result = await sendCifraMail(job, from ? { from } : undefined);
    if (!result.ok && /not verified|domain/i.test(result.error)) {
      from = "Cifra <beth.t@example.com>";
      result = await sendCifraMail(job, { from });
    }
    if (!result.ok) return result;
  }
  return { ok: true };
}
