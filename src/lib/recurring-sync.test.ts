import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeRecurrings, recurringFingerprint, remapRecurrings, resolveVaultBook } from "./recurring-sync.ts";
import type { Account, Book, Recurring } from "./types.ts";

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

  it("treats the same book name as one fijo even if ids differ across phones", () => {
    const names: Record<string, string> = {
      "id-phone-a": "Personal",
      "id-phone-b": "Personal",
    };
    const remote = [rec("a", { bookId: "id-phone-b" })];
    const incoming = [rec("z", { bookId: "id-phone-a" })];
    const { added } = mergeRecurrings(remote, incoming, (id) => names[id] ?? id);
    assert.equal(added.length, 0);
    assert.equal(
      recurringFingerprint(remote[0], "Personal"),
      recurringFingerprint(incoming[0], "Personal"),
    );
  });

  it("dedupes incoming against itself", () => {
    const incoming = [rec("a"), rec("b", { name: "Alquiler", amount: 400000, day: 5 })];
    const { merged, added } = mergeRecurrings([], incoming);
    assert.equal(merged.length, 1);
    assert.equal(added.length, 1);
    assert.equal(added[0].id, "a");
  });
});

const books: Book[] = [
  { id: "p-now", name: "Personal", kind: "personal" },
  { id: "n-now", name: "Negocio", kind: "business" },
];

const accounts: Account[] = [
  { id: "bank-p", bookId: "p-now", name: "Banco", kind: "bank", currency: "ARS", opening: 0, archived: false },
  { id: "mp-p", bookId: "p-now", name: "Mercado Pago", kind: "mp", currency: "ARS", opening: 0, archived: false },
  { id: "bank-n", bookId: "n-now", name: "Banco", kind: "bank", currency: "ARS", opening: 0, archived: false },
];

describe("remapRecurrings", () => {
  it("maps by book and account name, not the other phone's ids", () => {
    const [row] = remapRecurrings(
      [{ ...rec("a"), bookName: "Personal", accountName: "Banco" }],
      books,
      accounts,
    );
    assert.equal(row.bookId, "p-now");
    assert.equal(row.accountId, "bank-p");
  });

  it("falls back to Personal/Banco when names are missing", () => {
    const [row] = remapRecurrings([{ ...rec("a"), bookName: "", accountName: "" }], books, accounts);
    assert.equal(row.bookId, "p-now");
    assert.equal(row.accountId, "bank-p");
  });

  it("maps Negocio by kind when the id is foreign", () => {
    assert.equal(resolveVaultBook(books, "Negocio", "totally-other")?.id, "n-now");
    const [row] = remapRecurrings(
      [{ ...rec("a", { name: "Monotributo" }), bookName: "Negocio", accountName: "Banco" }],
      books,
      accounts,
    );
    assert.equal(row.bookId, "n-now");
    assert.equal(row.accountId, "bank-n");
  });
});
