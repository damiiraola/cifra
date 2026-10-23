import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { monthDeltaPct } from "./month-compare.ts";

const days = (withMoves: number) =>
  Array.from({ length: 30 }, (_, i) => ({ count: i < withMoves ? 1 : 0 }));

describe("monthDeltaPct", () => {
  it("hides the % when the previous month has few days with movimientos", () => {
    assert.equal(monthDeltaPct(172_200, 10_000, days(2)), null);
    assert.equal(monthDeltaPct(172_200, 10_000, days(6)), null);
  });
  it("hides it when nothing was spent in the same stretch", () => {
    assert.equal(monthDeltaPct(5_000, 0, days(20)), null);
  });
  it("compares when the previous month has enough data", () => {
    assert.equal(monthDeltaPct(12_000, 10_000, days(7)), 20);
    assert.equal(monthDeltaPct(8_000, 10_000, days(25)), -20);
  });
});
