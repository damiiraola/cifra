import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAIL, renderMailHtml } from "./mail.ts";

describe("mail templates", () => {
  it("verify greets by name", () => {
    const t = MAIL.verify("Damian");
    assert.equal(t.subject, "Confirmá tu mail — Cifra");
    assert.match(t.body, /Hola Damian/);
    assert.equal(t.cta, "Confirmar mail");
  });

  it("deleted has no button", () => {
    assert.equal("cta" in MAIL.deleted, false);
    assert.match(MAIL.deleted.body, /hola@cifra\.lol/);
  });

  it("reset and password-changed are distinct", () => {
    assert.notEqual(MAIL.reset.subject, MAIL.passwordChanged.subject);
    assert.equal(MAIL.welcome.cta, "Entrar al libro");
  });

  it("stays black and uses the bar icon", () => {
    const html = renderMailHtml({
      heading: "Listo",
      body: "Tu libro.",
      cta: "Entrar",
      url: "https://cifra.lol",
      preheader: "Listo",
    });
    assert.match(html, /color-scheme" content="dark"/);
    assert.match(html, /bgcolor="#000000"/);
    assert.match(html, /icon-192\.png/);
    assert.equal(html.includes("#ffffff"), false);
  });
});
