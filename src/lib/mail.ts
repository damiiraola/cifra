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

export function renderMailHtml({ heading, body, cta, url, preheader }: Omit<SendInput, "to" | "subject">): string {
  const logo = `${appOrigin()}/icon-192.png`;
  const preview = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#000000;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : "";
  const button =
    cta && url
      ? `<tr>
            <td class="bg" bgcolor="#000000" style="padding:28px 0 0;background:#000000;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="#f4f4f0" style="border-radius:999px;background:#f4f4f0;">
                    <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#111111;text-decoration:none;">${escapeHtml(cta)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
      : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Cifra</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body, .bg { background:#000000 !important; }
  @media (prefers-color-scheme: light) {
    body, .bg { background:#000000 !important; color:#f4f4f0 !important; }
  }
</style>
</head>
<body class="bg" bgcolor="#000000" style="margin:0;padding:0;background:#000000;color:#f4f4f0;">
  ${preview}
  <table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" bgcolor="#000000" style="background:#000000;">
    <tr>
      <td class="bg" align="center" bgcolor="#000000" style="padding:36px 28px 48px;background:#000000;">
        <table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" bgcolor="#000000" style="max-width:520px;background:#000000;">
          <tr>
            <td class="bg" bgcolor="#000000" style="background:#000000;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="bg" bgcolor="#000000" valign="middle" style="background:#000000;font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1;letter-spacing:-0.03em;color:#f4f4f0;">Cifra</td>
                  <td class="bg" bgcolor="#000000" valign="middle" style="padding-left:10px;background:#000000;">
                    <img src="${escapeHtml(logo)}" width="44" height="44" alt="" style="display:block;border:0;outline:none;width:44px;height:44px;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="bg" bgcolor="#000000" style="padding-top:18px;background:#000000;">
              <div style="height:1px;line-height:1px;background:#3a3a3a;font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="bg" bgcolor="#000000" style="padding-top:28px;background:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:32px;line-height:1.15;font-weight:700;letter-spacing:-0.03em;color:#f4f4f0;">${escapeHtml(heading)}</td>
          </tr>
          <tr>
            <td class="bg" bgcolor="#000000" style="padding-top:14px;background:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;line-height:1.45;color:#c8c8c2;">${escapeHtml(body)}</td>
          </tr>
          ${button}
          <tr>
            <td class="bg" bgcolor="#000000" style="padding-top:36px;background:#000000;">
              <div style="height:1px;line-height:1px;background:#3a3a3a;font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="bg" bgcolor="#000000" style="padding-top:16px;background:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.4;color:#8a8a86;">cifra.lol / Si no fuiste vos, ignorá este mail.</td>
          </tr>
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
      html: renderMailHtml(input),
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
