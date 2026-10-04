import type { AccountKind, BookKind, PayMethod, TxType } from "./types";

/**
 * What payment method makes sense for a caja. USDT → crypto, cash → efectivo,
 * Mercado Pago → mercadopago, card caja → credito. For a bank keep the bank method the user had
 * (débito/crédito/transferencia) instead of overwriting it.
 */
export function methodForAccount(kind: AccountKind | undefined, current: PayMethod): PayMethod {
  if (kind === "crypto") return "crypto";
  if (kind === "cash") return "efectivo";
  if (kind === "mp") return "mercadopago";
  if (kind === "card") return "credito";
  if (kind === "bank") {
    // Crédito stays allowed on the bank for books without a card yet.
    return current === "debito" || current === "credito" || current === "transferencia" || current === "otro"
      ? current
      : "debito";
  }
  return current;
}

const LAST_KEY = "cifra.last-category";

type LastMap = Record<string, string>;

function readLast(): LastMap {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(LAST_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as LastMap) : {};
  } catch {
    return {};
  }
}

/** Remember the category used last, per book and type. */
export function rememberCategory(bookId: string, type: TxType, categoryId: string) {
  if (type === "transfer" || !categoryId) return;
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ ...readLast(), [`${bookId}:${type}`]: categoryId }));
  } catch {
    /* private mode: just don't remember */
  }
}

export function lastCategory(bookId: string, type: TxType): string {
  return readLast()[`${bookId}:${type}`] ?? "";
}

/**
 * Starting category for a new movement. Never silently "Alimentación":
 * - the last one used in this book for this type, if it still exists;
 * - income: Sueldo (personal) or Ventas (negocio);
 * - expense in a negocio book: Otros;
 * - expense in the personal book: none — the user picks one.
 */
export function defaultCategory(
  type: TxType,
  bookKind: BookKind | undefined,
  last: string,
  available: ReadonlySet<string>,
): string {
  if (type === "transfer") return "transferencias";
  if (last && available.has(last)) return last;
  if (type === "income") {
    const pick = bookKind === "business" ? "ventas" : "sueldo";
    return available.has(pick) ? pick : "";
  }
  if (bookKind === "business") return available.has("otros") ? "otros" : "";
  return "";
}
