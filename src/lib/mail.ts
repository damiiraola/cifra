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
  /** List of short lines, each with a coloured dot (the alert digest). */
  items?: ReadonlyArray<MailItem>;
  /** Unsubscribe link: footer link plus List-Unsubscribe headers (one click). */
  unsubscribeUrl?: string;
};

export type MailItem = { text: string; tone: "bad" | "warn" | "info" };

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

/**
 * Solid background that survives Gmail iOS/Android dark mode. Those apps
 * invert `background-color` but leave background images alone, so the same
 * colour also goes in as a flat `linear-gradient`. `bgcolor` stays for
 * Outlook and Apple Mail.
 */
export function solidBg(color: string): string {
  return `background-color:${color};background-image:linear-gradient(${color},${color});`;
}

/** Background class for Outlook.com / Outlook apps `[data-ogsb]` overrides. */
const BG_CLASS: Record<string, string> = {
  [C.bg]: "bg-page",
  [C.card]: "bg-card",
  [C.elevated]: "bg-elev",
  [C.border]: "bg-line",
  [C.fg]: "bg-btn",
};

/** A table cell whose background holds in every client's dark mode. */
function cell(bg: string, style: string, inner: string, attrs = "", cls = ""): string {
  const classes = [BG_CLASS[bg], cls].filter(Boolean).join(" ");
  return `<td bgcolor="${bg}"${classes ? ` class="${classes}"` : ""} style="${solidBg(bg)}${style}"${attrs ? " " + attrs : ""}>${inner}</td>`;
}

function table(inner: string, attrs = "", style = ""): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${attrs ? " " + attrs : ""} style="border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt;${style}">${inner}</table>`;
}

const row = (inner: string) => `<tr>${inner}</tr>`;

/**
 * Light text on a dark background. Gmail iOS turns light text dark; these two
 * blend layers (black backgrounds that Gmail turns white, then `difference`
 * and `screen`) undo that. They only switch on in Gmail (`u + .body`), so
 * every other client renders the text as written.
 * https://www.hteumeuleu.com/2021/fixing-gmail-dark-mode-css-blend-modes/
 */
export function keepLight(html: string): string {
  return `<div class="gmail-blend-screen"><div class="gmail-blend-difference">${html}</div></div>`;
}

/**
 * Dark text on a light background (the button). Same idea with `exclusion`:
 * in Gmail the label comes out as the inverse of the button colour, which
 * for #F4F4F0 is #0B0B0F.
 */
export function keepDark(html: string): string {
  return `<span class="gmail-blend-exclusion-blk"><span class="gmail-blend-difference-blk">${html}</span></span>`;
}

/** 1px horizontal line drawn as a cell, so Gmail cannot invert it. */
function hairline(color: string, bg: string): string {
  return table(
    row(cell(color, "height:1px;font-size:0;line-height:0;mso-line-height-rule:exactly;", "&nbsp;", 'height="1"')),
    'width="100%"',
    solidBg(bg),
  );
}

/**
 * Rounded box with a 1px border. The border is an outer cell (also a
 * gradient) instead of CSS `border`, which Gmail would turn light grey.
 */
function framed(fill: string, radius: number, padding: string, inner: string, innerCls = ""): string {
  return table(
    row(
      cell(
        C.border,
        `padding:1px;border-radius:${radius}px;`,
        table(row(cell(fill, `padding:${padding};border-radius:${radius - 1}px;`, inner, "", innerCls)), 'width="100%"'),
      ),
    ),
    'width="100%"',
  );
}

export function renderMailHtml(
  content: MailContent,
  opts: { assetOrigin?: string } = {},
): string {
  const { heading, body, cta, url, preheader, kicker, info, ledger, showLink, signoff, note, items, unsubscribeUrl } =
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
              keepLight("Cifra"),
              'valign="bottom"',
              "serif c-fg",
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
          keepLight("REGISTRO DIARIO"),
          'align="right" valign="bottom"',
          "sans c-subtle",
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
          keepLight(e(kicker.toUpperCase())),
          "",
          "sans c-acc",
        ),
      )
    : "";

  const infoRow = info
    ? row(
        cell(
          C.card,
          "padding:24px 0 0;",
          framed(
            C.elevated,
            12,
            "14px 16px",
            table(
              row(
                cell(
                  C.elevated,
                  "padding-top:7px;width:8px;",
                  table(row(cell(accent, "width:8px;height:8px;border-radius:4px;font-size:0;line-height:0;", "&nbsp;", 'width="8" height="8"'))),
                  'width="8" valign="top"',
                ) +
                  cell(
                    C.elevated,
                    `padding-left:12px;font-family:${SANS};font-size:14px;line-height:21px;color:${C.body};`,
                    keepLight(
                      `${info.lead ? `<strong class="c-fg" style="color:${C.fg};font-weight:600;">${e(info.lead)}</strong> ` : ""}${e(info.text)}`,
                    ),
                    'valign="top"',
                    "sans c-body",
                  ),
              ),
              'width="100%"',
            ),
          ),
        ),
      )
    : "";

  const dot: Record<MailItem["tone"], string> = { bad: C.rose, warn: C.gold, info: C.silver };
  const itemsRow =
    items && items.length
      ? row(
          cell(
            C.card,
            "padding:24px 0 0;",
            table(
              items
                .map((it, i) =>
                  row(
                    cell(
                      C.card,
                      i ? "padding-top:10px;" : "",
                      framed(
                        C.elevated,
                        12,
                        "14px 16px",
                        table(
                          row(
                            cell(
                              C.elevated,
                              "padding-top:7px;width:8px;",
                              table(row(cell(dot[it.tone], "width:8px;height:8px;border-radius:4px;font-size:0;line-height:0;", "&nbsp;", 'width="8" height="8"'))),
                              'width="8" valign="top"',
                            ) +
                              cell(
                                C.elevated,
                                `padding-left:12px;font-family:${SANS};font-size:14px;line-height:21px;color:${C.body};`,
                                keepLight(e(it.text)),
                                'valign="top"',
                                "sans c-body",
                              ),
                          ),
                          'width="100%"',
                        ),
                      ),
                    ),
                  ),
                )
                .join(""),
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
              row(cell(C.card, "", hairline(C.border, C.card), 'colspan="2"')) +
                ledger
                  .map(
                    ([k, v]) =>
                      row(
                        cell(
                          C.card,
                          `padding:12px 0;font-family:${SANS};font-size:14px;line-height:20px;color:${C.muted};`,
                          keepLight(e(k)),
                          'align="left"',
                          "sans c-muted",
                        ) +
                          cell(
                            C.card,
                            `padding:12px 0;font-family:${SANS};font-size:14px;line-height:20px;color:${C.fg};text-align:right;`,
                            keepLight(e(v)),
                            'align="right"',
                            "sans c-fg",
                          ),
                      ) + row(cell(C.card, "", hairline(C.border, C.card), 'colspan="2"')),
                  )
                  .join(""),
              'width="100%"',
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
                  "border-radius:999px;mso-padding-alt:15px 30px;",
                  `<a href="${e(url)}" target="_blank" class="sans c-btn" style="display:inline-block;padding:15px 30px;border-radius:999px;${solidBg(C.fg)}font-family:${SANS};font-size:15px;line-height:18px;font-weight:600;letter-spacing:0.005em;color:${C.bg};text-decoration:none;">${keepDark(`${e(cta)}&nbsp;&nbsp;&rarr;`)}</a>`,
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
            keepLight(
              `¿El botón no anda? Copiá este enlace en el navegador:<br><a href="${e(url)}" target="_blank" class="c-muted" style="color:${C.muted};text-decoration:none;border-bottom:1px solid ${C.borderStrong};word-break:break-all;">${e(url)}</a>`,
            ),
            "",
            "sans c-subtle",
          ),
        )
      : "";

  const signoffRows = signoff
    ? row(cell(C.card, "padding:34px 0 0;", hairline(C.border, C.card))) +
      row(
        cell(
          C.card,
          `padding:18px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};`,
          keepLight(e(signoff)),
          "",
          "sans c-muted",
        ),
      )
    : "";

  const card = framed(
    C.card,
    20,
    "44px 44px 40px",
    table(
      kickerRows +
        row(
          cell(
            C.card,
            `padding:0 0 18px;font-family:${SERIF};font-size:46px;line-height:48px;font-weight:400;letter-spacing:-0.01em;color:${C.fg};mso-line-height-rule:exactly;`,
            keepLight(
              `<h1 class="serif h1 c-fg" style="margin:0;font-family:${SERIF};font-size:46px;line-height:48px;font-weight:400;color:${C.fg};">${e(heading)}</h1>`,
            ),
            "",
            "serif",
          ),
        ) +
        row(
          cell(
            C.card,
            `padding-right:40px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body};`,
            keepLight(e(body)),
            "",
            "sans body-copy c-body",
          ),
        ) +
        infoRow +
        itemsRow +
        ledgerRow +
        button +
        linkRow +
        signoffRows,
      'width="100%"',
    ),
    "card",
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
          keepLight(
            `<a href="${APP_ORIGIN}" target="_blank" class="c-muted" style="color:${C.muted};text-decoration:none;">cifra.lol</a> · <a href="mailto:hola@cifra.lol" class="c-muted" style="color:${C.muted};text-decoration:none;">hola@cifra.lol</a>${note ? `<br>${e(note)}` : ""}${unsubscribeUrl ? `<br><a href="${e(unsubscribeUrl)}" target="_blank" class="c-muted" style="color:${C.muted};text-decoration:underline;">Dejar de recibir estos avisos</a>` : ""}`,
          ),
          'valign="top"',
          "sans c-subtle",
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
  body { margin:0 !important; padding:0 !important; background-color:${C.bg} !important; }
  @media (prefers-color-scheme: light) {
    body, .bg-page { background-color:${C.bg} !important; }
  }
  /* Gmail iOS / Android dark mode: undo the forced inversion of text. */
  u + .body .gmail-blend-screen { background:#000; mix-blend-mode:screen; }
  u + .body .gmail-blend-difference { background:#000; mix-blend-mode:difference; }
  u + .body .gmail-blend-exclusion-blk { background:#000; mix-blend-mode:exclusion; }
  u + .body .gmail-blend-difference-blk { background:#000; mix-blend-mode:difference; color:#fff; }
  /* Outlook.com / Outlook apps dark mode. */
  [data-ogsb] .bg-page { background-color:${C.bg} !important; }
  [data-ogsb] .bg-card { background-color:${C.card} !important; }
  [data-ogsb] .bg-elev { background-color:${C.elevated} !important; }
  [data-ogsb] .bg-line { background-color:${C.border} !important; }
  [data-ogsb] .bg-btn, [data-ogsb] .c-btn { background-color:${C.fg} !important; }
  [data-ogsc] .c-fg { color:${C.fg} !important; }
  [data-ogsc] .c-body { color:${C.body} !important; }
  [data-ogsc] .c-muted { color:${C.muted} !important; }
  [data-ogsc] .c-subtle { color:${C.subtle} !important; }
  [data-ogsc] .c-acc { color:${accent} !important; }
  [data-ogsc] .c-btn { color:${C.bg} !important; }
  a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; font-size:inherit !important; font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important; }
  u + .body a { color:inherit; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .outer { padding:28px 16px 32px !important; }
    .card { padding:32px 24px 30px !important; }
    .h1 { font-size:38px !important; line-height:40px !important; }
    .body-copy { padding-right:0 !important; }
  }
</style>
</head>
<body class="body" bgcolor="${C.bg}" style="margin:0;padding:0;${solidBg(C.bg)}color:${C.body};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${preview}
${table(
  row(
    cell(
      C.bg,
      "padding:44px 40px 40px;",
      `<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
${table(row(cell(C.bg, "", header)) + row(cell(C.bg, "", card)) + row(cell(C.bg, "", footer)), 'width="100%" align="center"', "max-width:600px;margin:0 auto;")}
<!--[if mso]></td></tr></table><![endif]-->`,
      'align="center"',
      "outer",
    ),
  ),
  'width="100%"',
  solidBg(C.bg),
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
  if (content.items?.length) {
    lines.push("");
    for (const it of content.items) lines.push(`• ${it.text}`);
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
  if (content.unsubscribeUrl) lines.push(`Dejar de recibir estos avisos: ${content.unsubscribeUrl}`);
  return lines.join("\n");
}

/**
 * Send one mail and record the outcome: failures go to the log (and Sentry if
 * SENTRY_DSN is set) and feed the "mails are down" notice. The address is
 * never logged; only the subject.
 */
export async function sendCifraMail(input: SendInput, opts?: { from?: string }): Promise<SendResult> {
  let result: SendResult;
  try {
    result = await deliverMail(input, opts);
  } catch (err) {
    await track(false, input.subject, err instanceof Error ? err.message : "Mail falló");
    throw err;
  }
  await track(result.ok, input.subject, result.ok ? "" : result.error);
  return result;
}

async function track(ok: boolean, kind: string, error: string) {
  if (typeof window !== "undefined") return;
  try {
    const { trackMailResult } = await import("@/lib/mail-health.server");
    await trackMailResult(ok, kind, error);
  } catch {
    /* no DB in unit tests; tracking is best effort */
  }
}

async function deliverMail(input: SendInput, opts?: { from?: string }): Promise<SendResult> {
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
      ...(input.unsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
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
  // Always from the configured MAIL_FROM. (It used to retry from a
  // placeholder example.com address when the domain was not verified.)
  for (const job of jobs) {
    const result = await sendCifraMail(job);
    if (!result.ok) return result;
  }
  return { ok: true };
}
