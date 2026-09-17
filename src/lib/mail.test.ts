import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAIL, greeting } from "./mail.ts";

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

  it("greeting falls back", () => {
    assert.equal(greeting(null), "Hola.");
    assert.equal(greeting("  "), "Hola.");
  });
});
