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