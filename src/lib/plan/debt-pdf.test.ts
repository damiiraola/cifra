/**
 * Plan de deudas with the 4 test PDFs imported (UX follow-up, Oct 10). Before:
 * Santander showed "Salís: Más de 10 años" and "$ 4.233.554.787" of interest,
 * because the bank's minimum ($ 18.800) did not cover the month's interest
 * (~$ 24.000 at 98,5 % TNA + IVA) and the plan compounded that for 120 months.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildImport, reviewLines, statementDates, type ParsedStatement } from "../statement-import.ts";
import { deriveInstallments, statementTotals } from "../card-math.ts";
import type { Account, Card, CardPurchase, Transaction } from "../types.ts";
import { cardDebts, compareDebtPlans, monthlyRate, payoff, suggestedDebtBudget } from "./debt.ts";

const DIR = new URL("../../../test-fixtures/statements/", import.meta.url);
const expected = JSON.parse(readFileSync(new URL("expected.json", DIR), "utf8")) as Record<string, ParsedStatement>;
const USD = 1540;
const TODAY = "2026-10-10";

const cardFor = (st: ParsedStatement): Card => ({
  id: "c1", bookId: "p", name: "Tarjeta", bank: "", network: "visa", last4: "",
  closingDay: Number(st.closingDate!.slice(8, 10)), dueDay: Number(st.dueDate!.slice(8, 10)), limitArs: 0,
  accountArsId: "c-ars", accountUsdId: "c-usd", payAccountId: "bank", usdPerceptionPct: 30, tna: 98.5, archived: false,
});
const accounts: Account[] = [
  { id: "bank", bookId: "p", name: "Banco", kind: "bank", currency: "ARS", opening: 0, archived: false },
  { id: "c-ars", bookId: "p", name: "Tarjeta", kind: "card", currency: "ARS", opening: 0, archived: false },
  { id: "c-usd", bookId: "p", name: "Tarjeta USD", kind: "card", currency: "USD", opening: 0, archived: false },
];

function imported(st: ParsedStatement) {
  const card = cardFor(st);
  const review = reviewLines(st, card, [], "");
  const dates = statementDates(st, card, [], TODAY);
  const choices = Object.fromEntries(review.map((r) => [r.key, { include: true }]));
  const plan = buildImport({ st, review, choices, card, txs: [], dates, statementId: "s1" });
  const statements = [plan.statement];
  const purchases: CardPurchase[] = plan.purchases.map((p, i) => ({ ...p, id: `p${i}`, bookId: "p" }));
  const txs: Transaction[] = [
    ...plan.adds.map((a, i) => ({ ...a, id: `a${i}`, createdAt: "", recurringId: "", purchaseId: "", installmentNo: 0, installmentCount: 0 }) as Transaction),
    ...purchases.flatMap((p) => deriveInstallments(p, card, statements)),
  ];
  const debts = cardDebts({ today: TODAY, cards: [card], txs, statements, accounts, usdRate: USD });
  return { card, txs, statements, debts, period: dates.period };
}

describe("debt = statement balance + future cuotas, never twice", () => {
  for (const [name, st] of Object.entries(expected)) {
    it(name, () => {
      const { card, txs, statements, debts, period } = imported(st);
      const tot = statementTotals(card, txs, period, statements);
      const d = debts[0]!;
      // The bank's saldo (it includes what was carried from the previous one, e.g. Nación).
      assert.equal(d.balanceArs, Math.round(st.totalArs!), "ARS as the bank");
      assert.equal(d.balanceUsd, st.totalUsd ?? 0, "USD apart, as the bank prints it");
      assert.equal(d.balance, Math.round(st.totalArs! + (st.totalUsd ?? 0) * USD), "pesos at today's rate");
      assert.ok(tot.ars <= st.totalArs! + 0.01, "the statement's own lines are inside that saldo");
      // Cuotas already in the closed statement are in the balance, not again in "cuotas".
      const future = txs.filter((t) => t.purchaseId && t.cardPeriod > period).reduce((s, t) => s + t.amount, 0);
      assert.ok(Math.abs(d.cuotasTotal - future) <= 10, `${d.cuotasTotal} vs ${future}`);
    });
  }
  it("Santander: $ 207.912 + US$ 35,20, no extra cuota (6 of 6 is in the statement)", () => {
    const d = imported(expected["mastercard-santander"]!).debts[0]!;
    assert.equal(d.balanceArs, 207_912);
    assert.equal(d.balanceUsd, 35.2);
    assert.equal(d.cuotasTotal, 0);
  });
});

describe("TNA is annual: monthly rate with IVA", () => {
  it("98,5 % TNA → about 9,9 % a month", () => {
    assert.ok(Math.abs(monthlyRate(98.5) - (0.985 / 12) * 1.21) < 1e-12);
    assert.ok(monthlyRate(98.5) < 0.1);
  });
});

describe("sanity: never absurd interest; say it when the payment does not cover it", () => {
  it("Santander with the bank's minimum: the plan says the debt grows and how much is needed", () => {
    const { debts } = imported(expected["mastercard-santander"]!);
    const budget = suggestedDebtBudget(debts, TODAY, 0);
    assert.equal(budget, 18_800, "the bank's minimum");
    const p = payoff(debts, budget, "avalancha", TODAY);
    assert.ok(p.stuck, "18.800 does not cover ~24.000 of interest");
    assert.ok(p.stuck!.interest > 18_800 && p.stuck!.interest < 30_000);
    assert.ok(p.stuck!.needed > p.stuck!.interest);
    assert.ok(p.interest < debts[0]!.balance, `no absurd total: ${p.interest}`);
    const c = compareDebtPlans(debts, budget, TODAY);
    assert.equal(c.avalanchaSaves, 0);
  });
  for (const [name, st] of Object.entries(expected)) {
    it(`${name}: any budget gives bounded numbers`, () => {
      const { debts } = imported(st);
      const owed = debts.reduce((s, d) => s + d.balance + d.cuotasTotal, 0);
      for (const budget of [1_000, 18_800, 50_000, 200_000, 1_000_000]) {
        for (const strategy of ["avalancha", "bola", "minimo"] as const) {
          const p = payoff(debts, strategy === "minimo" ? Number.MAX_SAFE_INTEGER : budget, strategy, TODAY);
          assert.ok(p.interest <= owed * 3, `${name} ${strategy} ${budget}: interest ${p.interest} vs owed ${owed}`);
          // Paying what is asked (not the minimum), a plan that is not stuck ends.
          if (!p.stuck && strategy !== "minimo") assert.ok(p.months !== null, `${name} ${strategy} ${budget}: ends`);
        }
      }
      const enough = payoff(debts, owed, "avalancha", TODAY);
      // Paying everything now: no interest, it ends with the last cuota.
      assert.equal(enough.interest, 0);
      assert.equal(enough.stuck, null);
      assert.ok(enough.months !== null);
    });
  }
});
