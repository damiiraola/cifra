import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Goal } from "../goals.ts";
import type { Account, Card, CardPurchase, Transaction } from "../types.ts";
import { deriveInstallments } from "../card-math.ts";
import type { PlanData } from "./cashflow.ts";
import {
  cardDebts,
  compareDebtPlans,
  mandatoryNow,
  monthlyRate,
  payoff,
  suggestedDebtBudget,
  type CardDebt,
} from "./debt.ts";
import { shiftFlow, simulate } from "./simulate.ts";
import { projectCashflow } from "./cashflow.ts";

const today = "2026-10-08";
const rates = { usd: 1000, usdt: 1000 };

const debt = (extra: Partial<CardDebt>): CardDebt => ({
  cardId: "a",
  name: "Visa",
  tna: 0,
  balance: 0,
  overdue: false,
  bankMinimum: 0,
  cuotas: {},
  cuotasTotal: 0,
  cuotasEnd: "",
  ...extra,
});

describe("payoff", () => {
  it("monthly rate is TNA / 12 plus IVA", () => {
    assert.ok(Math.abs(monthlyRate(73) - (0.73 / 12) * 1.21) < 1e-12);
    assert.equal(monthlyRate(0), 0);
  });

  it("pays everything this month when the budget covers it, without interest", () => {
    const p = payoff([debt({ balance: 50_000, tna: 80 })], 100_000, "avalancha", today);
    assert.equal(p.months, 1);
    assert.equal(p.end, "2026-10");
    assert.equal(p.interest, 0);
    assert.equal(p.cards[0]!.balanceFree, "2026-10");
  });

  const two = [
    debt({ cardId: "cara", name: "Cara", balance: 300_000, tna: 120 }),
    debt({ cardId: "chica", name: "Chica", balance: 60_000, tna: 50 }),
  ];

  it("avalancha attacks the highest rate, bola de nieve the smallest balance", () => {
    const c = compareDebtPlans(two, 80_000, today);
    assert.deepEqual(c.avalancha.order, ["cara", "chica"]);
    assert.deepEqual(c.bola.order, ["chica", "cara"]);
    assert.equal(c.same, false);
    assert.ok(c.avalanchaSaves > 0, "avalancha pays less interest");
    const bolaChica = c.bola.cards.find((x) => x.cardId === "chica")!.balanceFree;
    const avChica = c.avalancha.cards.find((x) => x.cardId === "chica")!.balanceFree;
    assert.ok(bolaChica < avChica, "bola closes the small card sooner");
    assert.ok(c.avalancha.months! <= c.bola.months!);
  });

  it("paying only the minimum takes longer and costs more", () => {
    const c = compareDebtPlans(two, 80_000, today);
    assert.ok(c.minimo.months === null || c.minimo.months > c.avalancha.months!);
    assert.ok(c.minimo.interest > c.avalancha.interest);
  });

  it("flags the month the budget does not cover cuotas and minimums", () => {
    const d = [debt({ balance: 1_000_000, tna: 100, cuotas: { "2026-10": 50_000 }, cuotasTotal: 50_000, cuotasEnd: "2026-10" })];
    assert.equal(mandatoryNow(d, today), 100_000);
    const p = payoff(d, 60_000, "avalancha", today);
    assert.equal(p.shortFrom, "2026-10");
    assert.equal(p.schedule[0]!.short, true);
  });

  it("only cuotas: done when the last one is paid, no interest", () => {
    const d = [debt({ cuotas: { "2026-11": 10_000, "2026-12": 10_000 }, cuotasTotal: 20_000, cuotasEnd: "2026-12" })];
    const p = payoff(d, 10_000, "avalancha", today);
    assert.equal(p.end, "2026-12");
    assert.equal(p.months, 3);
    assert.equal(p.interest, 0);
    assert.equal(p.cards[0]!.free, "2026-12");
  });

  it("when cuotas end, that money goes to the balance", () => {
    const d = [
      debt({
        balance: 400_000,
        tna: 60,
        cuotas: { "2026-10": 50_000, "2026-11": 50_000 },
        cuotasTotal: 100_000,
        cuotasEnd: "2026-11",
      }),
    ];
    const p = payoff(d, 100_000, "avalancha", today);
    assert.equal(p.schedule[0]!.balances, 50_000);
    assert.equal(p.schedule[2]!.cuotas, 0);
    assert.equal(p.schedule[2]!.balances, 100_000);
  });

  it("suggested budget: minimums and cuotas plus the monthly surplus, capped at the debt", () => {
    const d = [debt({ balance: 100_000, tna: 80 })];
    assert.equal(suggestedDebtBudget(d, today, 0), 5_000);
    assert.equal(suggestedDebtBudget(d, today, 30_000), 35_000);
    assert.equal(suggestedDebtBudget(d, today, 900_000), 100_000);
  });

  it("lists cards without TNA, and one card means the same plan", () => {
    const c = compareDebtPlans([debt({ balance: 10_000 })], 5_000, today);
    assert.deepEqual(c.missingTna, ["Visa"]);
    assert.equal(c.same, true);
    assert.equal(c.avalancha.interest, 0);
  });
});

const card: Card = {
  id: "visa",
  bookId: "p",
  name: "Visa",
  bank: "",
  network: "visa",
  last4: "",
  closingDay: 23,
  dueDay: 5,
  limitArs: 500_000,
  accountArsId: "visa-ars",
  accountUsdId: "visa-usd",
  payAccountId: "bank",
  usdPerceptionPct: 30,
  tna: 75,
  archived: false,
};

const accounts: Account[] = [
  { id: "bank", bookId: "p", name: "Banco", kind: "bank", currency: "ARS", opening: 1_000_000, archived: false },
  { id: "visa-ars", bookId: "p", name: "Visa", kind: "card", currency: "ARS", opening: 0, archived: false },
  { id: "visa-usd", bookId: "p", name: "Visa USD", kind: "card", currency: "USD", opening: 0, archived: false },
];

let n = 0;
const tx = (extra: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  type: "expense",
  amount: 1000,
  currency: "ARS",
  categoryId: "compras",
  note: "",
  merchant: "",
  date: "2026-09-10",
  method: "credito",
  createdAt: "",
  bookId: "p",
  accountId: "visa-ars",
  counterpartyId: "",
  amountTo: 0,
  rateArs: 0,
  rateLocked: false,
  recurringId: "",
  cardPeriod: "",
  purchaseId: "",
  installmentNo: 0,
  installmentCount: 0,
  ...extra,
});

const data = (txs: Transaction[] = []): PlanData => ({
  today,
  bookId: "p",
  txs,
  accounts,
  cards: [card],
  statements: [],
  recurrings: [],
  rates,
});

describe("cardDebts", () => {
  it("takes the unpaid closed statement and the cuotas to come, by due month", () => {
    const p: CardPurchase = {
      id: "tele",
      bookId: "p",
      cardId: "visa",
      date: "2026-10-02",
      merchant: "Tele",
      categoryId: "compras",
      currency: "ARS",
      installments: 3,
      installmentAmount: 100_000,
      total: 300_000,
      interestFree: true,
      cashPrice: 0,
      paidBefore: 0,
      note: "",
    };
    const txs = [tx({ amount: 30_000 }), ...deriveInstallments(p, card)];
    const [d] = cardDebts({ today, cards: [card], txs, statements: [], accounts, usdRate: 1000 });
    assert.equal(d!.balance, 30_000);
    assert.equal(d!.overdue, true);
    assert.equal(d!.tna, 75);
    assert.deepEqual(d!.cuotas, { "2026-11": 100_000, "2026-12": 100_000, "2027-01": 100_000 });
    assert.equal(d!.cuotasEnd, "2027-01");
    assert.equal(d!.cuotasTotal, 300_000);
  });

  it("leaves out cards without debt", () => {
    assert.deepEqual(cardDebts({ today, cards: [card], txs: [], statements: [], accounts, usdRate: 1000 }), []);
  });
});

const goal = (extra: Partial<Goal>): Goal => ({
  id: "g",
  bookId: "p",
  kind: "viaje",
  name: "Viaje",
  currency: "ARS",
  target: 600_000,
  saved: 0,
  deadline: "2027-04-08",
  priority: 2,
  active: true,
  createdAt: "",
  updatedAt: "",
  ...extra,
});

describe("simulate", () => {
  it("a purchase in cuotas: cuotas with the statement, less in the cajas, more limit used", () => {
    const r = simulate(data(), [], { kind: "cuotas", cardId: "visa", amount: 120_000, installments: 3, interestFree: true });
    assert.equal(r.invalid, "");
    assert.deepEqual(r.cuotas, { each: 40_000, count: 3, total: 120_000, first: "2026-11", last: "2027-01" });
    assert.deepEqual(
      r.months.map((m) => m.delta),
      [0, -40_000, -80_000, -120_000, -120_000, -120_000],
    );
    assert.equal(r.limit!.before, 0);
    assert.equal(r.limit!.after, 120_000 / 500_000);
    assert.equal(r.limit!.free, 380_000);
    assert.equal(r.redFrom, "");
  });

  it("a big expense from a caja leaves now; too big goes red this month", () => {
    const r = simulate(data(), [], { kind: "gasto", accountId: "bank", amount: 200_000 });
    assert.ok(r.months.every((m) => m.delta === -200_000));
    assert.equal(r.limit, null);
    const red = simulate(data(), [], { kind: "gasto", accountId: "bank", amount: 1_500_000 });
    assert.equal(red.redFrom, "2026-10");
    assert.equal(red.lowest.balance, -500_000);
    assert.equal(red.redFromBase, "");
  });

  it("a big expense with the card goes in one payment with the next statement", () => {
    const r = simulate(data(), [], { kind: "gasto", accountId: "visa-ars", amount: 90_000 });
    assert.deepEqual(r.months.slice(0, 3).map((m) => m.delta), [0, -90_000, -90_000]);
    assert.equal(r.limit!.after, 90_000 / 500_000);
  });

  it("a raise from next month moves the goals", () => {
    const r = simulate(data(), [goal({})], { kind: "sueldo", delta: 150_000 });
    assert.deepEqual(r.months.slice(0, 3).map((m) => m.delta), [0, 150_000, 300_000]);
    assert.equal(r.surplus.before, 0);
    assert.equal(r.surplus.after, 150_000);
    assert.equal(r.goals[0]!.before.onTrack, false);
    assert.equal(r.goals[0]!.after.onTrack, true);
    assert.equal(r.goals[0]!.change, "gained");
  });

  it("a cut this month can delay a goal", () => {
    const withIncome = data([
      tx({ type: "income", accountId: "bank", categoryId: "sueldo", amount: 400_000, date: "2026-09-01" }),
    ]);
    const before = simulate(withIncome, [goal({ deadline: "" })], { kind: "sueldo", delta: -200_000, fromThisMonth: true });
    assert.equal(before.months[0]!.delta, -200_000);
    assert.equal(before.goals[0]!.change, "later");
  });

  it("does nothing with a bad scenario", () => {
    assert.match(simulate(data(), [], { kind: "cuotas", cardId: "x", amount: 1, installments: 3, interestFree: true }).invalid, /tarjeta/);
    assert.match(simulate(data(), [], { kind: "gasto", accountId: "bank", amount: 0 }).invalid, /monto/);
    assert.match(simulate(data(), [], { kind: "sueldo", delta: 0 }).invalid, /cambia/);
  });

  it("shiftFlow re-chains the end balances", () => {
    const flow = projectCashflow(data(), 3);
    const s = shiftFlow(flow, [-10, 0, 5]);
    assert.deepEqual(s.months.map((m) => m.endBalance - flow.months[0]!.endBalance), [-10, -10, -5]);
  });
});
