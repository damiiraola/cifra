import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeRecurrings } from "./recurring-sync.ts";
import type { Recurring } from "./types.ts";

function rec(id: string, extra: Partial<Recurring> = {}): Recurring {
  return {
    id,
    bookId: "personal",
    type: "expense",
    name: "Alquiler",
    amount: 400000,
    currency: "ARS",
    categoryId: "vivienda",
    accountId: "bank",
    method: "debito",
    day: 5,
    note: "",
    active: true,
    ...extra,
  };
}

describe("mergeRecurrings", () => {
  it("keeps remote and adds extras from the vault", () => {
    const remote = [rec("a")];
    const incoming = [rec("a"), rec("b", { name: "Internet", amount: 28000, day: 10 })];
    const { merged, added } = mergeRecurrings(remote, incoming);
    assert.equal(merged.length, 2);
    assert.deepEqual(added.map((r) => r.id), ["b"]);
  });

  it("does not duplicate the same fijo with another id", () => {
    const remote = [rec("a")];
    const incoming = [rec("z", { name: "Alquiler", amount: 400000, day: 5 })];
    const { merged, added } = mergeRecurrings(remote, incoming);
    assert.equal(merged.length, 1);
    assert.equal(added.length, 0);
    assert.equal(merged[0].id, "a");
  });

  it("adds everything when remote is empty", () => {
    const incoming = [rec("a"), rec("b", { name: "Expensas", amount: 80000, day: 1 })];
    const { merged, added } = mergeRecurrings([], incoming);
    assert.equal(merged.length, 2);
    assert.equal(added.length, 2);
  });
});
