import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { landingSignup } from "./landing-signup.ts";

describe("portada: invitación y lista de espera", () => {
  it("closed beta (and unknown): says so and offers the waiting list", () => {
    for (const m of ["invitacion", null] as const) {
      const s = landingSignup(m);
      assert.equal(s.cta, "Tengo invitación");
      assert.match(s.notice, /invitación/);
      assert.equal(s.showWaitlist, true);
    }
  });
  it("open signup: plain Crear cuenta, no waiting list", () => {
    assert.deepEqual(landingSignup("abierto"), { closed: false, cta: "Crear cuenta", notice: "", showWaitlist: false });
  });
  it("the landing links to the waiting list box", () => {
    const landing = readFileSync(new URL("../components/landing.tsx", import.meta.url), "utf8");
    const box = readFileSync(new URL("../components/waitlist-box.tsx", import.meta.url), "utf8");
    assert.match(landing, /href="#lista-de-espera"/);
    assert.match(box, /id="lista-de-espera"/);
  });
});
