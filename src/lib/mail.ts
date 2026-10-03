/** Callout box under the body: an optional bold lead, then plain text. */
export type MailInfo = { lead?: string; text: string };

export type SendInput = {
  to: string;
  subject: string;
  heading: string;
  body: string;
  cta?: string;
  url?: string;
  preheader?: string;
  /** Small uppercase label above the heading. */
  kicker?: string;
  /** Accent colour for the kicker rule, kicker and info dot. */
  accent?: string;
  info?: MailInfo;
  /** Two-column summary rows ("Cuenta — Confirmada"). */
  ledger?: ReadonlyArray<readonly [string, string]>;
  /** Show the copy-this-link fallback under the button (token links). */
  showLink?: boolean;
  /** Line under the divider at the bottom of the card. */
  signoff?: string;
  /** Footer note under "cifra.lol · hola@cifra.lol". */
  note?: string;
};

export type SendResult = { ok: true } | { ok: false; error: string };

export const APP_ORIGIN = "https://cifra.lol";

/**
 * Images in mail always load from production over https, never from
 * BETTER_AUTH_URL (which can be a preview or localhost). PNG only: Gmail
 * does not render SVG.
 */
export const MAIL_ASSET_ORIGIN = APP_ORIGIN;

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

/** Palette from src/styles.css. */
export const MAIL_COLORS = {
  bg: "#09090B",
  card: "#121214",
  elevated: "#1C1C20",
  border: "#2A2A2E",
  borderStrong: "#3A3A40",
  fg: "#F4F4F0",
  body: "#C8C8C2",
  muted: "#8C8C86",
  subtle: "#6A6A66",
  silver: "#C8CCD4",
  gold: "#C4B494",
  rose: "#C4A4A0",
  green: "#8FA898",
} as const;

const C = MAIL_COLORS;
const SECURITY_NOTE = "Mail automático de seguridad de Cifra.";

export const MAIL = {
  verify: (name?: string | null) => ({
    subject: "Confirmá tu mail — Cifra",
    kicker: "Confirmá tu mail",
    accent: C.silver,
    heading: "Confirmá tu cuenta",
    preheader: "Un toque para abrir tu libro.",
    body: `${greeting(name)} Tocá el botón para confirmar el mail y abrir tu libro. El enlace vence.`,
    cta: "Confirmar mail",
    showLink: true,
    signoff: "¿No creaste una cuenta en Cifra? Ignorá este mail y no pasa nada.",
    note: "Recibiste este mail porque alguien se registró en Cifra con esta dirección.",
  }),
  reset: {
    subject: "Cambiar tu contraseña — Cifra",
    kicker: "Seguridad",
    accent: C.gold,
    heading: "Cambiar contraseña",
    preheader: "El enlace vale una hora.",
    body: "Pediste una clave nueva. Tocá el botón para elegirla.",
    info: {
      lead: "El enlace vale una hora.",
      text: "Después tenés que pedir otro desde cifra.lol/olvide.",
    },
    cta: "Elegir nueva clave",
    showLink: true,
    signoff: "Si no fuiste vos, ignorá este mail. Tu clave sigue igual.",
    note: SECURITY_NOTE,
  },
  passwordChanged: {
    subject: "Tu contraseña de Cifra cambió",
    kicker: "Seguridad",
    accent: C.gold,
    heading: "Contraseña actualizada",
    preheader: "Si no fuiste vos, cambiala ahora.",
    body: "La clave de tu cuenta cambió. Si fuiste vos, no tenés que hacer nada.",
    info: {
      lead: "¿No fuiste vos?",
      text: "Entrá a cifra.lol/olvide y cambiá la clave ahora.",
    },
    cta: "Abrir Cifra",
    signoff: "Si tenés dudas, escribinos a hola@cifra.lol.",
    note: SECURITY_NOTE,
  },
  deleted: {
    subject: "Borramos tu cuenta de Cifra",
    kicker: "Cuenta",
    accent: C.rose,
    heading: "Cuenta eliminada",
    preheader: "El libro ya no está en Cifra.",
    body: "El libro, las cajas y la sesión ya no están en Cifra.",
    info: { lead: "¿No fuiste vos?", text: "Escribinos a hola@cifra.lol." },
    signoff: "Gracias por haber llevado tus cuentas en Cifra.",
    note: "Este es el último mail que te mandamos.",
  },
  welcome: {
    subject: "Tu libro ya está en Cifra",
    kicker: "Listo",
    accent: C.green,
    heading: "Tu libro ya está en Cifra",
    preheader: "El diario queda en tu cuenta, no en el teléfono.",
    /** The sender prefixes `greeting(name)`. */
    body: "Confirmaste el mail. El diario y la analítica quedan en tu cuenta, no en el teléfono.",
    ledger: [
      ["Cuenta", "Confirmada"],
      ["Libros", "Personal · Negocio"],
      ["Monedas", "ARS · USD · USDT"],
    ],
    cta: "Entrar al libro",
    signoff: "Anotá el primer gasto y el diario empieza a contar.",
    note: "Recibiste este mail porque confirmaste tu cuenta en Cifra.",
  },
} as const;

export type MailContent = Omit<SendInput, "to" | "subject">;

const SERIF = "'Instrument Serif',Georgia,'Times New Roman',serif";
const SANS = "Outfit,Helvetica,Arial,sans-serif";

/** A table cell that keeps its background in Apple Mail / Outlook dark mode. */
function cell(bg: string, style: string, inner: string, attrs = ""): string {
  return `<td bgcolor="${bg}" style="background:${bg};${style}"${attrs ? " " + attrs : ""}>${inner}</td>`;
}

function table(inner: string, attrs = "", style = ""): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${attrs ? " " + attrs : ""} style="border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt;${style}">${inner}</table>`;
}

const row = (inner: string) => `<tr>${inner}</tr>`;

export function renderMailHtml(
  content: MailContent,
  opts: { assetOrigin?: string } = {},
): string {
  const { heading, body, cta, url, preheader, kicker, info, ledger, showLink, signoff, note } =
    content;
  const accent = content.accent ?? C.silver;
  const assets = (opts.assetOrigin ?? MAIL_ASSET_ORIGIN).replace(/\/+$/, "");
  const e = escapeHtml;

  const preview = preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${e(preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    : "";

  const header = table(
    row(
      cell(
        C.bg,
        "padding:0 4px 22px;",
        table(
          row(
            cell(
              C.bg,
              `font-family:${SERIF};font-size:38px;line-height:38px;font-weight:400;letter-spacing:-0.01em;color:${C.fg};mso-line-height-rule:exactly;`,
              "Cifra",
              'class="serif" valign="bottom"',
            ) +
              cell(
                C.bg,
                "padding-left:10px;padding-bottom:2px;",
                `<img src="${e(assets)}/mail/bars.png" width="23" height="30" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:23px;height:30px;">`,
                'valign="bottom"',
              ),
          ),
        ),
        'valign="bottom"',
      ) +
        cell(
          C.bg,
          `padding:0 4px 36px;font-family:${SANS};font-size:11px;line-height:14px;letter-spacing:0.18em;text-transform:uppercase;color:${C.subtle};`,
          "REGISTRO DIARIO",
          'class="sans" align="right" valign="bottom"',
        ),
    ),
    'width="100%"',
  );

  const kickerRows = kicker
    ? row(
        cell(
          C.card,
          "padding:0 0 16px;",
          table(row(cell(accent, "width:28px;height:3px;font-size:0;line-height:0;border-radius:2px;", "&nbsp;", 'width="28" height="3"'))),
        ),
      ) +
      row(
        cell(
          C.card,
          `padding:0 0 14px;font-family:${SANS};font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${accent};`,
          e(kicker.toUpperCase()),
          'class="sans"',
        ),
      )
    : "";

  const infoRow = info
    ? row(
        cell(
          C.card,
          "padding:24px 0 0;",
          table(
            row(
              cell(
                C.elevated,
                `padding:14px 16px;border:1px solid ${C.border};border-radius:12px;`,
                table(
                  row(
                    cell(
                      C.elevated,
                      "padding-top:7px;width:8px;",
                      `<div style="width:8px;height:8px;border-radius:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</div>`,
                      'width="8" valign="top"',
                    ) +
                      cell(
                        C.elevated,
                        `padding-left:12px;font-family:${SANS};font-size:14px;line-height:21px;color:${C.body};`,
                        `${info.lead ? `<strong style="color:${C.fg};font-weight:600;">${e(info.lead)}</strong> ` : ""}${e(info.text)}`,
                        'class="sans" valign="top"',
                      ),
                  ),
                  'width="100%"',
                ),
              ),
            ),
            'width="100%"',
          ),
        ),
      )
    : "";

  const ledgerRow =
    ledger && ledger.length
      ? row(
          cell(
            C.card,
            "padding:26px 0 0;",
            table(
              ledger
                .map(([k, v], i) =>
                  row(
                    cell(
                      C.card,
                      `padding:12px 0;border-bottom:1px solid ${C.border};${i === 0 ? `border-top:1px solid ${C.border};` : ""}font-family:${SANS};font-size:14px;line-height:20px;color:${C.muted};`,
                      e(k),
                      'class="sans" align="left"',
                    ) +
                      cell(
                        C.card,
                        `padding:12px 0;border-bottom:1px solid ${C.border};${i === 0 ? `border-top:1px solid ${C.border};` : ""}font-family:${SANS};font-size:14px;line-height:20px;color:${C.fg};`,
                        e(v),
                        'class="sans" align="right"',
                      ),
                  ),
                )
                .join(""),
              'width="100%"',
              "border-collapse:collapse;",
            ),
          ),
        )
      : "";

  const button =
    cta && url
      ? row(
          cell(
            C.card,
            "padding:30px 0 0;",
            table(
              row(
                cell(
                  C.fg,
                  "border-radius:999px;",
                  `<a href="${e(url)}" target="_blank" class="sans" style="display:inline-block;border:solid ${C.fg};border-width:15px 30px;border-radius:999px;background:${C.fg};font-family:${SANS};font-size:15px;line-height:18px;font-weight:600;letter-spacing:0.005em;color:${C.bg};text-decoration:none;">${e(cta)}&nbsp;&nbsp;&rarr;</a>`,
                ),
              ),
            ),
          ),
        )
      : "";

  const linkRow =
    showLink && url
      ? row(
          cell(
            C.card,
            `padding:16px 0 0;font-family:${SANS};font-size:12.5px;line-height:19px;color:${C.subtle};`,
            `¿El botón no anda? Copiá este enlace en el navegador:<br><a href="${e(url)}" target="_blank" style="color:${C.muted};text-decoration:none;border-bottom:1px solid ${C.borderStrong};word-break:break-all;">${e(url)}</a>`,
            'class="sans"',
          ),
        )
      : "";

  const signoffRows = signoff
    ? row(
        cell(
          C.card,
          "padding:34px 0 0;",
          table(row(cell(C.border, "height:1px;font-size:0;line-height:0;", "&nbsp;", 'height="1"')), 'width="100%"'),
        ),
      ) +
      row(
        cell(
          C.card,
          `padding:18px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};`,
          e(signoff),
          'class="sans"',
        ),
      )
    : "";

  const card = table(
    row(
      cell(
        C.card,
        `padding:44px 44px 40px;border:1px solid ${C.border};border-radius:20px;`,
        table(
          kickerRows +
            row(
              cell(
                C.card,
                `padding:0 0 18px;font-family:${SERIF};font-size:46px;line-height:48px;font-weight:400;letter-spacing:-0.01em;color:${C.fg};mso-line-height-rule:exactly;`,
                `<h1 class="serif h1" style="margin:0;font-family:${SERIF};font-size:46px;line-height:48px;font-weight:400;color:${C.fg};">${e(heading)}</h1>`,
                'class="serif"',
              ),
            ) +
            row(
              cell(
                C.card,
                `padding-right:40px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body};`,
                e(body),
                'class="sans body"',
              ),
            ) +
            infoRow +
            ledgerRow +
            button +
            linkRow +
            signoffRows,
          'width="100%"',
        ),
        'class="card"',
      ),
    ),
    'width="100%"',
  );

  const footer = table(
    row(
      cell(
        C.bg,
        "padding:22px 0 0 4px;width:12px;",
        `<img src="${e(assets)}/mail/bars-muted.png" width="12" height="16" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:12px;height:16px;">`,
        'width="12" valign="top"',
      ) +
        cell(
          C.bg,
          `padding:22px 0 0 14px;font-family:${SANS};font-size:12px;line-height:19px;color:${C.subtle};`,
          `<a href="${APP_ORIGIN}" target="_blank" style="color:${C.muted};text-decoration:none;">cifra.lol</a> · <a href="mailto:hola@cifra.lol" style="color:${C.muted};text-decoration:none;">hola@cifra.lol</a>${note ? `<br>${e(note)}` : ""}`,
          'class="sans" valign="top"',
        ),
    ),
  );

  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${e(heading)} · Cifra</title>
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&amp;family=Outfit:wght@400;500;600&amp;display=swap" rel="stylesheet">
<!--<![endif]-->
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>.serif,.serif h1{font-family:Georgia,'Times New Roman',serif !important;} .sans,.sans a{font-family:Arial,Helvetica,sans-serif !important;}</style>
<![endif]-->
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0 !important; padding:0 !important; background:${C.bg} !important; }
  @media (prefers-color-scheme: light) {
    body, .bg { background:${C.bg} !important; }
  }
  a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; font-size:inherit !important; font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important; }
  u + #body a { color:inherit; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .outer { padding:28px 16px 32px !important; }
    .card { padding:32px 24px 30px !important; }
    .h1 { font-size:38px !important; line-height:40px !important; }
    .body { padding-right:0 !important; }
  }
</style>
</head>
<body id="body" class="bg" bgcolor="${C.bg}" style="margin:0;padding:0;background:${C.bg};color:${C.body};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${preview}
${table(
  row(
    cell(
      C.bg,
      "padding:44px 40px 40px;",
      `<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
${table(row(cell(C.bg, "", header)) + row(cell(C.bg, "", card)) + row(cell(C.bg, "", footer)), 'width="100%" align="center"', "max-width:600px;margin:0 auto;")}
<!--[if mso]></td></tr></table><![endif]-->`,
      'class="outer bg" align="center"',
    ),
  ),
  'width="100%" class="bg"',
  `background:${C.bg};`,
)}
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

/** Plain-text alternative: same copy, same order, links spelled out. */
export function renderMailText(content: MailContent): string {
  const lines: string[] = ["CIFRA · Registro diario", ""];
  if (content.kicker) lines.push(content.kicker.toUpperCase());
  lines.push(content.heading, "", content.body);
  if (content.info) {
    lines.push("", [content.info.lead, content.info.text].filter(Boolean).join(" "));
  }
  if (content.ledger?.length) {
    lines.push("");
    for (const [k, v] of content.ledger) lines.push(`${k}: ${v}`);
  }
  if (content.url) {
    lines.push("", content.cta ? `${content.cta}: ${content.url}` : content.url);
  }
  if (content.signoff) lines.push("", content.signoff);
  lines.push("", "—", "cifra.lol · hola@cifra.lol");
  if (content.note) lines.push(content.note);
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
      text: renderMailText(input),
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
    { to, url: origin, ...MAIL.welcome, body: `${greeting(name)} ${MAIL.welcome.body}` },
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
