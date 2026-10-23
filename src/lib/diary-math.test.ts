import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasAverageHistory, heatmapIntensity, isFixedExpense, pickDiaryDay } from "./diary-math.ts";

describe("isFixedExpense", () => {
  it("treats vivienda and recurring alimentos as fijo", () => {
    assert.equal(isFixedExpense({ type: "expense", categoryId: "vivienda", recurringId: "" }), true);
    assert.equal(isFixedExpense({ type: "expense", categoryId: "alimentos", recurringId: "r1" }), true);
    assert.equal(isFixedExpense({ type: "expense", categoryId: "alimentos", recurringId: "" }), false);
    assert.equal(isFixedExpense({ type: "income", categoryId: "sueldo", recurringId: "" }), false);
  });
});

describe("pickDiaryDay", () => {
  const days = [
    { date: "2026-08-01", spent: 0, count: 0 },
    { date: "2026-08-15", spent: 12000, count: 2 },
    { date: "2026-08-31", spent: 0, count: 0 },
  ];

  it("returns today when viewing current month", () => {
    assert.equal(pickDiaryDay("2026-09", days, "2026-09-15"), "2026-09-15");
  });

  it("returns last day with movement in a past month", () => {
    assert.equal(pickDiaryDay("2026-08", days, "2026-09-15"), "2026-08-15");
  });
});

describe("heatmapIntensity", () => {
  it("keeps empty days at 0 and paints a floor on any spend", () => {
    assert.equal(heatmapIntensity(0, 100), 0);
    assert.ok(heatmapIntensity(1, 100) >= 0.22);
    assert.ok(heatmapIntensity(100, 100) <= 1);
  });
});

describe("hasAverageHistory", () => {
  const d = (n: number) => ({ date: `2026-10-${String(n).padStart(2, "0")}` });
  it("needs 7 distinct days with movimientos", () => {
    assert.equal(hasAverageHistory([], "2026-10-20"), false);
    assert.equal(hasAverageHistory([d(1), d(1), d(2), d(3), d(4), d(5), d(6)], "2026-10-20"), false);
    assert.equal(hasAverageHistory([d(1), d(2), d(3), d(4), d(5), d(6), d(7)], "2026-10-20"), true);
  });
  it("ignores future-dated movimientos", () => {
    assert.equal(hasAverageHistory([d(1), d(2), d(3), d(4), d(5), d(6), d(25)], "2026-10-20"), false);
  });
});
