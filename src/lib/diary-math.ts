import type { Transaction } from "./types";

export const FIXED_CATEGORY_IDS = new Set([
  "vivienda",
  "servicios",
  "suscripciones",
  "impuestos",
]);

export function isFixedExpense(tx: Pick<Transaction, "type" | "categoryId" | "recurringId">) {
  if (tx.type !== "expense") return false;
  return Boolean(tx.recurringId) || FIXED_CATEGORY_IDS.has(tx.categoryId);
}

export function pickDiaryDay(
  ym: string,
  byDay: { date: string; spent: number; count: number }[],
  today: string,
) {
  if (today.startsWith(ym)) return today;
  for (let i = byDay.length - 1; i >= 0; i--) {
    const d = byDay[i]!;
    if (d.spent > 0 || d.count > 0) return d.date;
  }
  return byDay.at(-1)?.date ?? `${ym}-01`;
}

export function heatmapMax(byDay: { spent: number }[]) {
  return Math.max(1, ...byDay.map((d) => d.spent));
}

export function heatmapIntensity(spent: number, max: number) {
  if (spent <= 0 || max <= 0) return 0;
  return 0.22 + (spent / max) * 0.7;
}
/** Days with movimientos needed before the Diario compares a day against the average. */
export const MIN_DAYS_FOR_AVERAGE = 7;

/**
 * Whether there is enough history for «vs promedio» to mean something: at least
 * MIN_DAYS_FOR_AVERAGE distinct days (up to `today`) with any movimiento.
 */
export function hasAverageHistory(txs: Pick<Transaction, "date">[], today: string, min = MIN_DAYS_FOR_AVERAGE) {
  const days = new Set<string>();
  for (const t of txs) {
    if (t.date <= today) days.add(t.date);
    if (days.size >= min) return true;
  }
  return false;
}
