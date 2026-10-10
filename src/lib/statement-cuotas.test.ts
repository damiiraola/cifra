/**
 * UX audit 2026-10-10, P3: after importing a statement, its cuotas must make
 * the statement close with the bank's total, and the cuotas still to come must
 * show up in the next statements (all test PDFs).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildImport, reviewLines, statementDates, type ParsedStatement } from "./statement-import.ts";
import { deriveInstallments, missingCuotas, purchaseProgress, statementTotals, upcomingStatements } from "./card-math.ts";
import type { Card, CardPurchase, Transaction } from "./types.ts";

const DIR = new URL("../../test-fixtures/statements/", import.meta.url);
const expected = JSON.parse(readFileSync(new URL("expected.json", DIR), "utf8")) as Record<
  string,
  ParsedStatement & { previousArs?: number; paymentsArs?: number }
>;

const cardFor = (st: ParsedStatement): Card => ({
  id: "c1",
  bookId: "p",
  name: "Tarjeta",
  bank: "",
  network: "visa",
  last4: "",
  closingDay: Number(st.closingDate!.slice(8, 10)),
  dueDay: Number(st.dueDate!.slice(8, 10)),
  limitArs: 0,
  accountArsId: "c-ars",
  accountUsdId: "c-usd",
  payAccountId: "bank",
  usdPerceptionPct: 30,
  tna: 0,
  archived: false,
});

/** Import every line of the statement into an empty book, like «Importar y guardar». */
function importAll(st: ParsedStatement, today: string) {
  const card = cardFor(st);
  const review = reviewLines(st, card, [], "");
  const dates = statementDates(st, card, [], today);
  const choices = Object.fromEntries(review.map((r) => [r.key, { include: true }]));
  const plan = buildImport({ st, review, choices, card, txs: [], dates, statementId: "s1" });
  const statements = [plan.statement];
  const purchases: CardPurchase[] = plan.purchases.map((p, i) => ({ ...p, id: `p${i}`, bookId: "p" }));
  const txs: Transaction[] = [
    ...plan.adds.map((a, i) => ({ ...a, id: `a${i}`, createdAt: "", recurringId: "", purchaseId: "", installmentNo: 0, installmentCount: 0 }) as Transaction),
    ...purchases.flatMap((p) => deriveInstallments(p, card, statements)),
  ];
  return { card, plan, statements, purchases, txs, period: dates.period };
}

const lineSum = (st: ParsedStatement, cur: "ARS" | "USD") =>
  Math.round(st.lines.filter((l) => l.currency === cur).reduce((s, l) => s + (l.kind === "refund" ? -l.amount : l.amount), 0) * 100) / 100;

describe("every test PDF: the imported statement closes with the bank", () => {
  for (const [name, st] of Object.entries(expected)) {
    it(name, () => {
      const { card, statements, txs, period } = importAll(st, st.dueDate!);
      const got = statementTotals(card, txs, period, statements);
      assert.equal(got.ars, lineSum(st, "ARS"), "ARS lines, cuotas included");
      assert.equal(got.usd, lineSum(st, "USD"), "USD lines");
      if (st.previousArs != null && st.paymentsArs != null && st.totalArs != null) {
        // Bank: previous − payments + this statement = total. No "Faltan $ …".
        assert.ok(Math.abs(st.previousArs - st.paymentsArs + got.ars - st.totalArs) < 0.02, `${name} closes`);
      }
    });
  }
});

describe("Mastercard Santander: GARBARINO in 6 cuotas", () => {
  const real = expected["mastercard-santander"]!;
  const today = "2026-10-10";

  it("cuota 6 of 6 (as printed): goes in September and nothing is left after", () => {
    const { purchases, txs, card, statements } = importAll(real, today);
    const cuotas = txs.filter((t) => t.purchaseId === purchases[0]!.id);
    assert.deepEqual(cuotas.map((t) => [t.installmentNo, t.cardPeriod]), [[6, "2026-09"]]);
    const prog = purchaseProgress(purchases[0]!, txs, today, "2026-10");
    assert.equal(prog.current, 6);
    assert.equal(prog.left, 0);
    assert.equal(upcomingStatements(card, txs, [], today, 3, statements)[0]!.cuotasArs, 0);
  });

  it("cuota 5 of 6: cuota 6 stays pending and shows in the next statement", () => {
    const st: ParsedStatement = {
      ...real,
      lines: real.lines.map((l) => (l.description.startsWith("GARBARINO") ? { ...l, installmentNo: 5 } : l)),
    };
    const { purchases, txs, card, statements } = importAll(st, today);
    const cuotas = txs.filter((t) => t.purchaseId === purchases[0]!.id);
    assert.deepEqual(cuotas.map((t) => [t.installmentNo, t.cardPeriod]), [[5, "2026-09"], [6, "2026-10"]]);
    // On Oct 10 cuota 6 (dated Oct 1) is NOT paid: its statement closes Oct 29.
    const prog = purchaseProgress(purchases[0]!, txs, today, "2026-10");
    assert.equal(prog.current, 5);
    assert.equal(prog.left, 22_000);
    assert.equal(prog.leftCount, 1);
    const next = upcomingStatements(card, txs, [], today, 3, statements);
    assert.equal(next[0]!.period, "2026-10");
    assert.equal(next[0]!.cuotasArs, 22_000);
    assert.equal(next[0]!.ending.count, 1, "the purchase ends in October");
  });

  it("a purchase whose cuotas never reached the ledger gets them back", () => {
    const { purchases, txs, card, statements } = importAll(real, today);
    const without = txs.filter((t) => !t.purchaseId);
    const back = missingCuotas(purchases, [card], without, statements);
    assert.deepEqual(back.map((t) => [t.installmentNo, t.cardPeriod, t.amount]), [[6, "2026-09", 22_000]]);
    assert.deepEqual(missingCuotas(purchases, [card], txs, statements), [], "nothing to add when they are there");
  });
});
