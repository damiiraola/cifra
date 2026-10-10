import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { currencyForCaja, firstProblem, showsPayMethod, startsNewSession } from "./quick-form.ts";

describe("Nuevo movimiento: the form keeps what you typed", () => {
  const draft = {};
  it("opening the sheet starts a session", () => {
    assert.equal(startsNewSession(null, { open: true, editingId: null, draft }), true);
    assert.equal(startsNewSession({ open: false, editingId: null, draft }, { open: true, editingId: null, draft }), true);
  });
  it("a background refresh while open (same draft, same movement) does NOT reset", () => {
    // Before the fix the reset ran on every `accounts` change: this is that case.
    const prev = { open: true, editingId: null, draft };
    assert.equal(startsNewSession(prev, { open: true, editingId: null, draft }), false);
  });
  it("editing another movement or a new draft (assistant, shortcut) resets", () => {
    const prev = { open: true, editingId: null, draft };
    assert.equal(startsNewSession(prev, { open: true, editingId: "t1", draft }), true);
    assert.equal(startsNewSession(prev, { open: true, editingId: null, draft: {} }), true);
  });
  it("closed: never resets", () => {
    assert.equal(startsNewSession({ open: true, editingId: null, draft }, { open: false, editingId: null, draft }), false);
  });
});

describe("currency follows the caja", () => {
  it("US$ 25 on a USD caja is USD, even if the form state still says ARS", () => {
    assert.equal(currencyForCaja({ currency: "USD" }, "ARS"), "USD");
    assert.equal(currencyForCaja(undefined, "ARS"), "ARS");
  });
});

describe("Medio vs Caja", () => {
  it("asked only for a bank caja", () => {
    assert.equal(showsPayMethod("bank"), true);
    for (const k of ["cash", "mp", "crypto", "card"] as const) assert.equal(showsPayMethod(k), false);
  });
});

describe("the error points at the missing field", () => {
  const base = { type: "expense" as const, amount: 100, categoryId: "comida", accountId: "a", counterpartyId: "" };
  it("amount first", () => assert.deepEqual(firstProblem({ ...base, amount: null })?.field, "amount"));
  it("then category", () => assert.deepEqual(firstProblem({ ...base, categoryId: "" })?.field, "category"));
  it("transfer without destination", () => assert.equal(firstProblem({ ...base, type: "transfer", categoryId: "" })?.field, "to"));
  it("complete → no problem", () => assert.equal(firstProblem(base), null));
});
