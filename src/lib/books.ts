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
  credito: "bank",
  transferencia: "bank",
  otro: "bank",
};

export function inferAccount(
  accounts: Account[],
  bookId: string,
  method: PayMethod,
  currency: Currency,
): string {
  const mine = accounts.filter((a) => a.bookId === bookId && !a.archived);
  const kind = METHOD_KIND[method];
  return (
    mine.find((a) => a.currency === currency && a.kind === kind)?.id ??
    mine.find((a) => a.currency === currency)?.id ??
    mine[0]?.id ??
    ""
  );
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

export function emptyTxFields(bookId = "", accountId = ""): Pick<
  Transaction,
  "bookId" | "accountId" | "counterpartyId" | "amountTo" | "rateArs" | "rateLocked" | "recurringId"
> {
  return {
    bookId,
    accountId,
    counterpartyId: "",
    amountTo: 0,
    rateArs: 0,
    rateLocked: false,
    recurringId: "",
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
