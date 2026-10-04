import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultCategory, methodForAccount } from "./quick-defaults.ts";

const cats = new Set(["alimentos", "otros", "sueldo", "ventas", "vivienda"]);

test("no silent Alimentación default", () => {
  assert.equal(defaultCategory("expense", "personal", "", cats), "");
  assert.equal(defaultCategory("expense", "personal", "vivienda", cats), "vivienda");
  assert.equal(defaultCategory("expense", "personal", "borrada", cats), "");
});

test("negocio gets business defaults", () => {
  assert.equal(defaultCategory("income", "business", "", cats), "ventas");
  assert.equal(defaultCategory("expense", "business", "", cats), "otros");
  assert.equal(defaultCategory("income", "personal", "", cats), "sueldo");
  assert.equal(defaultCategory("transfer", "personal", "", cats), "transferencias");
});

test("method follows the caja", () => {
  assert.equal(methodForAccount("crypto", "debito"), "crypto");
  assert.equal(methodForAccount("cash", "debito"), "efectivo");
  assert.equal(methodForAccount("mp", "credito"), "mercadopago");
  assert.equal(methodForAccount("bank", "credito"), "credito");
  assert.equal(methodForAccount("bank", "crypto"), "debito");
});
