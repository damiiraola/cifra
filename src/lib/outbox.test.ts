import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyOutbox, enqueue, parseOutbox, pruneOutbox, showUnsaved } from "./outbox.ts";
import type { Transaction } from "./types.ts";

function tx(id: string, amount = 100, extra: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: "expense",
    amount,
    currency: "ARS",
    categoryId: "alimentos",
    note: "",
    merchant: "Coto",
    date: "2026-09-10",
    method: "debito",
    createdAt: "2026-09-10T12:00:00.000Z",
    bookId: "personal",
    accountId: "cash",
    counterpartyId: "",
    amountTo: 0,
    rateArs: 1,
    rateLocked: false,
    recurringId: "",
    cardPeriod: "",
    purchaseId: "",
    installmentNo: 0,
    installmentCount: 0,
    ...extra,
  };
}

describe("outbox", () => {
  it("paints adds, updates and deletes over the snapshot", () => {
    const snap = [tx("a", 10), tx("b", 20)];
    const painted = applyOutbox(snap, [
      { id: "c", action: "add", row: tx("c", 30), at: 1, tries: 0 },
      { id: "a", action: "update", row: tx("a", 15), at: 2, tries: 0 },
      { id: "b", action: "delete", at: 3, tries: 0 },
    ]);
    assert.equal(painted.length, 2);
    assert.equal(painted.find((t) => t.id === "a")?.amount, 15);
    assert.equal(painted.some((t) => t.id === "b"), false);
    assert.equal(painted.find((t) => t.id === "c")?.amount, 30);
  });

  it("drops a pending add if you delete it before Neon sees it", () => {
    const queued = enqueue(
      [{ id: "n", action: "add", row: tx("n"), at: 1, tries: 0 }],
      { id: "n", action: "delete", at: 2, tries: 0 },
    );
    assert.deepEqual(queued, []);
  });

  it("keeps a pending add as add when you edit it", () => {
    const queued = enqueue(
      [{ id: "n", action: "add", row: tx("n", 10), at: 1, tries: 0 }],
      { id: "n", action: "update", row: tx("n", 40), at: 2, tries: 0 },
    );
    assert.equal(queued.length, 1);
    assert.equal(queued[0]?.action, "add");
    assert.equal(queued[0]?.row?.amount, 40);
  });

  it("prunes ops Neon already has", () => {
    const remote = [tx("a", 10), tx("b", 20)];
    const kept = pruneOutbox(
      [
        { id: "a", action: "add", row: tx("a", 10), at: 1, tries: 0 },
        { id: "c", action: "add", row: tx("c", 30), at: 2, tries: 0 },
        { id: "b", action: "update", row: tx("b", 20), at: 3, tries: 0 },
        { id: "b", action: "update", row: tx("b", 99), at: 4, tries: 0 },
        { id: "gone", action: "delete", at: 5, tries: 0 },
        { id: "a", action: "delete", at: 6, tries: 0 },
      ],
      remote,
    );
    const ids = kept.map((o) => `${o.action}:${o.id}`);
    assert.deepEqual(ids, ["add:c", "update:b", "delete:a"]);
  });

  it("keeps an update that only moved a cuota to another statement", () => {
    const remote = [tx("c", 10, { purchaseId: "p", installmentNo: 2, installmentCount: 6, cardPeriod: "2026-10" })];
    const kept = pruneOutbox(
      [{ id: "c", action: "update", row: tx("c", 10, { purchaseId: "p", installmentNo: 2, installmentCount: 6, cardPeriod: "2026-11" }), at: 1, tries: 0 }],
      remote,
    );
    assert.equal(kept.length, 1);
    const same = pruneOutbox([{ id: "c", action: "update", row: remote[0]!, at: 1, tries: 0 }], remote);
    assert.equal(same.length, 0);
  });

  it("parses only valid ops", () => {
    const parsed = parseOutbox([
      { id: "ok", action: "add", row: tx("ok"), at: 1, tries: 2 },
      { id: "", action: "add", row: tx("x") },
      { action: "delete" },
      { id: "d", action: "delete", at: 3 },
      null,
    ]);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]?.id, "ok");
    assert.equal(parsed[1]?.action, "delete");
  });
});

describe("aviso de sin guardar", () => {
  it("no aparece durante un guardado normal", () => {
    assert.equal(showUnsaved(4, 2500, true), false);
    assert.equal(showUnsaved(0, 60_000, true), false);
  });

  it("aparece si tarda más de 5 s o si no hay conexión", () => {
    assert.equal(showUnsaved(4, 5000, true), true);
    assert.equal(showUnsaved(1, 0, false), true);
  });
});
