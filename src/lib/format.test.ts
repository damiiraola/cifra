import { test } from "node:test";
import assert from "node:assert/strict";
import { amountInput, money, parseAmount } from "./format.ts";

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

test("los montos cortos llevan un decimal y no redondean al millón", () => {
  const nb = (s: string) => s.replace(/\s/g, " ");
  assert.equal(nb(money(1_800_000, "ARS", true)), "$1,8 M");
  assert.equal(nb(money(1_631_485, "ARS", true)), "$1,6 M");
  assert.equal(nb(money(2_000_000, "ARS", true)), "$2 M");
  assert.equal(nb(money(-1_400_000, "ARS", true)), "−$1,4 M");
  assert.equal(nb(money(99_999, "ARS", true)), "$ 99.999");
  assert.equal(nb(money(1_250_000, "USD", true)).includes("1,3 M"), true);
});
