import { test } from "node:test";
import assert from "node:assert/strict";
import { amountInput, parseAmount } from "./format.ts";

test("amountInput shows Argentine thousands separators", () => {
  assert.equal(amountInput(1_150_000), "1.150.000");
  assert.equal(amountInput(120.5), "120,5");
  assert.equal(amountInput(0), "");
  assert.equal(amountInput(undefined), "");
});

test("amountInput round-trips through parseAmount", () => {
  for (const n of [1_150_000, 45_300, 1_150, 120.5, 1_000.25, 8_999, 1.5, 300]) {
    assert.equal(parseAmount(amountInput(n)), n, `round-trip ${n}`);
  }
});
