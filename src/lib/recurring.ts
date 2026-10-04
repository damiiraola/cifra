import { daysInMonth, todayISO } from "./utils.ts";
import type { PayMethod, Recurring, Transaction, TxType } from "./types";

export const FIJO_TEMPLATES: {
  name: string;
  categoryId: string;
  day: number;
  method: PayMethod;
  type: TxType;
}[] = [
  { name: "Alquiler", categoryId: "vivienda", day: 5, method: "transferencia", type: "expense" },
  { name: "Expensas", categoryId: "vivienda", day: 10, method: "transferencia", type: "expense" },
  { name: "Edenor", categoryId: "servicios", day: 12, method: "debito", type: "expense" },
  { name: "Internet", categoryId: "servicios", day: 8, method: "debito", type: "expense" },
  { name: "Celular", categoryId: "servicios", day: 15, method: "debito", type: "expense" },
  { name: "Netflix", categoryId: "suscripciones", day: 7, method: "credito", type: "expense" },
  { name: "Spotify", categoryId: "suscripciones", day: 7, method: "credito", type: "expense" },
  { name: "Prepaga", categoryId: "salud", day: 6, method: "debito", type: "expense" },
  { name: "Monotributo", categoryId: "impuestos", day: 20, method: "transferencia", type: "expense" },
  { name: "Sueldo", categoryId: "sueldo", day: 1, method: "transferencia", type: "income" },
];

export function dueDate(ym: string, day: number) {
  const last = daysInMonth(ym);
  const d = Math.min(Math.max(1, Math.round(day) || 1), last);
  return `${ym}-${String(d).padStart(2, "0")}`;
}

export function postedTxId(recurringId: string, ym: string) {
  return `rec_${recurringId}_${ym}`;
}

export function isPosted(r: Recurring, txs: Transaction[], ym: string) {
  const id = postedTxId(r.id, ym);
  return txs.some((t) => t.id === id || (t.recurringId === r.id && t.date.startsWith(ym)));
}

export function isDue(r: Recurring, ym: string, today = todayISO()) {
  if (!r.active) return false;
  const date = dueDate(ym, r.day);
  if (today.slice(0, 7) > ym) return true;
  if (today.slice(0, 7) < ym) return false;
  return today >= date;
}

/**
 * Fijos that should be on this month's books but are not yet: due (their
 * day already passed, or the month is over) and not posted. Future ones in
 * the current month do NOT count.
 */
export function dueUnposted(rs: Recurring[], txs: Transaction[], ym: string, today = todayISO()) {
  return rs.filter((r) => isDue(r, ym, today) && !isPosted(r, txs, ym));
}

/**
 * A movement loaded by hand that looks like this fijo (same book, type,
 * category and amount, same month, not already linked to a fijo). Posting the
 * fijo on top of it would count the expense twice.
 */
export function likelyDuplicate(r: Recurring, txs: Transaction[], ym: string): Transaction | null {
  return (
    txs.find(
      (t) =>
        !t.recurringId &&
        t.bookId === r.bookId &&
        t.type === r.type &&
        t.categoryId === r.categoryId &&
        t.date.startsWith(ym) &&
        t.currency === r.currency &&
        Math.abs(t.amount - r.amount) <= Math.max(1, r.amount * 0.01),
    ) ?? null
  );
}
