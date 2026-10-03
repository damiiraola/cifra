import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAIL, MAIL_COLORS, greeting, renderMailHtml, renderMailText, type MailContent } from "./mail.ts";

const URL_VERIFY = "https://cifra.lol/api/auth/verify-email?token=abc&callbackURL=/";

/** The five live templates, filled the way the senders fill them. */
const FIVE: Record<string, MailContent & { subject: string }> = {
  verify: { ...MAIL.verify("Damian"), url: URL_VERIFY },
  reset: { ...MAIL.reset, url: "https://cifra.lol/reset?token=xyz" },
  passwordChanged: { ...MAIL.passwordChanged, url: "https://cifra.lol" },
  deleted: { ...MAIL.deleted },
  welcome: { ...MAIL.welcome, url: "https://cifra.lol", body: `${greeting("Damian")} ${MAIL.welcome.body}` },
};

describe("mail templates — copy", () => {
  it("keeps the five subjects", () => {
    assert.deepEqual(
      Object.values(FIVE).map((t) => t.subject),
      [
        "Confirmá tu mail — Cifra",
        "Cambiar tu contraseña — Cifra",
        "Tu contraseña de Cifra cambió",
        "Borramos tu cuenta de Cifra",
        "Tu libro ya está en Cifra",
      ],
    );
  });

  it("verify greets by name, and without a name too", () => {
    const t = MAIL.verify("Damian");
    assert.match(t.body, /^Hola Damian\. /);
    assert.match(MAIL.verify(null).body, /^Hola\. /);
    assert.equal(t.cta, "Confirmar mail");
    assert.equal(t.kicker, "Confirmá tu mail");
  });

  it("deleted has no button and points to hola@cifra.lol", () => {
    assert.equal("cta" in MAIL.deleted, false);
    assert.match(MAIL.deleted.info.text, /hola@cifra\.lol/);
    assert.equal(MAIL.deleted.note, "Este es el último mail que te mandamos.");
  });

  it("reset says the link lasts an hour; password-changed points to /olvide", () => {
    assert.equal(MAIL.reset.info.lead, "El enlace vale una hora.");
    assert.match(MAIL.passwordChanged.info.text, /cifra\.lol\/olvide/);
    assert.notEqual(MAIL.reset.subject, MAIL.passwordChanged.subject);
  });

  it("welcome has the ledger rows and its own footer note", () => {
    assert.equal(MAIL.welcome.cta, "Entrar al libro");
    assert.equal(MAIL.welcome.heading, "Tu libro ya está en Cifra");
    assert.deepEqual(MAIL.welcome.ledger.map(([k]) => k), ["Cuenta", "Libros", "Monedas"]);
    assert.doesNotMatch(MAIL.welcome.note, /Si no fuiste vos/);
  });

  it("each template has its accent from the app palette", () => {
    assert.equal(MAIL.verify().accent, MAIL_COLORS.silver);
    assert.equal(MAIL.reset.accent, MAIL_COLORS.gold);
    assert.equal(MAIL.passwordChanged.accent, MAIL_COLORS.gold);
    assert.equal(MAIL.deleted.accent, MAIL_COLORS.rose);
    assert.equal(MAIL.welcome.accent, MAIL_COLORS.green);
  });
});

describe("mail templates — HTML", () => {
  for (const [name, t] of Object.entries(FIVE)) {
    it(`${name}: dark, table-based, 600px, absolute PNG icons`, () => {
      const html = renderMailHtml(t);
      assert.match(html, /<meta name="color-scheme" content="dark">/);
      assert.match(html, /bgcolor="#09090B"/);
      assert.match(html, /max-width:600px/);
      assert.match(html, /role="presentation"/);
      assert.match(html, /src="https:\/\/cifra\.lol\/mail\/bars\.png" width="23" height="30"/);
      assert.match(html, /src="https:\/\/cifra\.lol\/mail\/bars-muted\.png"/);
      assert.doesNotMatch(html, /\.svg/);
      // White only lives in the Gmail blend rule, never in the markup.
      const markup = html.replace(/<style>[\s\S]*?<\/style>/g, "");
      assert.doesNotMatch(markup, /#ffffff|#fff\b|bgcolor="white"/i);
      assert.match(html, /'Instrument Serif',Georgia,'Times New Roman',serif/);
      assert.match(html, /Outfit,Helvetica,Arial,sans-serif/);
      assert.ok(html.includes(t.heading));
      assert.ok(html.includes(t.kicker!.toUpperCase()));
      if (t.signoff) assert.ok(html.includes(t.signoff));
    });
  }

  it("button and fallback link carry the exact url, escaped", () => {
    const html = renderMailHtml(FIVE.verify);
    const escaped = URL_VERIFY.replaceAll("&", "&amp;");
    assert.ok(html.includes(`<a href="${escaped}" target="_blank" class="sans c-btn"`));
    assert.match(html, /¿El botón no anda\? Copiá este enlace/);
    assert.equal(html.split(`href="${escaped}"`).length - 1, 2);
  });

  it("every background is also a flat gradient (Gmail dark mode does not invert images)", () => {
    for (const t of Object.values(FIVE)) {
      const html = renderMailHtml(t);
      const colours = [...html.matchAll(/background-color:(#[0-9A-F]{6});/gi)].map((m) => m[1]);
      assert.ok(colours.length > 20);
      for (const c of colours) assert.ok(html.includes(`background-color:${c};background-image:linear-gradient(${c},${c});`));
      assert.match(html, /<body class="body" bgcolor="#09090B" style="margin:0;padding:0;background-color:#09090B;background-image:linear-gradient\(#09090B,#09090B\);/);
      // No CSS borders: Gmail would turn them light grey. Lines are cells.
      assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/g, ""), /border:1px solid|border-(top|bottom):1px solid #2A2A2E/);
    }
  });

  it("text is wrapped in the Gmail blend layers, scoped to Gmail only", () => {
    const html = renderMailHtml(FIVE.welcome);
    assert.match(html, /u \+ \.body \.gmail-blend-screen \{ background:#000; mix-blend-mode:screen; \}/);
    assert.match(html, /u \+ \.body \.gmail-blend-difference \{ background:#000; mix-blend-mode:difference; \}/);
    assert.match(html, /u \+ \.body \.gmail-blend-exclusion-blk \{ background:#000; mix-blend-mode:exclusion; \}/);
    assert.ok(html.includes('<div class="gmail-blend-screen"><div class="gmail-blend-difference"><h1 '));
    assert.ok(html.includes('<span class="gmail-blend-exclusion-blk"><span class="gmail-blend-difference-blk">Entrar al libro'));
    // Blend styles are never inline, so non-Gmail clients ignore them.
    assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/g, ""), /mix-blend-mode/);
    assert.match(html, /<meta name="color-scheme" content="dark">/);
    assert.match(html, /<meta name="supported-color-schemes" content="dark">/);
    assert.match(html, /\[data-ogsc\] \.c-acc \{ color:#8FA898 !important; \}/);
  });

  it("password-changed has a button but no copy-link fallback", () => {
    const html = renderMailHtml(FIVE.passwordChanged);
    assert.match(html, /Abrir Cifra/);
    assert.doesNotMatch(html, /¿El botón no anda/);
  });

  it("deleted renders no button", () => {
    const html = renderMailHtml(FIVE.deleted);
    assert.doesNotMatch(html, /&rarr;<\/a>/);
  });

  it("escapes user-controlled text (name)", () => {
    const html = renderMailHtml({ ...MAIL.verify("<b>x</b>"), url: "https://cifra.lol" });
    assert.ok(html.includes("Hola &lt;b&gt;x&lt;/b&gt;."));
    assert.equal(html.includes("<b>x</b>"), false);
  });

  it("asset origin can be overridden for local previews", () => {
    const html = renderMailHtml(FIVE.welcome, { assetOrigin: "http://127.0.0.1:9000/" });
    assert.match(html, /src="http:\/\/127\.0\.0\.1:9000\/mail\/bars\.png"/);
  });
});

describe("mail templates — plain text", () => {
  it("verify spells out the link next to the call to action", () => {
    const text = renderMailText(FIVE.verify);
    assert.match(text, /^CIFRA · Registro diario\n\nCONFIRMÁ TU MAIL\nConfirmá tu cuenta\n\nHola Damian\./);
    assert.ok(text.includes(`Confirmar mail: ${URL_VERIFY}`));
    assert.match(text, /Recibiste este mail porque alguien se registró/);
  });

  it("welcome lists the ledger rows", () => {
    const text = renderMailText(FIVE.welcome);
    assert.match(text, /Cuenta: Confirmada\nLibros: Personal · Negocio\nMonedas: ARS · USD · USDT/);
  });

  it("deleted has no link but has the contact line", () => {
    const text = renderMailText(FIVE.deleted);
    assert.match(text, /¿No fuiste vos\? Escribinos a hola@cifra\.lol\./);
    assert.doesNotMatch(text, /https?:\/\//);
    assert.ok(text.trimEnd().endsWith("Este es el último mail que te mandamos."));
  });

  it("has no HTML in any of the five", () => {
    for (const t of Object.values(FIVE)) assert.doesNotMatch(renderMailText(t), /<[a-z]/i);
  });
});
