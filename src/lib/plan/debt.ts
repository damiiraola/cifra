/**
 * Plan para bajar deudas de tarjeta (§2.2 `payoff`). Pure, sin IA: every number
 * is computed here from the user's own cards.
 *
 * What counts as debt, per card:
 * - the balance of the last closed statement still unpaid (saldo arrastrado
 *   when it is past due): it accrues interest at the card's TNA + 21 % IVA
 *   every month it stays unpaid;
 * - the cuotas still to come (open statement and later): fixed amounts that
 *   are due each month, already with their interest if they had any.
 *
 * Each month the payment goes first to the cuotas due, then to the minimum of
 * every balance, and whatever is left to one balance at a time:
 * - avalancha: highest TNA first (pays less interest);
 * - bola de nieve: smallest balance first (closes a card sooner).
 * New purchases are assumed paid in full: the plan is about what you owe today.
 * USD balances count in pesos at today's rate. Amounts are today's pesos.
 */
import type { Account, BankStatement, Card, Transaction } from "../types.ts";
import { dueOf, periodForCard, shiftPeriod } from "../card-math.ts";
import { lastClosedBalance } from "../card-pay.ts";
import { round0 } from "./cashflow.ts";

export type DebtStrategy = "avalancha" | "bola";

export type CardDebt = {
  cardId: string;
  name: string;
  /** TNA %, 0 = not loaded (no interest estimate). */
  tna: number;
  /** Unpaid balance of the last closed statement, ARS (USD at today's rate). */
  balance: number;
  /** The same balance as the bank prints it: pesos and dollars apart. */
  balanceArs?: number;
  balanceUsd?: number;
  /** True when that balance is already past its due date. */
  overdue: boolean;
  /** Bank's minimum for that statement, 0 = unknown. */
  bankMinimum: number;
  /** Cuotas still to come, by the month they are due (YYYY-MM), ARS. */
  cuotas: Record<string, number>;
  cuotasTotal: number;
  /** Month of the last cuota due, "" without cuotas. */
  cuotasEnd: string;
};

export const IVA = 0.21;
/** Estimated minimum when the bank's is unknown: interest of the month + this share of the balance. */
export const MIN_SHARE = 0.05;
/** The plan gives up after this many months. */
export const MAX_MONTHS = 120;

function addMonths(ym: string, n: number) {
  return shiftPeriod(ym, n);
}

/** Monthly interest rate with IVA for a TNA in %. */
export function monthlyRate(tna: number) {
  return tna > 0 ? (tna / 100 / 12) * (1 + IVA) : 0;
}

/** Debts of the active cards (see top of file). Cards without debt are left out. */
export function cardDebts(input: {
  today: string;
  cards: Card[];
  txs: Transaction[];
  statements: BankStatement[];
  accounts: Account[];
  usdRate: number;
}): CardDebt[] {
  const { today, txs, statements, accounts } = input;
  const usd = input.usdRate > 0 ? input.usdRate : 0;
  const out: CardDebt[] = [];
  for (const card of input.cards) {
    if (card.archived) continue;
    const st = lastClosedBalance(card, txs, today, statements, accounts);
    const balance = round0(st.leftArs + st.leftUsd * usd);
    const open = periodForCard(today, card, statements);
    const cuotas: Record<string, number> = {};
    for (const t of txs) {
      if (!t.purchaseId || t.type !== "expense") continue;
      if (t.accountId !== card.accountArsId && t.accountId !== card.accountUsdId) continue;
      const period = t.cardPeriod || periodForCard(t.date, card, statements);
      if (period < open) continue;
      const ym = dueOf(card, period, statements).slice(0, 7);
      const ars = t.accountId === card.accountUsdId ? t.amount * usd : t.amount;
      cuotas[ym] = (cuotas[ym] ?? 0) + ars;
    }
    for (const k of Object.keys(cuotas)) cuotas[k] = round0(cuotas[k]!);
    const months = Object.keys(cuotas).filter((k) => cuotas[k]! > 0).sort();
    const cuotasTotal = months.reduce((s, k) => s + cuotas[k]!, 0);
    if (balance < 1 && cuotasTotal < 1) continue;
    out.push({
      cardId: card.id,
      name: card.name,
      tna: card.tna > 0 ? card.tna : 0,
      balance: Math.max(0, balance),
      balanceArs: Math.max(0, round0(st.leftArs)),
      balanceUsd: Math.max(0, Math.round(st.leftUsd * 100) / 100),
      overdue: balance >= 1 && st.due < today,
      bankMinimum: st.minimumArs > 0 ? round0(st.minimumArs) : 0,
      cuotas,
      cuotasTotal,
      cuotasEnd: months[months.length - 1] ?? "",
    });
  }
  return out;
}

export type PayoffMonth = {
  ym: string;
  /** Paid that month: cuotas + balances. */
  cuotas: number;
  balances: number;
  interest: number;
  /** Still owed after paying: balances + cuotas to come. */
  left: number;
  /** The budget did not cover cuotas + minimums. */
  short: boolean;
};

export type PayoffCard = {
  cardId: string;
  name: string;
  /** Month the card's balance reaches 0 ("" if it never does within the horizon). */
  balanceFree: string;
  /** Month the card has nothing left (balance and cuotas). */
  free: string;
  interest: number;
};

export type Payoff = {
  strategy: DebtStrategy | "minimo";
  /** Months until everything is paid (1 = this month), null if more than MAX_MONTHS. */
  months: number | null;
  /** Month of the last payment, "" if never. */
  end: string;
  interest: number;
  /** Order in which balances are attacked (cards with a balance). */
  order: string[];
  cards: PayoffCard[];
  schedule: PayoffMonth[];
  /** First month the budget does not cover cuotas + minimums, "". */
  shortFrom: string;
  /**
   * The payment does not even cover the month's interest (plus the cuotas due):
   * the debt grows forever. The plan stops there instead of compounding for 10
   * years into absurd numbers. `needed` is the least that makes it go down.
   */
  stuck: { ym: string; interest: number; needed: number } | null;
};

function attackOrder(debts: CardDebt[], strategy: DebtStrategy) {
  return debts
    .slice()
    .sort((a, b) =>
      strategy === "avalancha"
        ? b.tna - a.tna || a.balance - b.balance || a.name.localeCompare(b.name)
        : a.balance - b.balance || b.tna - a.tna || a.name.localeCompare(b.name),
    )
    .map((d) => d.cardId);
}

/** Minimum of a balance this month: the bank's in the first month, else interest + MIN_SHARE. */
export function minimumFor(balance: number, interest: number, bankMinimum: number, first: boolean) {
  if (balance < 1) return 0;
  const est = interest + balance * MIN_SHARE;
  const min = first && bankMinimum > 0 ? bankMinimum : est;
  return Math.min(balance, Math.max(0, min));
}

/**
 * Month-by-month plan. `budget` is what you can put into the cards each month
 * (cuotas included). With strategy "minimo" only cuotas and minimums are paid.
 */
export function payoff(
  debts: CardDebt[],
  budget: number,
  strategy: DebtStrategy | "minimo",
  today: string,
): Payoff {
  const start = today.slice(0, 7);
  const order = attackOrder(debts, strategy === "minimo" ? "avalancha" : strategy);
  const bal = new Map(debts.map((d) => [d.cardId, d.balance]));
  const interestBy = new Map(debts.map((d) => [d.cardId, 0]));
  const balanceFree = new Map<string, string>();
  const free = new Map<string, string>();
  const lastCuota = new Map(debts.map((d) => [d.cardId, d.cuotasEnd]));
  const schedule: PayoffMonth[] = [];
  let totalInterest = 0;
  let shortFrom = "";
  let end = "";
  let stuck: Payoff["stuck"] = null;
  for (let m = 0; m < MAX_MONTHS; m++) {
    const ym = addMonths(start, m);
    let interest = 0;
    const monthInterest = new Map<string, number>();
    if (m > 0) {
      for (const d of debts) {
        const b = bal.get(d.cardId)!;
        if (b < 1) continue;
        const i = b * monthlyRate(d.tna);
        monthInterest.set(d.cardId, i);
        bal.set(d.cardId, b + i);
        interestBy.set(d.cardId, interestBy.get(d.cardId)! + i);
        interest += i;
      }
    }
    let avail = Math.max(0, budget);
    // 1. cuotas due this month.
    let cuotas = 0;
    for (const d of debts) cuotas += d.cuotas[ym] ?? 0;
    // Sanity: if what is paid cannot cover this month's interest (after the
    // cuotas), the balance only grows. Say so and stop: never compound it.
    if (m > 0 && strategy !== "minimo" && interest >= 1 && avail - cuotas < interest) {
      stuck = { ym, interest: round0(interest), needed: Math.ceil((interest + cuotas + 1) / 1000) * 1000 };
      break;
    }
    totalInterest += interest;
    let short = false;
    const cuotasPaid = Math.min(avail, cuotas);
    if (cuotasPaid < cuotas - 0.5) {
      // What is not paid of the cuotas is financed on its card from now on.
      short = true;
      const unpaid = 1 - cuotasPaid / cuotas;
      for (const d of debts) {
        const due = d.cuotas[ym] ?? 0;
        if (due > 0) bal.set(d.cardId, bal.get(d.cardId)! + due * unpaid);
      }
    }
    avail -= cuotasPaid;
    // 2. minimums.
    let balances = 0;
    const mins = debts.map((d) => ({
      d,
      min: minimumFor(bal.get(d.cardId)!, monthInterest.get(d.cardId) ?? 0, d.bankMinimum, m === 0),
    }));
    const minTotal = mins.reduce((s, x) => s + x.min, 0);
    if (avail < minTotal - 0.5) short = true;
    const share = minTotal > 0 && avail < minTotal ? avail / minTotal : 1;
    for (const { d, min } of mins) {
      const p = Math.min(bal.get(d.cardId)!, min * share);
      bal.set(d.cardId, bal.get(d.cardId)! - p);
      balances += p;
      avail -= p;
    }
    avail = Math.max(0, avail);
    // 3. the rest, one balance at a time.
    if (strategy !== "minimo") {
      for (const id of order) {
        if (avail <= 0) break;
        const b = bal.get(id)!;
        if (b < 1) continue;
        const p = Math.min(b, avail);
        bal.set(id, b - p);
        balances += p;
        avail -= p;
      }
    }
    if (short && !shortFrom) shortFrom = ym;
    // 4. bookkeeping.
    let left = 0;
    for (const d of debts) {
      const b = bal.get(d.cardId)!;
      if (b < 1) {
        bal.set(d.cardId, 0);
        if (!balanceFree.has(d.cardId)) balanceFree.set(d.cardId, ym);
      }
      let future = 0;
      for (const [k, v] of Object.entries(d.cuotas)) if (k > ym) future += v;
      left += bal.get(d.cardId)! + future;
      const lc = lastCuota.get(d.cardId)!;
      if (!free.has(d.cardId) && bal.get(d.cardId)! < 1 && (!lc || lc <= ym)) free.set(d.cardId, ym);
    }
    schedule.push({
      ym,
      cuotas: round0(cuotasPaid),
      balances: round0(balances),
      interest: round0(interest),
      left: round0(left),
      short,
    });
    if (left < 1) {
      end = ym;
      break;
    }
  }
  return {
    strategy,
    months: end ? schedule.length : null,
    end,
    interest: round0(totalInterest),
    stuck,
    order: order.filter((id) => (debts.find((d) => d.cardId === id)?.balance ?? 0) >= 1),
    cards: debts.map((d) => ({
      cardId: d.cardId,
      name: d.name,
      balanceFree: balanceFree.get(d.cardId) ?? "",
      free: free.get(d.cardId) ?? "",
      interest: round0(interestBy.get(d.cardId)!),
    })),
    schedule,
    shortFrom,
  };
}

/** What has to go out this month at least: cuotas due now + minimums. */
export function mandatoryNow(debts: CardDebt[], today: string) {
  const ym = today.slice(0, 7);
  return round0(
    debts.reduce(
      (s, d) => s + (d.cuotas[ym] ?? 0) + minimumFor(d.balance, 0, d.bankMinimum, true),
      0,
    ),
  );
}

export type DebtComparison = {
  debts: CardDebt[];
  budget: number;
  mandatory: number;
  avalancha: Payoff;
  bola: Payoff;
  minimo: Payoff;
  /** Same attack order: the two strategies are the same plan. */
  same: boolean;
  /** Interest saved by avalancha vs bola (≥ 0 normally). */
  avalanchaSaves: number;
  /** Cards without TNA loaded (their interest is not estimated). */
  missingTna: string[];
};

export function compareDebtPlans(debts: CardDebt[], budget: number, today: string): DebtComparison {
  const mandatory = mandatoryNow(debts, today);
  const b = Math.max(0, round0(budget));
  const avalancha = payoff(debts, b, "avalancha", today);
  const bola = payoff(debts, b, "bola", today);
  const minimo = payoff(debts, Number.MAX_SAFE_INTEGER, "minimo", today);
  return {
    debts,
    budget: b,
    mandatory,
    avalancha,
    bola,
    minimo,
    same: avalancha.order.join() === bola.order.join(),
    // A plan that never ends (payment below the interest) has no "savings" to compare.
    avalanchaSaves: avalancha.stuck || bola.stuck ? 0 : bola.interest - avalancha.interest,
    missingTna: debts.filter((d) => d.balance >= 1 && !(d.tna > 0)).map((d) => d.name),
  };
}

/** Highest month of cuotas still to come (this month or later), ARS. */
export function peakCuotas(debts: CardDebt[], today: string) {
  const ym = today.slice(0, 7);
  const byMonth = new Map<string, number>();
  for (const d of debts) {
    for (const [k, v] of Object.entries(d.cuotas)) if (k >= ym && v > 0) byMonth.set(k, (byMonth.get(k) ?? 0) + v);
  }
  return round0(Math.max(0, ...byMonth.values()));
}

/** True when nothing accrues interest: no unpaid statement balance, only cuotas paid with each statement. */
export function onlyCuotas(debts: CardDebt[]) {
  return debts.length > 0 && debts.every((d) => d.balance < 1);
}

/**
 * A sensible starting budget: the cuotas and minimums, plus what is left over
 * each month (from the cash-flow plan, the same "te sobran" of Metas), never
 * more than the debt. The cuotas count at their highest month, not just this
 * month's: with a new purchase whose first cuota is due next month, this
 * month has no cuotas, and capping at 0 made the plan "pay" nothing and
 * finance interest-free cuotas with interest.
 */
export function suggestedDebtBudget(debts: CardDebt[], today: string, surplus: number) {
  const peak = peakCuotas(debts, today);
  const balances = debts.reduce((s, d) => s + d.balance, 0);
  const mandatory = Math.max(mandatoryNow(debts, today), peak);
  return round0(Math.max(mandatory, Math.min(peak + balances, mandatory + Math.max(0, surplus))));
}
