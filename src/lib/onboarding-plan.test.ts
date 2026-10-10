import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMMON_FIJOS, moreFijos, onboardingFijos, suggestTope, templateFor } from "./onboarding-plan.ts";

describe("onboarding: the tope comes from the income", () => {
  it("no income → no tope (nothing invented)", () => {
    assert.equal(suggestTope(null), 0);
    assert.equal(suggestTope(0), 0);
  });
  it("80 % of the income, rounded down to $ 10.000", () => {
    assert.equal(suggestTope(1_200_000), 960_000);
    assert.equal(suggestTope(853_500), 680_000);
  });
});

describe("onboarding: fijos a few at a time", () => {
  it("shows 4 common ones first; the rest behind «Agregar otro», without the income", () => {
    assert.equal(COMMON_FIJOS.length, 4);
    const more = moreFijos();
    assert.ok(more.includes("Netflix"));
    assert.ok(!more.includes("Sueldo"));
    assert.ok(!more.some((n) => (COMMON_FIJOS as readonly string[]).includes(n)));
  });
  it("only rows with an amount; the income becomes Sueldo; no duplicates", () => {
    const got = onboardingFijos(1_200_000, [
      { name: "Alquiler", amount: 450_000 },
      { name: "Expensas", amount: null },
      { name: " Gimnasio ", amount: 30_000 },
      { name: "alquiler", amount: 1 },
      { name: "sueldo", amount: 5 },
    ]);
    assert.deepEqual(got, [
      { name: "Sueldo", amount: 1_200_000 },
      { name: "Alquiler", amount: 450_000 },
      { name: "Gimnasio", amount: 30_000 },
    ]);
  });
  it("skipping everything is fine", () => assert.deepEqual(onboardingFijos(null, []), []));
  it("custom names get a generic expense template", () => {
    assert.equal(templateFor("Alquiler").day, 5);
    assert.equal(templateFor("Gimnasio").type, "expense");
  });
});
