import { test } from "node:test";
import assert from "node:assert/strict";
import { dueDate, dueUnposted, likelyDuplicate } from "./recurring.ts";
import type { Recurring, Transaction } from "./types.ts";

const rec = (extra: Partial<Recurring> = {}): Recurring => ({
  id: "r1",
  bookId: "personal",
  type: "expense",
  name: "Alquiler",
  amount: 400000,
  currency: "ARS",
  categoryId: "vivienda",
  accountId: "bank",
  method: "transferencia",
  day: 5,
  note: "",
  active: true,
  ...extra,
});

const tx = (extra: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  type: "expense",
  amount: 400000,
  currency: "ARS",
  categoryId: "vivienda",
  note: "",
  merchant: "",
  date: "2026-10-03",
  method: "transferencia",
  createdAt: "",
  bookId: "personal",
  accountId: "bank",
  counterpartyId: "",
  amountTo: 0,
  rateArs: 0,
  rateLocked: false,
  recurringId: "",
  ...extra,
});

test("day 31 lands on the last day of short months", () => {
  assert.equal(dueDate("2026-02", 31), "2026-02-28");
  assert.equal(dueDate("2028-02", 31), "2028-02-29");
  assert.equal(dueDate("2026-04", 31), "2026-04-30");
  assert.equal(dueDate("2026-10", 31), "2026-10-31");
});

test("future fijos of this month are not pending", () => {
  const rs = [rec({ id: "a", day: 1 }), rec({ id: "b", day: 20 }), rec({ id: "c", day: 2, active: false })];
  const due = dueUnposted(rs, [], "2026-10", "2026-10-03");
  assert.deepEqual(due.map((r) => r.id), ["a"]);
  // A past month: everything active is due.
  assert.deepEqual(dueUnposted(rs, [], "2026-09", "2026-10-03").map((r) => r.id), ["a", "b"]);
  // Already posted ones drop out.
  const posted = [tx({ id: "rec_a_2026-10", recurringId: "a", date: "2026-10-01" })];
  assert.deepEqual(dueUnposted(rs, posted, "2026-10", "2026-10-03"), []);
});

test("likelyDuplicate finds a hand-loaded twin in the same month", () => {
  const r = rec();
  assert.ok(likelyDuplicate(r, [tx()], "2026-10"));
  assert.ok(likelyDuplicate(r, [tx({ amount: 401000 })], "2026-10"), "within 1%");
  assert.equal(likelyDuplicate(r, [tx({ amount: 450000 })], "2026-10"), null);
  assert.equal(likelyDuplicate(r, [tx({ date: "2026-09-05" })], "2026-10"), null);
  assert.equal(likelyDuplicate(r, [tx({ categoryId: "otros" })], "2026-10"), null);
  assert.equal(likelyDuplicate(r, [tx({ recurringId: "r1" })], "2026-10"), null, "the fijo's own post is not a duplicate");
  assert.equal(likelyDuplicate(r, [tx({ bookId: "negocio" })], "2026-10"), null);
});
