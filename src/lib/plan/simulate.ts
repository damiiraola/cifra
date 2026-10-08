/**
 * Simulador "¿y si…?" (§2.6). Pure, sin IA. Runs the same plan twice, with and
 * without the scenario, and returns the differences: cajas month by month,
 * goals and the card limit. Nothing is saved: the scenario only lives in a copy
 * of the data.
 */
import type { Goal } from "../goals.ts";
import type { CardPurchase, Transaction } from "../types.ts";
import { accountBalance } from "../books.ts";
import { deriveInstallments, dueOf, installmentAmounts, limitUse, MAX_INSTALLMENTS } from "../card-math.ts";
import {
  monthlySurplus,
  projectCashflow,
  round0,
  type Cashflow,
  type MonthFlow,
  type PlanData,
} from "./cashflow.ts";
import { goalPlan, type GoalLine } from "./goal-plan.ts";

export type Scenario =
  | {
      kind: "cuotas";
      cardId: string;
      /** Interest-free: the price. With interest: what each cuota costs. */
      amount: number;
      installments: number;
      interestFree: boolean;
    }
  | {
      kind: "gasto";
      /** A caja (paid today) or a card caja (in one payment, with the statement). */
      accountId: string;
      /** In the caja's currency. */
      amount: number;
    }
  | {
      kind: "sueldo";
      /** Per month, ARS: + raise, − cut. */
      delta: number;
      /** Starts next month (default) or this one. */
      fromThisMonth?: boolean;
    };

export const SIM_ID = "sim";

export type SimMonth = {
  ym: string;
  base: number;
  sim: number;
  delta: number;
};

export type SimGoal = {
  id: string;
  name: string;
  currency: Goal["currency"];
  before: { onTrack: boolean | null; eta: string; assigned: number };
  after: { onTrack: boolean | null; eta: string; assigned: number };
  /** later | sooner | same | lost (had a date, now never) | gained */
  change: "later" | "sooner" | "same" | "lost" | "gained";
};

export type SimLimit = {
  cardId: string;
  name: string;
  before: number;
  after: number;
  limit: number;
  /** Free limit after, ARS (negative = over the limit). */
  free: number;
};

export type SimResult = {
  months: SimMonth[];
  /** Lowest month-end balance with the scenario. */
  lowest: { ym: string; balance: number };
  /** First month that ends below 0 with the scenario ("" = never), and without it. */
  redFrom: string;
  redFromBase: string;
  surplus: { before: number; after: number };
  goals: SimGoal[];
  limit: SimLimit | null;
  /** For cuotas: amount of each cuota and the months they are paid with the statement. */
  cuotas: { each: number; count: number; total: number; first: string; last: string } | null;
  /** The scenario could not be applied (unknown card or caja, amount ≤ 0). */
  invalid: string;
};

/** Same months with `deltas[i]` added to month i, end balances re-chained. */
export function shiftFlow(flow: Cashflow, deltas: number[]): Cashflow {
  let balance = flow.startBalance;
  const months: MonthFlow[] = flow.months.map((m, i) => {
    const d = deltas[i] ?? 0;
    const comingIn = m.income.fijos + m.income.variable + Math.max(0, d);
    const comingOut = m.out.fijos + m.out.cards + m.out.variable + Math.max(0, -d);
    balance = round0(balance + comingIn - comingOut);
    const totalIn = round0(m.inSoFar + comingIn);
    const totalOut = round0(m.outSoFar + comingOut);
    return {
      ...m,
      income: { ...m.income, fijos: m.income.fijos + Math.max(0, d) },
      out: { ...m.out, fijos: m.out.fijos + Math.max(0, -d) },
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      endBalance: balance,
    };
  });
  return { ...flow, months };
}

function purchaseFor(data: PlanData, s: Extract<Scenario, { kind: "cuotas" }>): CardPurchase | null {
  const n = Math.max(1, Math.min(MAX_INSTALLMENTS, Math.round(s.installments)));
  if (!(s.amount > 0)) return null;
  const each = s.interestFree ? Math.round((s.amount / n) * 100) / 100 : s.amount;
  return {
    id: SIM_ID,
    bookId: data.bookId,
    cardId: s.cardId,
    date: data.today,
    merchant: "Simulación",
    categoryId: "compras",
    currency: "ARS",
    installments: n,
    installmentAmount: each,
    total: s.interestFree ? s.amount : Math.round(s.amount * n * 100) / 100,
    interestFree: s.interestFree,
    cashPrice: 0,
    paidBefore: 0,
    note: "",
  };
}

function simTx(data: PlanData, accountId: string, amount: number, currency: Transaction["currency"], cardPeriod: string): Transaction {
  return {
    id: `${SIM_ID}_gasto`,
    type: "expense",
    amount,
    currency,
    categoryId: "otros",
    note: "",
    merchant: "Simulación",
    date: data.today,
    method: cardPeriod ? "credito" : "debito",
    createdAt: "",
    bookId: data.bookId,
    accountId,
    counterpartyId: "",
    amountTo: 0,
    rateArs: 0,
    rateLocked: false,
    recurringId: "",
    cardPeriod,
    // Marked like a cuota so it is not mistaken for day-to-day spending.
    purchaseId: SIM_ID,
    installmentNo: 1,
    installmentCount: 1,
  };
}

function goalChange(b: GoalLine | undefined, a: GoalLine | undefined): SimGoal["change"] {
  const be = b?.eta ?? "";
  const ae = a?.eta ?? "";
  if (be === ae) return "same";
  if (!ae) return "lost";
  if (!be) return "gained";
  return ae > be ? "later" : "sooner";
}

function cardLimit(data: PlanData, cardId: string, txs: Transaction[]) {
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) return null;
  const debt = (list: Transaction[]) => {
    const ars = data.accounts.find((a) => a.id === card.accountArsId);
    const usd = data.accounts.find((a) => a.id === card.accountUsdId);
    return limitUse(
      card,
      ars ? Math.max(0, -accountBalance(ars, list)) : 0,
      usd ? Math.max(0, -accountBalance(usd, list)) : 0,
      data.rates.usd,
    );
  };
  const before = debt(data.txs);
  const after = debt(txs);
  if (!before || !after) return null;
  return {
    cardId,
    name: card.name,
    before: before.pct,
    after: after.pct,
    limit: card.limitArs,
    free: round0(after.free),
  };
}

const empty = (invalid: string): SimResult => ({
  months: [],
  lowest: { ym: "", balance: 0 },
  redFrom: "",
  redFromBase: "",
  surplus: { before: 0, after: 0 },
  goals: [],
  limit: null,
  cuotas: null,
  invalid,
});

export function simulate(data: PlanData, goals: Goal[], scenario: Scenario, months = 6): SimResult {
  const base = projectCashflow(data, months);
  let sim: Cashflow;
  let limit: SimLimit | null = null;
  let cuotas: SimResult["cuotas"] = null;
  if (scenario.kind === "sueldo") {
    if (!Number.isFinite(scenario.delta) || scenario.delta === 0) return empty("Poné cuánto cambia por mes.");
    const deltas = base.months.map((_, i) => (i === 0 && !scenario.fromThisMonth ? 0 : scenario.delta));
    sim = shiftFlow(base, deltas);
  } else if (scenario.kind === "cuotas") {
    const card = data.cards.find((c) => c.id === scenario.cardId);
    if (!card) return empty("Elegí una tarjeta.");
    const p = purchaseFor(data, scenario);
    if (!p) return empty("Poné el monto.");
    const derived = deriveInstallments(p, card, data.statements);
    const txs = [...data.txs, ...derived];
    sim = projectCashflow({ ...data, txs }, months);
    limit = cardLimit(data, card.id, txs);
    const amounts = installmentAmounts(p);
    const due = (t: Transaction | undefined) =>
      t ? dueOf(card, t.cardPeriod, data.statements).slice(0, 7) : "";
    cuotas = {
      each: amounts[0] ?? 0,
      count: amounts.length,
      total: round0(amounts.reduce((s, v) => s + v, 0)),
      first: due(derived[0]),
      last: due(derived[derived.length - 1]),
    };
  } else {
    const acc = data.accounts.find((a) => a.id === scenario.accountId && !a.archived);
    if (!acc) return empty("Elegí de qué caja sale.");
    if (!(scenario.amount > 0)) return empty("Poné el monto.");
    const card = data.cards.find((c) => c.accountArsId === acc.id || c.accountUsdId === acc.id);
    if (card) {
      const p = purchaseFor(data, {
        kind: "cuotas",
        cardId: card.id,
        amount: scenario.amount,
        installments: 1,
        interestFree: true,
      });
      const derived = deriveInstallments({ ...p!, currency: acc.currency === "USD" ? "USD" : "ARS" }, card, data.statements);
      const txs = [...data.txs, ...derived];
      sim = projectCashflow({ ...data, txs }, months);
      limit = cardLimit(data, card.id, txs);
    } else {
      const txs = [...data.txs, simTx(data, acc.id, scenario.amount, acc.currency, "")];
      sim = projectCashflow({ ...data, txs }, months);
    }
  }
  const rows: SimMonth[] = base.months.map((m, i) => {
    const s = sim.months[i]?.endBalance ?? m.endBalance;
    return { ym: m.ym, base: m.endBalance, sim: s, delta: s - m.endBalance };
  });
  const lowest = rows.reduce(
    (lo, r) => (r.sim < lo.balance ? { ym: r.ym, balance: r.sim } : lo),
    { ym: rows[0]?.ym ?? "", balance: rows[0]?.sim ?? 0 },
  );
  const before = monthlySurplus(base);
  const after = monthlySurplus(sim);
  const gb = goalPlan(goals, before, data.today, data.rates);
  const ga = goalPlan(goals, after, data.today, data.rates);
  const simGoals: SimGoal[] = gb.map((b) => {
    const a = ga.find((x) => x.goal.id === b.goal.id);
    return {
      id: b.goal.id,
      name: b.goal.name,
      currency: b.goal.currency,
      before: { onTrack: b.onTrack, eta: b.eta, assigned: b.assigned },
      after: { onTrack: a?.onTrack ?? null, eta: a?.eta ?? "", assigned: a?.assigned ?? 0 },
      change: goalChange(b, a),
    };
  });
  return {
    months: rows,
    lowest,
    redFrom: rows.find((r) => r.sim < 0)?.ym ?? "",
    redFromBase: rows.find((r) => r.base < 0)?.ym ?? "",
    surplus: { before, after },
    goals: simGoals,
    limit,
    cuotas,
    invalid: "",
  };
}
