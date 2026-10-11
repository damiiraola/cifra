/** Lista de movimientos (/movimientos): búsqueda, filtros y CSV. Pure. */
import type { Account, Card, Category, Currency, Transaction } from "./types.ts";

export type TxFilter = {
  q?: string;
  /** YYYY-MM, "" = all. */
  month?: string;
  category?: string;
  /** A caja (account id), "" = all. */
  account?: string;
  /** A card id: its ARS and USD cajas. */
  card?: string;
  currency?: Currency | "";
};

/** Lowercase, no accents: "Almacén" matches "almacen". */
export function fold(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function filterTxs(
  txs: Transaction[],
  f: TxFilter,
  ctx: { cards: Card[]; categories: Pick<Category, "id" | "name">[]; accounts: Pick<Account, "id" | "name">[] },
): Transaction[] {
  const card = f.card ? ctx.cards.find((c) => c.id === f.card) : undefined;
  const cardIds = card ? new Set([card.accountArsId, card.accountUsdId]) : null;
  const words = fold(f.q ?? "").split(/\s+/).filter(Boolean);
  const catName = new Map(ctx.categories.map((c) => [c.id, c.name]));
  const accName = new Map(ctx.accounts.map((a) => [a.id, a.name]));
  return txs
    .filter((t) => {
      if (f.month && !t.date.startsWith(f.month)) return false;
      if (f.category && t.categoryId !== f.category) return false;
      if (f.account && t.accountId !== f.account && t.counterpartyId !== f.account) return false;
      if (cardIds && !cardIds.has(t.accountId)) return false;
      if (f.currency && t.currency !== f.currency) return false;
      if (words.length) {
        const hay = fold(
          [t.merchant, t.note, catName.get(t.categoryId) ?? "", accName.get(t.accountId) ?? "", String(t.amount)].join(" "),
        );
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/**
 * Can it be deleted from the list? Same rule as the store (a day that passed
 * stays as it was loaded, ed2c835) and cuotas go with their purchase.
 */
export function canDelete(t: Pick<Transaction, "date" | "purchaseId">, today: string) {
  return t.date >= today && !t.purchaseId;
}

/** Months that have movements, newest first. */
export function txMonths(txs: Transaction[]) {
  return [...new Set(txs.map((t) => t.date.slice(0, 7)))].sort().reverse();
}

/** Totals by currency of what is shown: gastos and ingresos (transfers apart). */
export function txTotals(txs: Transaction[]) {
  const out: Partial<Record<Currency, { out: number; in: number }>> = {};
  for (const t of txs) {
    if (t.type === "transfer") continue;
    const r = (out[t.currency] ??= { out: 0, in: 0 });
    if (t.type === "income") r.in += t.amount;
    else r.out += t.amount;
  }
  return out;
}

const TYPE = { expense: "gasto", income: "ingreso", transfer: "cambio" } as Record<string, string>;

/** CSV with readable names (category, caja), opens fine in Sheets and Excel. */
export function txCsv(
  txs: Transaction[],
  categories: Pick<Category, "id" | "name">[],
  accounts: Pick<Account, "id" | "name">[],
) {
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const header = ["fecha", "tipo", "monto", "moneda", "categoria", "caja", "comercio", "nota", "medio", "cuota"];
  const lines = txs.map((t) =>
    [
      t.date,
      TYPE[t.type] ?? t.type,
      t.amount,
      t.currency,
      cat.get(t.categoryId) ?? t.categoryId,
      acc.get(t.accountId) ?? "",
      t.merchant,
      t.note,
      t.method,
      t.installmentCount ? `${t.installmentNo}/${t.installmentCount}` : "",
    ]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(","),
  );
  return "\ufeff" + [header.join(","), ...lines].join("\n");
}

export function downloadCsv(csv: string, name = "cifra-movimientos.csv") {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
