import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { goalPace, mergeGoals, toGoalCurrency, type Goal } from "./goals.ts";

function goal(patch: Partial<Goal> = {}): Goal {
  return {
    id: "g",
    bookId: "p",
    kind: "viaje",
    name: "Brasil",
    currency: "USD",
    target: 1000,
    saved: 200,
    deadline: "2026-12-31",
    priority: 2,
    active: true,
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
    ...patch,
  };
}

describe("goals", () => {
  it("turns leftover pesos into the goal currency", () => {
    assert.equal(toGoalCurrency(160_000, "USDT", { usd: 1400, usdt: 1600 }), 100);
    assert.equal(toGoalCurrency(76_390, "ARS", { usd: 1400, usdt: 1600 }), 76_390);
  });

  it("says how much per day is left until the date", () => {
    const pace = goalPace(goal(), "2026-12-01");
    assert.equal(pace.left, 800);
    assert.equal(pace.days, 30);
    assert.equal(pace.perDay, 26.67);
  });

  it("keeps the newer copy when the phone and the server disagree", () => {
    const merged = mergeGoals(
      [goal({ saved: 400, updatedAt: "2026-10-05" })],
      [goal({ saved: 200, updatedAt: "2026-10-02" })],
    );
    assert.equal(merged[0]?.saved, 400);
  });
});
