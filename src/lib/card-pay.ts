/**
 * Paying a card statement (phase 4, cifra-design/tarjetas-y-asesor.md §1.6).
 * Pure: no store, no IA. Dates ISO `YYYY-MM-DD`, periods `YYYY-MM` (closing month).
 *
 * How a statement's balance is read, like the bank does:
 *   saldo al cierre P = deuda inicial + consumos de los resúmenes ≤ P − pagos hasta el cierre P
 *   saldo anterior (lo que viene de antes) = saldo al cierre P−1 − pagos entre cierres
 * A payment is a Cambio (transfer) into a card caja; it is never an expense.
 * What you do not pay rolls into the next statement as "saldo financiado" on its own.
 */
import type { Account, BankStatement, Card, Transaction } from "./types";
import { cardForAccount, closingOf, dueOf, periodForCard, shiftPeriod } from "./card-math.ts";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "septiembre 2026" */
export function periodName(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

/** ARS amounts the app moves are whole pesos; USD keeps cents. */
function roundFor(currency: "ARS" | "USD", n: number) {
  return currency === "ARS" ? Math.round(n) : r2(n);
}

type Pair = { ars: number; usd: number };

/** Movements into (+) or out of (−) the card's cajas that are not consumos: payments, in each caja's currency. */
export function cardPayments(card: Card, txs: Transaction[]) {
  const out: { id: string; date: string; ars: number; usd: number; period: string }[] = [];
  for (const t of txs) {
    if (t.type !== "transfer") continue;
    const into = t.counterpartyId === card.accountArsId || t.counterpartyId === card.accountUsdId;
    const outOf = t.accountId === card.accountArsId || t.accountId === card.accountUsdId;
    if (!into && !outOf) continue;
    let ars = 0;
    let usd = 0;
    if (into) {
      const got = t.amountTo > 0 ? t.amountTo : t.amount;
      if (t.counterpartyId === card.accountUsdId) usd += got;
      else ars += got;
    }
    if (outOf) {
      if (t.accountId === card.accountUsdId) usd -= t.amount;
      else ars -= t.amount;
    }
    out.push({ id: t.id, date: t.date, ars, usd, period: t.cardPeriod });
  }
  return out;
}

/** Consumos (expenses − refunds) of each statement, per currency. */
function chargesByPeriod(card: Card, txs: Transaction[], statements: BankStatement[]) {
  const map = new Map<string, Pair>();
  for (const t of txs) {
    if (t.type === "transfer") continue;
    const isArs = t.accountId === card.accountArsId;
    const isUsd = t.accountId === card.accountUsdId;
    if (!isArs && !isUsd) continue;
    const p = t.cardPeriod || periodForCard(t.date, card, statements);
    const cur = map.get(p) ?? { ars: 0, usd: 0 };
    const v = t.type === "income" ? -t.amount : t.amount;
    if (isArs) cur.ars += v;
    else cur.usd += v;
    map.set(p, cur);
  }
  return map;
}

function openingDebt(card: Card, accounts: Account[]): Pair {
  const a = accounts.find((x) => x.id === card.accountArsId);
  const u = accounts.find((x) => x.id === card.accountUsdId);
  return { ars: a && a.opening < 0 ? -a.opening : 0, usd: u && u.opening < 0 ? -u.opening : 0 };
}

export type StatementStatus = "sin-deuda" | "pagado" | "parcial" | "a-pagar" | "vencido";

export type StatementBalance = {
  period: string;
  closing: string;
  due: string;
  /** Consumos of this statement. */
  chargesArs: number;
  chargesUsd: number;
  /** What came from before and was not paid (saldo financiado). Negative = saldo a favor. */
  carriedArs: number;
  carriedUsd: number;
  /** carried + charges: what Cifra expects the bank to ask. */
  cifraArs: number;
  cifraUsd: number;
  bank: BankStatement | null;
  /** What there is to pay: the bank's total when the statement was imported, else Cifra's. Never < 0. */
  owedArs: number;
  owedUsd: number;
  /** Bank's minimum payment (0 = unknown). */
  minimumArs: number;
  /** Paid after this closing (until the next one). */
  paidArs: number;
  paidUsd: number;
  leftArs: number;
  leftUsd: number;
  status: StatementStatus;
  minimumCovered: boolean;
};

export function statementBalance(
  card: Card,
  txs: Transaction[],
  period: string,
  today: string,
  statements: BankStatement[] = [],
  accounts: Account[] = [],
): StatementBalance {
  const closing = closingOf(card, period, statements);
  const nextClosing = closingOf(card, shiftPeriod(period, 1), statements);
  const due = dueOf(card, period, statements);
  const charges = chargesByPeriod(card, txs, statements);
  const pays = cardPayments(card, txs);
  const start = openingDebt(card, accounts);
  let beforeArs = start.ars;
  let beforeUsd = start.usd;
  for (const [p, v] of charges) {
    if (p < period) {
      beforeArs += v.ars;
      beforeUsd += v.usd;
    }
  }
  let paidBeforeArs = 0;
  let paidBeforeUsd = 0;
  let paidArs = 0;
  let paidUsd = 0;
  for (const x of pays) {
    if (x.date <= closing) {
      paidBeforeArs += x.ars;
      paidBeforeUsd += x.usd;
    } else if (x.date <= nextClosing) {
      paidArs += x.ars;
      paidUsd += x.usd;
    }
  }
  const mine = charges.get(period) ?? { ars: 0, usd: 0 };
  const carriedArs = r2(beforeArs - paidBeforeArs);
  const carriedUsd = r2(beforeUsd - paidBeforeUsd);
  const cifraArs = r2(carriedArs + mine.ars);
  const cifraUsd = r2(carriedUsd + mine.usd);
  const bank = statements.find((s) => s.cardId === card.id && s.period === period) ?? null;
  const owedArs = r2(Math.max(0, bank ? bank.totalArs : cifraArs));
  const owedUsd = r2(Math.max(0, bank ? bank.totalUsd : cifraUsd));
  const leftArs = r2(Math.max(0, owedArs - paidArs));
  const leftUsd = r2(Math.max(0, owedUsd - paidUsd));
  const minimumArs = bank?.minimumArs ?? 0;
  let status: StatementStatus;
  if (owedArs < 1 && owedUsd < 0.01) status = "sin-deuda";
  else if (leftArs < 1 && leftUsd < 0.01) status = "pagado";
  else if (today > due) status = "vencido";
  else if (paidArs > 0 || paidUsd > 0) status = "parcial";
  else status = "a-pagar";
  return {
    period,
    closing,
    due,
    chargesArs: r2(mine.ars),
    chargesUsd: r2(mine.usd),
    carriedArs,
    carriedUsd,
    cifraArs,
    cifraUsd,
    bank,
    owedArs,
    owedUsd,
    minimumArs,
    paidArs: r2(paidArs),
    paidUsd: r2(paidUsd),
    leftArs,
    leftUsd,
    status,
    minimumCovered: minimumArs > 0 && paidArs >= minimumArs - 0.5,
  };
}

/** The last closed statement of a card (the one you pay now). */
export function lastClosedBalance(
  card: Card,
  txs: Transaction[],
  today: string,
  statements: BankStatement[] = [],
  accounts: Account[] = [],
) {
  const open = periodForCard(today, card, statements);
  return statementBalance(card, txs, shiftPeriod(open, -1), today, statements, accounts);
}

/**
 * Interest the bank will likely charge on what stays unpaid, from the due
 * date to the next closing, at the card's TNA, plus 21 % IVA on it. An
 * estimate: the bank's statement always wins.
 */
export function estimatedInterest(left: number, tna: number, from: string, to: string) {
  if (!(left > 0) || !(tna > 0) || !from || !to || to <= from) return { interest: 0, iva: 0, total: 0, days: 0 };
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
  const interest = Math.round((left * (tna / 100) * days) / 365);
  const iva = Math.round(interest * 0.21);
  return { interest, iva, total: interest + iva, days };
}

/** Perception on USD paid in pesos (RG 5617): `pct` of the pesos. */
export function perceptionFor(usd: number, rate: number, pct: number) {
  if (!(usd > 0) || !(rate > 0) || !(pct > 0)) return 0;
  return Math.round(usd * rate * (pct / 100));
}

export const PERCEPTION_NOTE = "percepción, recuperable solo si presentás Ganancias/Bienes Personales";

export type TxDraft = Omit<Transaction, "id" | "createdAt">;

export type PayPlan = {
  date: string;
  period: string;
  /** Pay the ARS part from an ARS caja. */
  ars?: { fromId: string; amount: number };
  /** Pay the USD part: with your own dollars (no perception) or in pesos (perception at the card's %). */
  usd?: { mode: "dolares"; fromId: string; amount: number } | { mode: "pesos"; fromId: string; amount: number; rate: number };
};

function baseDraft(card: Card, date: string): Omit<TxDraft, "type" | "amount" | "currency" | "accountId"> {
  return {
    categoryId: "transferencias",
    note: "",
    merchant: `Pago ${card.name}`.slice(0, 120),
    date,
    method: "transferencia",
    bookId: card.bookId,
    counterpartyId: "",
    amountTo: 0,
    rateArs: 0,
    rateLocked: false,
    recurringId: "",
    cardPeriod: "",
    purchaseId: "",
    installmentNo: 0,
    installmentCount: 0,
  };
}

/**
 * The movements that pay a statement: one Cambio per currency into the card
 * cajas (tagged with the statement), and, when USD is paid in pesos, the
 * perception as an expense in Impuestos from the same caja.
 */
export function paymentMovements(card: Card, plan: PayPlan): TxDraft[] {
  const out: TxDraft[] = [];
  const label = `Resumen de ${periodName(plan.period)}`;
  if (plan.ars && plan.ars.amount > 0 && plan.ars.fromId) {
    const amount = roundFor("ARS", plan.ars.amount);
    out.push({
      ...baseDraft(card, plan.date),
      type: "transfer",
      amount,
      currency: "ARS",
      accountId: plan.ars.fromId,
      counterpartyId: card.accountArsId,
      amountTo: amount,
      rateArs: 1,
      note: label,
      cardPeriod: plan.period,
    });
  }
  const u = plan.usd;
  if (u && u.amount > 0 && u.fromId) {
    const usd = roundFor("USD", u.amount);
    if (u.mode === "dolares") {
      out.push({
        ...baseDraft(card, plan.date),
        type: "transfer",
        amount: usd,
        currency: "USD",
        accountId: u.fromId,
        counterpartyId: card.accountUsdId,
        amountTo: usd,
        note: `${label} · con tus dólares, sin percepción`,
        cardPeriod: plan.period,
      });
    } else if (u.rate > 0) {
      const pesos = roundFor("ARS", usd * u.rate);
      out.push({
        ...baseDraft(card, plan.date),
        type: "transfer",
        amount: pesos,
        currency: "ARS",
        accountId: u.fromId,
        counterpartyId: card.accountUsdId,
        amountTo: usd,
        rateArs: u.rate,
        rateLocked: true,
        note: `${label} · US$ ${usd.toLocaleString("es-AR")} pagados en pesos`,
        cardPeriod: plan.period,
      });
      const perception = perceptionFor(usd, u.rate, card.usdPerceptionPct);
      if (perception > 0) {
        out.push({
          ...baseDraft(card, plan.date),
          type: "expense",
          amount: perception,
          currency: "ARS",
          accountId: u.fromId,
          categoryId: "impuestos",
          merchant: `Percepción dólar ${card.name}`.slice(0, 120),
          method: "debito",
          note: `${card.usdPerceptionPct} % sobre US$ ${usd.toLocaleString("es-AR")} pagados en pesos (${label.toLowerCase()}) · ${PERCEPTION_NOTE}`.slice(0, 400),
          rateArs: 1,
        });
      }
    }
  }
  return out;
}

/** Expense to load the gap between the bank's total and Cifra's as a bank charge. */
export function gapCharge(card: Card, balance: StatementBalance): TxDraft | null {
  if (!balance.bank) return null;
  const gap = Math.round(balance.bank.totalArs - balance.cifraArs);
  if (gap < 1) return null;
  return {
    ...baseDraft(card, balance.closing),
    type: "expense",
    amount: gap,
    currency: "ARS",
    accountId: card.accountArsId,
    categoryId: "intereses",
    merchant: "Cargos del banco",
    method: "credito",
    note: `Diferencia con el resumen de ${periodName(balance.period)} (intereses, comisiones o cargos)`,
    cardPeriod: balance.period,
    rateArs: 1,
  };
}

// ------------------------------------------- old "Crédito" expenses → card

export type CreditMovePlan = {
  /** Movements to point at the card caja (same id, new account and statement). */
  moves: { id: string; accountId: string; cardPeriod: string }[];
  count: number;
  ars: number;
  usd: number;
  /** How much each caja goes up (those expenses stop coming out of it). */
  bySource: { accountId: string; currency: "ARS" | "USD"; amount: number }[];
  /** Payments for statements already due, so balances stay as they were. */
  settle: TxDraft[];
  /** Moved amounts of statements not due yet: they become card debt. */
  pendingArs: number;
  pendingUsd: number;
};

/**
 * Expenses loaded with method "Crédito" on a normal caja (bank, cash…) since
 * `from`, that belong to this card's book. Cuotas and card movements are left
 * alone. With `settle`, statements already due get a payment from the caja
 * the expenses came out of, dated their due date, so that caja's balance does
 * not change for what you already paid.
 */
export function planCreditMove(
  card: Card,
  txs: Transaction[],
  accounts: Account[],
  from: string,
  today: string,
  statements: BankStatement[] = [],
): CreditMovePlan {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const moves: CreditMovePlan["moves"] = [];
  const src = new Map<string, { accountId: string; currency: "ARS" | "USD"; amount: number }>();
  const due = new Map<string, { accountId: string; currency: "ARS" | "USD"; period: string; amount: number }>();
  let ars = 0;
  let usd = 0;
  let pendingArs = 0;
  let pendingUsd = 0;
  for (const t of txs) {
    if (t.type !== "expense" || t.method !== "credito" || t.purchaseId || t.bookId !== card.bookId) continue;
    if (!t.date || t.date < from) continue;
    if (t.currency !== "ARS" && t.currency !== "USD") continue;
    const acc = byId.get(t.accountId);
    if (!acc || acc.kind === "card" || acc.currency !== t.currency) continue;
    const currency = t.currency;
    const to = currency === "USD" ? card.accountUsdId : card.accountArsId;
    const period = periodForCard(t.date, card, statements);
    moves.push({ id: t.id, accountId: to, cardPeriod: period });
    if (currency === "USD") usd += t.amount;
    else ars += t.amount;
    const sk = `${acc.id}|${currency}`;
    const s = src.get(sk) ?? { accountId: acc.id, currency, amount: 0 };
    s.amount += t.amount;
    src.set(sk, s);
    if (dueOf(card, period, statements) < today) {
      const dk = `${acc.id}|${currency}|${period}`;
      const d = due.get(dk) ?? { accountId: acc.id, currency, period, amount: 0 };
      d.amount += t.amount;
      due.set(dk, d);
    } else if (currency === "USD") pendingUsd += t.amount;
    else pendingArs += t.amount;
  }
  const settle: TxDraft[] = [...due.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((d) => {
      const amount = roundFor(d.currency, d.amount);
      return {
        ...baseDraft(card, dueOf(card, d.period, statements)),
        type: "transfer" as const,
        amount,
        currency: d.currency,
        accountId: d.accountId,
        counterpartyId: d.currency === "USD" ? card.accountUsdId : card.accountArsId,
        amountTo: amount,
        rateArs: d.currency === "ARS" ? 1 : 0,
        note: `Resumen de ${periodName(d.period)} · ya pagado (gastos pasados desde Crédito)`,
        cardPeriod: d.period,
      };
    });
  return {
    moves,
    count: moves.length,
    ars: r2(ars),
    usd: r2(usd),
    bySource: [...src.values()].map((s) => ({ ...s, amount: roundFor(s.currency, s.amount) })),
    settle,
    pendingArs: r2(pendingArs),
    pendingUsd: r2(pendingUsd),
  };
}

/** Cards whose cajas a movement touches (to know a Cambio is a card payment). */
export function paidCard(cards: Card[], tx: Pick<Transaction, "type" | "counterpartyId">) {
  return tx.type === "transfer" ? cardForAccount(cards, tx.counterpartyId) : undefined;
}
