import type { Category } from "./types";

export function effectiveCategoryBudget(
  id: string,
  stored: number,
  spent: number,
  seedDefaults: Record<string, number> = {},
) {
  const n = Number(stored) || 0;
  if (spent > 0) return n > 0 ? n : 0;
  if (id.startsWith("c_")) return n > 0 ? n : 0;
  if (n > 0 && n === seedDefaults[id]) return 0;
  return n > 0 ? n : 0;
}

export type LiveCategoryRow = Category & {
  spent: number;
  budget: number;
};

export function liveCategoryRows(
  byCat: Record<string, number>,
  budgets: Record<string, number>,
  cats: Category[],
  seedDefaults: Record<string, number> = {},
): LiveCategoryRow[] {
  return cats
    .filter((c) => c.kind === "expense")
    .map((c) => {
      const spent = byCat[c.id] ?? 0;
      const stored = budgets[c.id] ?? 0;
      return {
        ...c,
        spent,
        budget: effectiveCategoryBudget(c.id, stored, spent, seedDefaults),
      };
    })
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name, "es"));
}

export function budgetAllocation(rows: { spent: number; budget: number }[], globalBudget: number) {
  const live = rows.filter((r) => r.spent > 0 || r.budget > 0);
  const assigned = live.reduce((s, r) => s + (r.budget > 0 ? r.budget : 0), 0);
  const unassigned = Math.max(0, globalBudget - assigned);
  const overAssigned = Math.max(0, assigned - globalBudget);
  return { assigned, unassigned, overAssigned };
}

export function budgetsFromSpend(byCat: Record<string, number>): Record<string, number> {
  const patch: Record<string, number> = {};
  for (const [id, spent] of Object.entries(byCat)) {
    if (spent > 0) patch[id] = Math.round(spent);
  }
  return patch;
}