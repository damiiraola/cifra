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
import type { Account, Book, Card, Transaction } from "./types";

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
  tx: Pick<Transaction, "type" | "accountId" | "date"> & { cardPeriod?: string },
  previous?: Pick<Transaction, "accountId" | "date" | "cardPeriod">,
): string {
  if (tx.type === "transfer") return "";
  const card = cardForAccount(cards, tx.accountId);
  if (!card) return "";
  if (
    previous &&
    previous.cardPeriod &&
    previous.accountId === tx.accountId &&
    previous.date === tx.date &&
    /^\d{4}-\d{2}$/.test(tx.cardPeriod ?? "")
  ) {
    return tx.cardPeriod!;
  }
  return periodFor(tx.date, card.closingDay);
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
export function statementTotals(card: Card, txs: Transaction[], period: string): CardStatement {
  let ars = 0;
  let usd = 0;
  for (const t of txs) {
    if (t.type === "transfer") continue;
    const isArs = t.accountId === card.accountArsId;
    const isUsd = t.accountId === card.accountUsdId;
    if (!isArs && !isUsd) continue;
    const p = t.cardPeriod || periodFor(t.date, card.closingDay);
    if (p !== period) continue;
    const sign = t.type === "income" ? -1 : 1;
    if (isArs) ars += sign * t.amount;
    else usd += sign * t.amount;
  }
  return {
    period,
    closing: closingDate(period, card.closingDay),
    due: dueDate(period, card.closingDay, card.dueDay),
    ars: round2(ars),
    usd: round2(usd),
  };
}

/** The statement still open today (purchases today go here). */
export function openStatement(card: Card, txs: Transaction[], today: string): CardStatement {
  return statementTotals(card, txs, periodFor(today, card.closingDay));
}

/** Last closed statement (already closed, maybe not due yet). */
export function lastClosedStatement(card: Card, txs: Transaction[], today: string): CardStatement {
  return statementTotals(card, txs, shiftPeriod(periodFor(today, card.closingDay), -1));
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
