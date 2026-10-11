import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canDelete, filterTxs, fold, txCsv, txMonths, txTotals } from "./tx-filter.ts";
import type { Card, Transaction } from "./types.ts";

const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2), type: "expense", amount: 1000, currency: "ARS", categoryId: "food", note: "", merchant: "",
  date: "2026-10-05", method: "efectivo", createdAt: "2026-10-05T10:00:00Z", bookId: "p", accountId: "cash", counterpartyId: "",
  amountTo: 0, rateArs: 0, rateLocked: false, recurringId: "", cardPeriod: "", purchaseId: "", installmentNo: 0, installmentCount: 0, ...o,
});
const card = { id: "visa", accountArsId: "visa-ars", accountUsdId: "visa-usd" } as Card;
const ctx = {
  cards: [card],
  categories: [{ id: "food", name: "Almacén" }, { id: "shop", name: "Compras" }],
  accounts: [{ id: "cash", name: "Efectivo" }, { id: "usd", name: "Dólares" }, { id: "visa-ars", name: "Visa" }],
};
const txs = [
  tx({ merchant: "Coto", date: "2026-10-03" }),
  tx({ merchant: "Amazon", currency: "USD", amount: 25, accountId: "usd", categoryId: "shop", date: "2026-10-04" }),
  tx({ merchant: "Frávega", accountId: "visa-ars", categoryId: "shop", date: "2026-09-20", installmentNo: 3, installmentCount: 12 }),
  tx({ type: "income", amount: 1_200_000, categoryId: "salary", date: "2026-10-01", note: "Sueldo" }),
  tx({ type: "transfer", amount: 50_000, accountId: "cash", counterpartyId: "usd", date: "2026-10-02" }),
];

describe("filtros de movimientos", () => {
  it("newest first, all", () => assert.deepEqual(filterTxs(txs, {}, ctx).map((t) => t.date), ["2026-10-04", "2026-10-03", "2026-10-02", "2026-10-01", "2026-09-20"]));
  it("search without accents, by category name and words", () => {
    assert.equal(fold("Frávega"), "fravega");
    assert.deepEqual(filterTxs(txs, { q: "fravega" }, ctx).map((t) => t.merchant), ["Frávega"]);
    assert.deepEqual(filterTxs(txs, { q: "almacen coto" }, ctx).map((t) => t.merchant), ["Coto"]);
    assert.deepEqual(filterTxs(txs, { q: "sueldo" }, ctx).map((t) => t.type), ["income"]);
  });
  it("month, category, caja (also as destination), card and currency", () => {
    assert.equal(filterTxs(txs, { month: "2026-09" }, ctx).length, 1);
    assert.equal(filterTxs(txs, { category: "shop" }, ctx).length, 2);
    assert.deepEqual(filterTxs(txs, { account: "usd" }, ctx).map((t) => t.type), ["expense", "transfer"]);
    assert.deepEqual(filterTxs(txs, { card: "visa" }, ctx).map((t) => t.merchant), ["Frávega"]);
    assert.deepEqual(filterTxs(txs, { currency: "USD" }, ctx).map((t) => t.merchant), ["Amazon"]);
    assert.equal(filterTxs(txs, { month: "2026-10", category: "shop", currency: "ARS" }, ctx).length, 0);
  });
  it("months and totals by currency (transfers apart)", () => {
    assert.deepEqual(txMonths(txs), ["2026-10", "2026-09"]);
    const t = txTotals(txs);
    assert.deepEqual(t.ARS, { out: 2000, in: 1_200_000 });
    assert.deepEqual(t.USD, { out: 25, in: 0 });
  });
  it("CSV with names, quotes escaped and BOM for Excel", () => {
    const csv = txCsv([tx({ merchant: 'Bar "El 1"', accountId: "visa-ars", installmentNo: 3, installmentCount: 12 })], ctx.categories, ctx.accounts);
    assert.ok(csv.startsWith("\ufefffecha,tipo,monto"));
    assert.match(csv, /"gasto","1000","ARS","Almacén","Visa","Bar ""El 1""","","efectivo","3\/12"/);
  });
});

describe("borrar desde la lista", () => {
  it("today or later, not a cuota (same lock as the store)", () => {
    assert.equal(canDelete({ date: "2026-10-11", purchaseId: "" }, "2026-10-11"), true);
    assert.equal(canDelete({ date: "2026-10-10", purchaseId: "" }, "2026-10-11"), false);
    assert.equal(canDelete({ date: "2026-11-01", purchaseId: "p1" }, "2026-10-11"), false);
  });
});
