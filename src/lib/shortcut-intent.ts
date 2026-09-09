import type { Account, Book, Currency, PayMethod, TxType } from "./types";

const INTENT_KEY = "cifra.shortcut";

export type ShortcutDraft = {
  type?: TxType;
  amount?: number;
  currency?: Currency;
  categoryId?: string;
  note?: string;
  merchant?: string;
  date?: string;
  method?: PayMethod;
  accountId?: string;
};

export type ShortcutIntent = {
  bookId?: string;
  draft: ShortcutDraft;
  save: boolean;
  open: boolean;
};

const TYPES: Record<string, TxType> = {
  gasto: "expense",
  expense: "expense",
  ingreso: "income",
  income: "income",
  cambio: "transfer",
  transfer: "transfer",
  transferencia: "transfer",
};

const CURRENCIES: Record<string, Currency> = {
  ars: "ARS",
  peso: "ARS",
  pesos: "ARS",
  usd: "USD",
  dolar: "USD",
  dolares: "USD",
  usdt: "USDT",
  crypto: "USDT",
  cripto: "USDT",
};

function param(search: URLSearchParams, ...keys: string[]) {
  for (const k of keys) {
    const v = search.get(k);
    if (v != null && v.trim()) return v.trim();
  }
  return "";
}

function fold(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

export function parseShortcutSearch(
  search: string,
  books: Book[],
  accounts: Account[],
  categoryNames: { id: string; name: string }[],
): ShortcutIntent | null {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const cargar = param(q, "cargar", "nuevo", "add");
  const tipo = param(q, "tipo", "type");
  const monto = param(q, "monto", "amount");
  const nota = param(q, "nota", "note");
  const cat = param(q, "cat", "categoria");
  const caja = param(q, "caja", "cuenta");
  const libro = param(q, "libro", "book");
  const moneda = param(q, "moneda", "currency");
  const fecha = param(q, "fecha", "date");
  const guardar = param(q, "guardar", "save");
  if (!cargar && !tipo && !monto && !nota && !cat && !caja && !libro) return null;

  const type = TYPES[fold(tipo)] ?? (cargar || monto ? "expense" : undefined);
  const currency = CURRENCIES[fold(moneda)] ?? undefined;
  const amount = Number(String(monto).replace(",", "."));
  const book =
    books.find((b) => fold(b.name) === fold(libro) || fold(b.kind) === fold(libro)) ??
    (fold(libro) === "negocio" || fold(libro) === "business"
      ? books.find((b) => b.kind === "business")
      : fold(libro) === "personal"
        ? books.find((b) => b.kind === "personal")
        : undefined);

  const bookId = book?.id;
  const inBook = accounts.filter((a) => !bookId || a.bookId === bookId);
  const cajaFold = fold(caja);
  const account =
    inBook.find((a) => fold(a.name) === cajaFold) ??
    inBook.find((a) => cajaFold.includes("efectivo") && a.kind === "cash") ??
    inBook.find((a) => (cajaFold.includes("mp") || cajaFold.includes("mercado")) && a.kind === "mp") ??
    inBook.find((a) => cajaFold.includes("banco") && a.kind === "bank") ??
    inBook.find((a) => (cajaFold.includes("usdt") || cajaFold.includes("cripto")) && a.currency === "USDT") ??
    inBook.find((a) => (cajaFold.includes("dolar") || cajaFold === "usd") && a.currency === "USD");

  const catFold = fold(cat);
  const category =
    categoryNames.find((c) => fold(c.id) === catFold) ??
    categoryNames.find((c) => fold(c.name) === catFold) ??
    categoryNames.find((c) => fold(c.name).includes(catFold) && catFold.length >= 3);

  const draft: ShortcutDraft = {};
  if (type) draft.type = type;
  if (Number.isFinite(amount) && amount > 0) draft.amount = amount;
  if (currency) draft.currency = currency;
  else if (account) draft.currency = account.currency;
  if (nota) {
    draft.note = nota;
    draft.merchant = nota;
  }
  if (fecha) draft.date = fecha;
  if (category) draft.categoryId = category.id;
  if (account) {
    draft.accountId = account.id;
    if (account.kind === "cash") draft.method = "efectivo";
    if (account.kind === "mp") draft.method = "mercadopago";
    if (account.currency === "USDT") draft.method = "crypto";
  }

  return {
    bookId,
    draft,
    save: guardar === "1" || fold(guardar) === "si" || fold(guardar) === "true",
    open: true,
  };
}

export function captureShortcutSearch() {
  if (typeof window === "undefined") return;
  const search = window.location.search;
  if (!search || search === "?") return;
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const keys = [
    "cargar", "nuevo", "add", "tipo", "type", "monto", "amount", "nota", "note",
    "cat", "categoria", "caja", "cuenta", "libro", "book", "moneda", "currency",
    "fecha", "date", "guardar", "save",
  ];
  if (!keys.some((k) => q.has(k))) return;
  try {
    sessionStorage.setItem(INTENT_KEY, search);
  } catch {
    /* ignore */
  }
  stripShortcutParams();
}

export function takeShortcutSearch(): string | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(INTENT_KEY);
    return raw;
  } catch {
    return null;
  }
}

export function stripShortcutParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const keys = [
    "cargar",
    "nuevo",
    "add",
    "tipo",
    "type",
    "monto",
    "amount",
    "nota",
    "note",
    "cat",
    "categoria",
    "caja",
    "cuenta",
    "libro",
    "book",
    "moneda",
    "currency",
    "fecha",
    "date",
    "guardar",
    "save",
  ];
  let hit = false;
  for (const k of keys) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k);
      hit = true;
    }
  }
  if (hit) window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}
