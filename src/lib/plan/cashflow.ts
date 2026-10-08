/**
 * Planificador sin IA (cifra-design/tarjetas-y-asesor.md §2). Pure: no store,
 * no IA, every number is computed here. Dates ISO `YYYY-MM-DD`, months `YYYY-MM`.
 *
 * Money "sale de tus cajas" when it leaves a caja that is not a card: an
 * expense paid from Banco/Efectivo/MP, or a payment of a card statement. A
 * purchase with credit does not leave your cajas the day you buy: it leaves
 * when you pay the statement.
 */
import type { Account, BankStatement, Card, Currency, Recurring, Transaction } from "../types";
import { dueDate as fijoDate, isPosted } from "../recurring.ts";
import { periodForCard, shiftPeriod, upcomingStatements } from "../card-math.ts";
import { statementBalance } from "../card-pay.ts";
import { accountBalance } from "../books.ts";

export type Rates = { usd: number; usdt: number };

export type PlanData = {
  /** YYYY-MM-DD in Argentina. */
  today: string;
  bookId: string;
  /** Movements of the book. */
  txs: Transaction[];
  /** Cajas of the book (archived ones are fine: they only add history). */
  accounts: Account[];
  /** Active cards of the book. */
  cards: Card[];
  statements: BankStatement[];
  /** All fijos; the ones of other books are ignored. */
  recurrings: Recurring[];
  rates: Rates;
};

export function round0(n: number) {
  return Math.round(Number.isFinite(n) ? n : 0);
}

function inArs(amount: number, currency: Currency, rates: Rates, rateArs = 0) {
  if (!(amount > 0)) return 0;
  if (currency === "ARS") return amount;
  if (rateArs > 0) return amount * rateArs;
  if (currency === "USD") return amount * (rates.usd > 0 ? rates.usd : 0);
  if (currency === "USDT") return amount * (rates.usdt > 0 ? rates.usdt : 0);
  return 0;
}

export function txArs(t: Transaction, rates: Rates) {
  return inArs(t.amount, t.currency, rates, t.rateArs);
}

export function addMonths(ym: string, delta: number) {
  return shiftPeriod(ym, delta);
}

/** Median; with 2 values, their average. 0 for none. */
export function median(values: number[]) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

function cardCajaIds(data: PlanData) {
  const ids = new Set<string>();
  for (const a of data.accounts) if (a.kind === "card") ids.add(a.id);
  for (const c of data.cards) {
    if (c.accountArsId) ids.add(c.accountArsId);
    if (c.accountUsdId) ids.add(c.accountUsdId);
  }
  return ids;
}

function bookFijos(data: PlanData, type: "expense" | "income") {
  return data.recurrings.filter(
    (r) => r.bookId === data.bookId && r.active && r.type === type && r.amount > 0,
  );
}

/** A cuota of a card purchase or a movement of a fijo: not day-to-day spending. */
function isCommitted(t: Transaction) {
  return Boolean(t.purchaseId) || Boolean(t.recurringId);
}

// ------------------------------------------------------------ sale de tus cajas

export type CashOut = {
  ym: string;
  /** Expenses paid from cajas that are not cards. */
  expenses: number;
  /** Payments of card statements (Cambios into a card caja). */
  cardPayments: number;
  total: number;
};

/** Movements of `ym` that take money out of your cajas (see top of file). */
export function cashOutTxs(data: PlanData, ym: string): Transaction[] {
  const cards = cardCajaIds(data);
  return data.txs.filter(
    (t) =>
      t.date.startsWith(ym) &&
      !cards.has(t.accountId) &&
      (t.type === "expense" || (t.type === "transfer" && cards.has(t.counterpartyId))),
  );
}

/** What left your cajas in a month, ARS (USD at its stamped rate). */
export function cashOut(data: PlanData, ym: string): CashOut {
  let expenses = 0;
  let cardPayments = 0;
  for (const t of cashOutTxs(data, ym)) {
    if (t.type === "expense") expenses += txArs(t, data.rates);
    else cardPayments += txArs(t, data.rates);
  }
  return {
    ym,
    expenses: round0(expenses),
    cardPayments: round0(cardPayments),
    total: round0(expenses + cardPayments),
  };
}

export type StatementDue = {
  cardId: string;
  cardName: string;
  period: string;
  due: string;
  ars: number;
  usd: number;
  /** ARS + USD at today's rate. */
  totalArs: number;
  /** Already closed (amount known) or still open (what is loaded so far). */
  closed: boolean;
  overdue: boolean;
};

/**
 * Card statements still to pay, each in the month it leaves your cajas: the
 * month of its due date, or the current month when it is already overdue.
 * The last closed one counts what is left to pay (older unpaid debt already
 * rolled into it); open and future ones what is loaded so far plus cuotas and
 * fijos on the card.
 */
export function cardBills(data: PlanData, months = 13): (StatementDue & { ym: string })[] {
  const out: (StatementDue & { ym: string })[] = [];
  const current = data.today.slice(0, 7);
  for (const card of data.cards) {
    const open = periodForCard(data.today, card, data.statements);
    const period = shiftPeriod(open, -1);
    const st = statementBalance(card, data.txs, period, data.today, data.statements, data.accounts);
    if (st.leftArs > 0 || st.leftUsd > 0) {
      const overdue = st.due < data.today;
      out.push({
        ym: overdue ? current : st.due.slice(0, 7),
        cardId: card.id,
        cardName: card.name,
        period,
        due: st.due,
        ars: st.leftArs,
        usd: st.leftUsd,
        totalArs: round0(st.leftArs + inArs(st.leftUsd, "USD", data.rates)),
        closed: true,
        overdue,
      });
    }
    for (const u of upcomingStatements(
      card,
      data.txs,
      data.recurrings,
      data.today,
      months,
      data.statements,
    )) {
      const ars = Math.max(0, u.ars);
      const usd = Math.max(0, u.usd);
      if (!(ars > 0 || usd > 0)) continue;
      out.push({
        ym: u.due.slice(0, 7),
        cardId: card.id,
        cardName: card.name,
        period: u.period,
        due: u.due,
        ars,
        usd,
        totalArs: round0(ars + inArs(usd, "USD", data.rates)),
        closed: false,
        overdue: false,
      });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/** Card statements that leave your cajas in `ym` (see `cardBills`). */
export function statementsDueIn(data: PlanData, ym: string): StatementDue[] {
  return cardBills(data).filter((b) => b.ym === ym);
}

export type PendingFijo = { id: string; name: string; date: string; amount: number };

/** Fijos of `ym` not loaded yet, outside card cajas (those go in the statement). */
export function pendingFijos(
  data: PlanData,
  ym: string,
  type: "expense" | "income",
): PendingFijo[] {
  const cards = cardCajaIds(data);
  return bookFijos(data, type)
    .filter((r) => !cards.has(r.accountId) && !isPosted(r, data.txs, ym))
    .map((r) => ({
      id: r.id,
      name: r.name,
      date: fijoDate(ym, r.day),
      amount: round0(inArs(r.amount, r.currency, data.rates)),
    }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ----------------------------------------------------------------- history

export type History = {
  /** Complete months used (up to 3, only since the first movement). */
  months: string[];
  /** Day-to-day spending paid from cajas that are not cards (median per month). */
  cashVariable: number;
  /** Day-to-day spending on cards (median per month, by purchase date). */
  cardVariable: number;
  /** Income that is not a fijo (median per month). */
  variableIncome: number;
  /** Day-to-day spending per category, all cajas (median per month). */
  byCategory: Record<string, number>;
};

export function history(data: PlanData, n = 3): History {
  const current = data.today.slice(0, 7);
  const first = data.txs
    .reduce((min, t) => (t.date && t.date < min ? t.date : min), "9999-12")
    .slice(0, 7);
  const months: string[] = [];
  for (let i = 1; i <= n; i++) {
    const ym = addMonths(current, -i);
    if (ym >= first) months.push(ym);
  }
  const cards = cardCajaIds(data);
  const cash: number[] = [];
  const card: number[] = [];
  const income: number[] = [];
  const cats = new Map<string, number[]>();
  months.forEach((ym, i) => {
    let c = 0;
    let k = 0;
    let inc = 0;
    const byCat: Record<string, number> = {};
    for (const t of data.txs) {
      if (!t.date.startsWith(ym)) continue;
      if (t.type === "income" && !t.recurringId && !cards.has(t.accountId))
        inc += txArs(t, data.rates);
      if (t.type !== "expense" || isCommitted(t)) continue;
      const v = txArs(t, data.rates);
      if (cards.has(t.accountId)) k += v;
      else c += v;
      byCat[t.categoryId] = (byCat[t.categoryId] ?? 0) + v;
    }
    cash.push(c);
    card.push(k);
    income.push(inc);
    for (const id of new Set([...cats.keys(), ...Object.keys(byCat)])) {
      const arr = cats.get(id) ?? new Array(i).fill(0);
      arr.push(byCat[id] ?? 0);
      cats.set(id, arr);
    }
  });
  const byCategory: Record<string, number> = {};
  for (const [id, arr] of cats) {
    const m = round0(median(arr));
    if (m > 0) byCategory[id] = m;
  }
  return {
    months,
    cashVariable: round0(median(cash)),
    cardVariable: round0(median(card)),
    variableIncome: round0(median(income)),
    byCategory,
  };
}

// --------------------------------------------------------------- projection

export type MonthFlow = {
  ym: string;
  /** Only for the current month: what already happened. */
  inSoFar: number;
  outSoFar: number;
  /** Still to come (the whole month for future months). */
  income: { fijos: number; variable: number };
  out: { fijos: number; cards: number; variable: number };
  cards: StatementDue[];
  /** Whole month (so far + to come). */
  totalIn: number;
  totalOut: number;
  net: number;
  /** Money in your cajas (not cards) at the end of the month, ARS. */
  endBalance: number;
};

export type Cashflow = {
  /** Cajas that are not cards today, ARS at today's rate. */
  startBalance: number;
  history: History;
  months: MonthFlow[];
};

/** Today's money in cajas that are not cards, ARS. */
export function liquidBalance(data: PlanData) {
  const cards = cardCajaIds(data);
  let total = 0;
  for (const a of data.accounts) {
    if (a.bookId !== data.bookId || a.archived || cards.has(a.id)) continue;
    const n = accountBalance(a, data.txs);
    total +=
      a.currency === "ARS" ? n : n * (a.currency === "USD" ? data.rates.usd : data.rates.usdt);
  }
  return round0(total);
}

/**
 * The next `months` months (≤ 12) starting with the current one. Income: fijos
 * plus the median of non-fijo income of the last 3 months. Out: fijos outside
 * cards, card statements due that month (cuotas, fijos on the card, what is
 * already loaded and what is left of closed ones) and day-to-day spending at
 * the median of the last 3 months. Day-to-day spending with credit is paid the
 * month after. No inflation: amounts are today's pesos.
 */
export function projectCashflow(data: PlanData, months = 6): Cashflow {
  const n = Math.max(1, Math.min(12, Math.round(months)));
  const current = data.today.slice(0, 7);
  const hist = history(data);
  const cards = cardCajaIds(data);
  const startBalance = liquidBalance(data);
  const fijosIn = bookFijos(data, "income").filter((r) => !cards.has(r.accountId));
  const fijosOut = bookFijos(data, "expense").filter((r) => !cards.has(r.accountId));
  const monthly = (rs: Recurring[]) =>
    round0(rs.reduce((s, r) => s + inArs(r.amount, r.currency, data.rates), 0));

  // What is already loaded this month.
  let inSoFar = 0;
  let varInSoFar = 0;
  let cashVarSoFar = 0;
  let cardVarSoFar = 0;
  for (const t of data.txs) {
    if (!t.date.startsWith(current)) continue;
    if (t.type === "income" && !cards.has(t.accountId)) {
      inSoFar += txArs(t, data.rates);
      if (!t.recurringId) varInSoFar += txArs(t, data.rates);
    }
    if (t.type === "expense" && !isCommitted(t)) {
      if (cards.has(t.accountId)) cardVarSoFar += txArs(t, data.rates);
      else cashVarSoFar += txArs(t, data.rates);
    }
  }
  const outSoFar = cashOut(data, current).total;

  const bills = cardBills(data, n + 1);
  const flows: MonthFlow[] = [];
  let balance = startBalance;
  for (let i = 0; i < n; i++) {
    const ym = addMonths(current, i);
    const due: StatementDue[] = bills.filter((b) => b.ym === ym);
    const cardsOut = round0(due.reduce((s, d) => s + d.totalArs, 0));
    let income: MonthFlow["income"];
    let out: MonthFlow["out"];
    if (i === 0) {
      income = {
        fijos: round0(pendingFijos(data, ym, "income").reduce((s, f) => s + f.amount, 0)),
        variable: round0(Math.max(0, hist.variableIncome - varInSoFar)),
      };
      out = {
        fijos: round0(pendingFijos(data, ym, "expense").reduce((s, f) => s + f.amount, 0)),
        cards: cardsOut,
        variable: round0(Math.max(0, hist.cashVariable - cashVarSoFar)),
      };
    } else {
      // Credit spending of last month that is not loaded yet shows up now.
      const cardCarry = i === 1 ? Math.max(0, hist.cardVariable - cardVarSoFar) : hist.cardVariable;
      income = { fijos: monthly(fijosIn), variable: hist.variableIncome };
      out = {
        fijos: monthly(fijosOut),
        cards: round0(cardsOut + cardCarry),
        variable: hist.cashVariable,
      };
    }
    const comingIn = income.fijos + income.variable;
    const comingOut = out.fijos + out.cards + out.variable;
    balance = round0(balance + comingIn - comingOut);
    const totalIn = round0((i === 0 ? inSoFar : 0) + comingIn);
    const totalOut = round0((i === 0 ? outSoFar : 0) + comingOut);
    flows.push({
      ym,
      inSoFar: i === 0 ? round0(inSoFar) : 0,
      outSoFar: i === 0 ? outSoFar : 0,
      income,
      out,
      cards: due,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      endBalance: balance,
    });
  }
  return { startBalance, history: hist, months: flows };
}

/**
 * Typical monthly surplus to save: average net of the coming full months
 * (skips the current one, already half spent). Never < 0.
 */
export function monthlySurplus(flow: Cashflow) {
  const full = flow.months.slice(1, 4);
  if (!full.length) return Math.max(0, flow.months[0]?.net ?? 0);
  return Math.max(0, round0(full.reduce((s, m) => s + m.net, 0) / full.length));
}
