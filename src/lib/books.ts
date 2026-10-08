import type { Account, AccountKind, Book, BookKind, Currency, PayMethod, Transaction } from "./types";

export const BOOK_SPECS: { kind: BookKind; name: string }[] = [
  { kind: "personal", name: "Personal" },
  { kind: "business", name: "Negocio" },
];

export const ACCOUNT_TEMPLATES: { name: string; kind: AccountKind; currency: Currency }[] = [
  { name: "Efectivo", kind: "cash", currency: "ARS" },
  { name: "Mercado Pago", kind: "mp", currency: "ARS" },
  { name: "Banco", kind: "bank", currency: "ARS" },
  { name: "Dólares", kind: "cash", currency: "USD" },
  { name: "USDT", kind: "crypto", currency: "USDT" },
];

const METHOD_KIND: Record<PayMethod, AccountKind> = {
  efectivo: "cash",
  mercadopago: "mp",
  crypto: "crypto",
  debito: "bank",
  credito: "card",
  transferencia: "bank",
  otro: "bank",
};

/**
 * Default caja for a payment method. Crédito goes to a card caja in that
 * currency (it used to go to the bank, so buying with credit lowered the bank
 * the day you bought). Without a card in the book it falls back to the bank,
 * as before. Other methods never land on a card caja by accident.
 */
export function inferAccount(
  accounts: Account[],
  bookId: string,
  method: PayMethod,
  currency: Currency,
): string {
  const mine = accounts.filter((a) => a.bookId === bookId && !a.archived);
  const kind = METHOD_KIND[method];
  if (kind === "card") {
    const card = mine.find((a) => a.kind === "card" && a.currency === currency);
    if (card) return card.id;
  }
  const money = mine.filter((a) => a.kind !== "card");
  const want = kind === "card" ? "bank" : kind;
  return (
    money.find((a) => a.currency === currency && a.kind === want)?.id ??
    money.find((a) => a.currency === currency)?.id ??
    money[0]?.id ??
    ""
  );
}

/** "Banco · ARS", or just the name when it already says the currency ("Visa USD"). */
export function accountLabel(a: Pick<Account, "name" | "currency">): string {
  return a.name.endsWith(` ${a.currency}`) ? a.name : `${a.name} · ${a.currency}`;
}

export function accountBalance(account: Account, txs: Transaction[]): number {
  let n = account.opening;
  for (const t of txs) {
    if (t.type === "transfer") {
      if (t.accountId === account.id) n -= t.amount;
      if (t.counterpartyId === account.id) n += t.amountTo > 0 ? t.amountTo : t.amount;
      continue;
    }
    if (t.accountId !== account.id) continue;
    n += t.type === "income" ? t.amount : -t.amount;
  }
  return n;
}

export function stampRate(currency: Currency, usd: number, usdt: number, override?: number) {
  if (override && override > 0) return override;
  if (currency === "ARS") return 1;
  if (currency === "USDT") return usdt;
  return usd;
}

export function roundMoney(amount: number, currency: Currency) {
  if (!(amount > 0) || !Number.isFinite(amount)) return 0;
  if (currency === "ARS") return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

/** The other side of a cambio. ARS = foreign × rate. */
export function otherLeg(
  from: Currency,
  to: Currency,
  rate: number,
  amount: number,
  driver: "from" | "to",
): number | null {
  if (!(rate > 0) || !(amount > 0) || from === to) return null;
  let raw: number;
  if (driver === "from") {
    raw = from === "ARS" && to !== "ARS" ? amount / rate : amount * rate;
  } else {
    raw = to === "ARS" && from !== "ARS" ? amount / rate : amount * rate;
  }
  const n = roundMoney(raw, driver === "from" ? to : from);
  return n > 0 ? n : null;
}

/** A typed quote more than double or less than half the market is almost always a dropped zero. */
export function rateFarFromMarket(rate: number, market: number) {
  if (!(rate > 0) || !(market > 0)) return false;
  const ratio = rate / market;
  return ratio < 0.5 || ratio > 2;
}

export function legsMatch(
  fromAmount: number,
  toAmount: number,
  from: Currency,
  to: Currency,
  rate: number,
) {
  if (!(fromAmount > 0) || !(toAmount > 0) || !(rate > 0) || from === to) return true;
  const expected = otherLeg(from, to, rate, fromAmount, "from");
  if (!expected) return false;
  return Math.abs(expected - toAmount) <= Math.max(1, expected * 0.01);
}

export function emptyTxFields(bookId = "", accountId = ""): Pick<
  Transaction,
  "bookId" | "accountId" | "counterpartyId" | "amountTo" | "rateArs" | "rateLocked" | "recurringId" | "cardPeriod" | "purchaseId" | "installmentNo" | "installmentCount"
> {
  return {
    bookId,
    accountId,
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

export function toARSAmount(amount: number, currency: Currency, usd: number, usdt: number) {
  if (currency === "ARS") return amount;
  if (currency === "USDT") return amount * usdt;
  return amount * usd;
}

export function logStreak(txs: Transaction[], today: string) {
  const days = new Set(txs.filter((t) => t.type !== "transfer").map((t) => t.date));
  let cursor = today;
  if (!days.has(cursor)) {
    const d = new Date(`${cursor}T12:00:00`);
    d.setDate(d.getDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    const d = new Date(`${cursor}T12:00:00`);
    d.setDate(d.getDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return n;
}
