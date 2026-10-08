/**
 * Pure credit-card math (no IA, no store). Dates are ISO `YYYY-MM-DD`,
 * periods are `YYYY-MM` = the month of the statement's closing.
 *
 * Rules (phase 1, see cifra-design/tarjetas-y-asesor.md §1.2):
 * - A purchase goes to the first closing on or after its date. Buying on the
 *   closing day itself goes into that statement.
 * - Closing/due days past the end of a short month use its last day.
 * - The due date is the first `dueDay` after the closing.
 */
import type { Account, BankStatement, Book, Card, CardPurchase, Recurring, Transaction } from "./types";
import { dueDate as fijoDate, isPosted } from "./recurring.ts";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function lastDay(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addMonths(y: number, m: number, delta: number): [number, number] {
  const idx = y * 12 + (m - 1) + delta;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

export function clampDay(day: number): number {
  const n = Math.round(Number(day));
  if (!Number.isFinite(n)) return 1;
  return Math.min(31, Math.max(1, n));
}

function dayIn(y: number, m: number, day: number) {
  return Math.min(clampDay(day), lastDay(y, m));
}

/** Statement (YYYY-MM of its closing) a purchase on `date` belongs to. */
export function periodFor(date: string, closingDay: number): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  if (d <= dayIn(y, m, closingDay)) return `${y}-${pad(m)}`;
  const [ny, nm] = addMonths(y, m, 1);
  return `${ny}-${pad(nm)}`;
}

export function closingDate(period: string, closingDay: number): string {
  const [y, m] = period.split("-").map(Number);
  return `${y}-${pad(m)}-${pad(dayIn(y, m, closingDay))}`;
}

export function dueDate(period: string, closingDay: number, dueDay: number): string {
  const [y, m] = period.split("-").map(Number);
  const close = dayIn(y, m, closingDay);
  const sameMonth = dayIn(y, m, dueDay);
  if (sameMonth > close) return `${y}-${pad(m)}-${pad(sameMonth)}`;
  const [ny, nm] = addMonths(y, m, 1);
  return `${ny}-${pad(nm)}-${pad(dayIn(ny, nm, dueDay))}`;
}

export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const [ny, nm] = addMonths(y, m, delta);
  return `${ny}-${pad(nm)}`;
}

/** The card that owns a caja, if it is a card caja. */
export function cardForAccount(cards: Card[], accountId: string): Card | undefined {
  if (!accountId) return undefined;
  return cards.find((c) => c.accountArsId === accountId || c.accountUsdId === accountId);
}

/**
 * `cardPeriod` to store on a movement: only expenses and refunds on a card
 * caja get one. Keeps a hand-set period when the date did not change.
 */
export function cardPeriodFor(
  cards: Card[],
  tx: Pick<Transaction, "type" | "accountId" | "date"> & { cardPeriod?: string; purchaseId?: string },
  previous?: Pick<Transaction, "accountId" | "date" | "cardPeriod">,
  statements: BankStatement[] = [],
): string {
  if (tx.type === "transfer") return "";
  const card = cardForAccount(cards, tx.accountId);
  if (!card) return "";
  // Cuotas carry their own statement (cuota k = first + k − 1), set when derived.
  if (tx.purchaseId && /^\d{4}-\d{2}$/.test(tx.cardPeriod ?? "")) return tx.cardPeriod!;
  if (
    previous &&
    previous.cardPeriod &&
    previous.accountId === tx.accountId &&
    previous.date === tx.date &&
    /^\d{4}-\d{2}$/.test(tx.cardPeriod ?? "")
  ) {
    return tx.cardPeriod!;
  }
  // A new movement that already knows its statement (imported from the bank's PDF).
  if (!previous && /^\d{4}-\d{2}$/.test(tx.cardPeriod ?? "")) return tx.cardPeriod!;
  return periodForCard(tx.date, card, statements);
}

// ------------------------------------------------- real dates from the bank

function statementOf(card: Card, period: string, statements: BankStatement[]) {
  return statements.find((s) => s.cardId === card.id && s.period === period);
}

/** Closing date of a statement: the bank's (imported) if known, else the card's default day. */
export function closingOf(card: Card, period: string, statements: BankStatement[] = []): string {
  const own = statementOf(card, period, statements);
  if (own?.closingDate) return own.closingDate;
  const prev = statementOf(card, shiftPeriod(period, -1), statements);
  if (prev?.nextClosingDate) return prev.nextClosingDate;
  return closingDate(period, card.closingDay);
}

/** Due date of a statement: the bank's if known, else from the card's days. */
export function dueOf(card: Card, period: string, statements: BankStatement[] = []): string {
  const own = statementOf(card, period, statements);
  if (own?.dueDate) return own.dueDate;
  const prev = statementOf(card, shiftPeriod(period, -1), statements);
  if (prev?.nextDueDate) return prev.nextDueDate;
  return dueDate(period, card.closingDay, card.dueDay);
}

/**
 * Statement a date goes to, using the real closings printed by the bank
 * (they move a few days month to month) and the card's day otherwise.
 */
export function periodForCard(date: string, card: Card, statements: BankStatement[] = []): string {
  const p = periodFor(date, card.closingDay);
  if (!statements.some((s) => s.cardId === card.id)) return p;
  if (date <= closingOf(card, shiftPeriod(p, -1), statements)) return shiftPeriod(p, -1);
  if (date > closingOf(card, p, statements)) return shiftPeriod(p, 1);
  return p;
}

export type CardStatement = {
  period: string;
  closing: string;
  due: string;
  ars: number;
  usd: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** What a statement carries so far: expenses minus refunds, per currency. */
export function statementTotals(
  card: Card,
  txs: Transaction[],
  period: string,
  statements: BankStatement[] = [],
): CardStatement {
  let ars = 0;
  let usd = 0;
  for (const t of txs) {
    if (t.type === "transfer") continue;
    const isArs = t.accountId === card.accountArsId;
    const isUsd = t.accountId === card.accountUsdId;
    if (!isArs && !isUsd) continue;
    const p = t.cardPeriod || periodForCard(t.date, card, statements);
    if (p !== period) continue;
    const sign = t.type === "income" ? -1 : 1;
    if (isArs) ars += sign * t.amount;
    else usd += sign * t.amount;
  }
  return {
    period,
    closing: closingOf(card, period, statements),
    due: dueOf(card, period, statements),
    ars: round2(ars),
    usd: round2(usd),
  };
}

/** The statement still open today (purchases today go here). */
export function openStatement(card: Card, txs: Transaction[], today: string, statements: BankStatement[] = []): CardStatement {
  return statementTotals(card, txs, periodForCard(today, card, statements), statements);
}

/** Last closed statement (already closed, maybe not due yet). */
export function lastClosedStatement(
  card: Card,
  txs: Transaction[],
  today: string,
  statements: BankStatement[] = [],
): CardStatement {
  return statementTotals(card, txs, shiftPeriod(periodForCard(today, card, statements), -1), statements);
}

/** What you owe on a caja-tarjeta: the opposite of its balance, never < 0. */
export function cardDebt(account: Account, balance: number): number {
  if (account.kind !== "card") return 0;
  return balance < 0 ? round2(-balance) : 0;
}

export function cardAccountNames(name: string) {
  const base = name.trim().slice(0, 60) || "Tarjeta";
  return { ars: base, usd: `${base} USD` };
}

export function validLast4(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
}

/**
 * Cards in a backup that the server does not have (lost or never synced),
 * with their two cajas, moved to the current book ids. Same ids as before, so
 * movements on those cajas keep pointing at them.
 */
export function missingVaultCards(
  vault: { books: Book[]; accounts: Account[]; cards?: Card[] },
  books: Book[],
  cards: Card[],
  accounts: Account[],
): { cards: Card[]; accounts: Account[] } {
  const have = new Set(cards.map((c) => c.id));
  const haveAcc = new Set(accounts.map((a) => a.id));
  const outCards: Card[] = [];
  const outAccs: Account[] = [];
  for (const c of vault.cards ?? []) {
    if (have.has(c.id)) continue;
    const oldBook = vault.books.find((b) => b.id === c.bookId);
    const book = books.find((b) => b.name === oldBook?.name) ?? books.find((b) => b.id === c.bookId);
    if (!book) continue;
    const ars = vault.accounts.find((a) => a.id === c.accountArsId);
    const usd = vault.accounts.find((a) => a.id === c.accountUsdId);
    if (!ars || !usd || haveAcc.has(ars.id) || haveAcc.has(usd.id)) continue;
    outCards.push({ ...c, bookId: book.id });
    outAccs.push({ ...ars, bookId: book.id, kind: "card" }, { ...usd, bookId: book.id, kind: "card" });
  }
  return { cards: outCards, accounts: outAccs };
}

// ---------------------------------------------------------------- cuotas

export const MAX_INSTALLMENTS = 72;

export function cuotaId(purchaseId: string, k: number) {
  return `cuo_${purchaseId}_${k}`;
}

/**
 * Amount of each cuota (index 0 = cuota 1). Interest-free: total / n, and
 * the rounding goes to the last one so they add up to the total exactly.
 */
export function installmentAmounts(p: Pick<CardPurchase, "installments" | "installmentAmount" | "total" | "interestFree">): number[] {
  const n = Math.max(1, Math.min(MAX_INSTALLMENTS, Math.round(p.installments)));
  if (!p.interestFree) return Array.from({ length: n }, () => round2(p.installmentAmount));
  const each = round2(p.total / n);
  const out = Array.from({ length: n }, () => each);
  out[n - 1] = round2(p.total - each * (n - 1));
  return out;
}

function monthOf(date: string) {
  return date.slice(0, 7);
}

/**
 * The movements a purchase stands for: cuotas paidBefore+1 … n on the card
 * caja of its currency. The first one loaded keeps the purchase date and goes
 * to the statement of that date; each next one is dated the 1st of the
 * following month and goes one statement later. So a 12-cuota purchase counts
 * one cuota per month in budgets, starting the month of purchase.
 */
export function deriveInstallments(p: CardPurchase, card: Card, statements: BankStatement[] = []): Transaction[] {
  const amounts = installmentAmounts(p);
  const n = amounts.length;
  const first = Math.min(n, Math.max(1, Math.round(p.paidBefore) + 1));
  const anchorPeriod = periodForCard(p.date, card, statements);
  const anchorMonth = monthOf(p.date);
  const accountId = p.currency === "USD" ? card.accountUsdId : card.accountArsId;
  const label = p.merchant.trim() || "Compra en cuotas";
  const totalText = `${p.currency === "USD" ? "US$" : "$"}${round2(p.total).toLocaleString("es-AR")}`;
  const out: Transaction[] = [];
  for (let k = first; k <= n; k++) {
    const offset = k - first;
    const month = shiftPeriod(anchorMonth, offset);
    out.push({
      id: cuotaId(p.id, k),
      type: "expense",
      amount: amounts[k - 1]!,
      currency: p.currency,
      categoryId: p.categoryId,
      note: [`Cuota ${k}/${n} · ${totalText} en ${n} cuotas`, p.note.trim()].filter(Boolean).join(" · ").slice(0, 400),
      merchant: label.slice(0, 120),
      date: offset === 0 ? p.date : `${month}-01`,
      method: "credito",
      createdAt: "",
      bookId: p.bookId,
      accountId,
      counterpartyId: "",
      amountTo: 0,
      rateArs: 0,
      rateLocked: false,
      recurringId: "",
      cardPeriod: shiftPeriod(anchorPeriod, offset),
      purchaseId: p.id,
      installmentNo: k,
      installmentCount: n,
    });
  }
  return out;
}

/** Ids of cuotas of a purchase that exist now but would not after an edit. */
export function staleCuotaIds(txs: Transaction[], purchaseId: string, keep: Transaction[]): string[] {
  const wanted = new Set(keep.map((t) => t.id));
  return txs.filter((t) => t.purchaseId === purchaseId && !wanted.has(t.id)).map((t) => t.id);
}

/**
 * What financing costs when you know the cash price: extra paid, and the
 * implicit monthly rate and TEA (effective yearly) of paying n × cuota
 * instead of `cashPrice` today. App math, not IA.
 */
export function financingCost(cashPrice: number, cuota: number, n: number) {
  const total = round2(cuota * n);
  const extra = round2(total - cashPrice);
  if (!(cashPrice > 0) || !(cuota > 0) || n < 2 || extra <= 0) {
    return { total, extra: Math.max(0, extra), monthly: 0, tea: 0 };
  }
  // Present value of n cuotas at rate i equals the cash price; PV falls as i grows.
  const pv = (i: number) => cuota * ((1 - Math.pow(1 + i, -n)) / i);
  let lo = 1e-9;
  let hi = 1;
  for (let it = 0; it < 200 && pv(hi) > cashPrice; it++) hi *= 2;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > cashPrice) lo = mid;
    else hi = mid;
  }
  const monthly = (lo + hi) / 2;
  return { total, extra, monthly, tea: Math.pow(1 + monthly, 12) - 1 };
}

/** Cuota number you are on today (last one dated on or before today), and what is left to pay. */
export function purchaseProgress(p: CardPurchase, txs: Transaction[], today: string) {
  const mine = txs.filter((t) => t.purchaseId === p.id).sort((a, b) => a.installmentNo - b.installmentNo);
  const done = mine.filter((t) => t.date <= today);
  const current = done.length ? done[done.length - 1]!.installmentNo : Math.round(p.paidBefore);
  const left = round2(mine.filter((t) => t.date > today).reduce((s, t) => s + t.amount, 0));
  const lastPeriod = mine.length ? mine[mine.length - 1]!.cardPeriod : "";
  return { current, count: Math.round(p.installments), left, lastPeriod };
}

// ------------------------------------------------------- next statements

export type UpcomingStatement = CardStatement & {
  cuotasArs: number;
  cuotasUsd: number;
  fijosArs: number;
  fijosUsd: number;
  /** Cuotas whose last installment is in this statement. */
  ending: { count: number; ars: number; usd: number };
};

/**
 * The next `months` statements of a card, starting at the open one: what is
 * already loaded (cuotas, purchases) plus fijos charged to the card that are
 * not loaded yet.
 */
export function upcomingStatements(
  card: Card,
  txs: Transaction[],
  recurrings: Recurring[],
  today: string,
  months = 6,
  statements: BankStatement[] = [],
): UpcomingStatement[] {
  const open = periodForCard(today, card, statements);
  const cardIds = new Set([card.accountArsId, card.accountUsdId]);
  const out: UpcomingStatement[] = [];
  for (let i = 0; i < months; i++) {
    const period = shiftPeriod(open, i);
    const base = statementTotals(card, txs, period, statements);
    let cuotasArs = 0;
    let cuotasUsd = 0;
    const ending = { count: 0, ars: 0, usd: 0 };
    for (const t of txs) {
      if (!t.purchaseId || !cardIds.has(t.accountId) || t.type !== "expense") continue;
      if ((t.cardPeriod || periodForCard(t.date, card, statements)) !== period) continue;
      const usd = t.accountId === card.accountUsdId;
      if (usd) cuotasUsd += t.amount;
      else cuotasArs += t.amount;
      if (t.installmentNo === t.installmentCount) {
        ending.count += 1;
        if (usd) ending.usd += t.amount;
        else ending.ars += t.amount;
      }
    }
    out.push({
      ...base,
      cuotasArs: round2(cuotasArs),
      cuotasUsd: round2(cuotasUsd),
      fijosArs: 0,
      fijosUsd: 0,
      ending: { count: ending.count, ars: round2(ending.ars), usd: round2(ending.usd) },
    });
  }
  // Fijos on this card not loaded yet, placed in the statement of their date.
  const byPeriod = new Map(out.map((s) => [s.period, s]));
  const firstMonth = shiftPeriod(open, -1);
  for (const r of recurrings) {
    if (!r.active || r.type !== "expense" || !cardIds.has(r.accountId)) continue;
    for (let i = 0; i <= months; i++) {
      const ym = shiftPeriod(firstMonth, i);
      const date = fijoDate(ym, r.day);
      if (date < today || isPosted(r, txs, ym)) continue;
      const s = byPeriod.get(periodForCard(date, card, statements));
      if (!s) continue;
      const usd = r.accountId === card.accountUsdId;
      if (usd) {
        s.fijosUsd = round2(s.fijosUsd + r.amount);
        s.usd = round2(s.usd + r.amount);
      } else {
        s.fijosArs = round2(s.fijosArs + r.amount);
        s.ars = round2(s.ars + r.amount);
      }
    }
  }
  return out;
}

/** Share of the limit in use (0–1+). Cuotas take the whole purchase until paid. USD counts at `usdRate`. */
export function limitUse(card: Card, debtArs: number, debtUsd: number, usdRate: number) {
  if (!(card.limitArs > 0)) return null;
  const used = round2(debtArs + debtUsd * (usdRate > 0 ? usdRate : 0));
  return { used, limit: card.limitArs, pct: used / card.limitArs, free: round2(card.limitArs - used) };
}

/**
 * Already committed for a month before spending a peso: cuotas dated that
 * month plus active fijo expenses not loaded yet. ARS, USD at its stamped
 * rate or `usdRate`.
 */
export function committedForMonth(txs: Transaction[], recurrings: Recurring[], ym: string, usdRate: number) {
  let cuotas = 0;
  for (const t of txs) {
    if (!t.purchaseId || t.type !== "expense" || !t.date.startsWith(ym)) continue;
    cuotas += t.currency === "ARS" ? t.amount : t.amount * (t.rateArs > 0 ? t.rateArs : usdRate);
  }
  let fijos = 0;
  for (const r of recurrings) {
    if (!r.active || r.type !== "expense" || isPosted(r, txs, ym)) continue;
    fijos += r.currency === "ARS" ? r.amount : r.amount * usdRate;
  }
  return { cuotas: round2(cuotas), fijos: round2(fijos), total: round2(cuotas + fijos) };
}

/** Purchases in cuotas made in a month (date in `ym`, 2+ cuotas): total financed, ARS. */
export function financedInMonth(purchases: CardPurchase[], ym: string, usdRate: number) {
  let total = 0;
  let count = 0;
  for (const p of purchases) {
    if (!p.date.startsWith(ym) || p.installments < 2 || p.paidBefore > 0) continue;
    total += p.currency === "ARS" ? p.total : p.total * usdRate;
    count += 1;
  }
  return { total: round2(total), count };
}
