import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compoundMonthly, wealthPlan, wealthPlanText } from "./wealth-plan.ts";

describe("wealth plan", () => {
  it("compounds a monthly index contribution", () => {
    const v = compoundMonthly(100, 0.07, 10);
    assert.ok(v > 12_000);
    assert.ok(v < 25_000);
  });

  it("does not invest when the cap already spends the income", () => {
    const plan = wealthPlan({ incomeArs: 5_000_000, capArs: 5_830_000, usdtRate: 1600 });
    assert.equal(plan.mode, "reparar");
    const text = wealthPlanText({ incomeArs: 5_000_000, expenseArs: 4_200_000, capArs: 5_830_000, usdtRate: 1600 });
    assert.match(text, /MODO: reparar/);
    assert.match(text, /OBJETIVO/);
    assert.match(text, /S&P 500/);
  });

  it("splits a real surplus into an index hold and a small crypto hold", () => {
    const plan = wealthPlan({ incomeArs: 8_000_000, capArs: 5_830_000, usdtRate: 1600 });
    assert.equal(plan.mode, "invertir");
    assert.ok(plan.indexUsd > plan.cryptoUsd);
    assert.equal(plan.indexUsd + plan.cryptoUsd, plan.microUsd);
  });
});
