import type { Category } from "./types";

export function isUserSetTope(
  id: string,
  stored: number,
  _seedDefaults: Record<string, number> = {},
  locked = false,
) {
  if (!locked) return false;
  return (Number(stored) || 0) > 0 && Boolean(id);
}

export function effectiveCategoryBudget(
  id: string,
  stored: number,
  spent: number,
  seedDefaults: Record<string, number> = {},
  locked = false,
  planned = 0,
) {
  if (isUserSetTope(id, stored, seedDefaults, locked)) return Number(stored) || 0;
  if (planned > 0) return Math.round(planned);
  if (spent > 0) return Math.round(spent);
  return 0;
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
  locks: Record<string, boolean> = {},
  planned: Record<string, number> = {},
): LiveCategoryRow[] {
  return cats
    .filter((c) => c.kind === "expense")
    .map((c) => {
      const spent = byCat[c.id] ?? 0;
      const stored = budgets[c.id] ?? 0;
      return {
        ...c,
        spent,
        budget: effectiveCategoryBudget(c.id, stored, spent, seedDefaults, Boolean(locks[c.id]), planned[c.id] ?? 0),
      };
    })
    .sort((a, b) => b.spent - a.spent || b.budget - a.budget || a.name.localeCompare(b.name, "es"));
}

export function budgetAllocation(rows: { spent: number; budget: number }[], globalBudget: number) {
  const live = rows.filter((r) => r.spent > 0 || r.budget > 0);
  const assigned = live.reduce((s, r) => s + (r.budget > 0 ? r.budget : 0), 0);
  const unassigned = Math.max(0, globalBudget - assigned);
  const overAssigned = Math.max(0, assigned - globalBudget);
  return { assigned, unassigned, overAssigned };
}

export function fijoTopes(
  rows: { bookId: string; type: string; active: boolean; categoryId: string; amount: number; currency: string }[],
  bookId: string,
  rates: { usd: number; usdt: number },
  type: "expense" | "income" = "expense",
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.active || r.type !== type || r.bookId !== bookId || !(r.amount > 0) || !r.categoryId) continue;
    const ars =
      r.currency === "ARS"
        ? r.amount
        : r.currency === "USD"
          ? r.amount * (rates.usd > 0 ? rates.usd : 0)
          : r.currency === "USDT"
            ? r.amount * (rates.usdt > 0 ? rates.usdt : 0)
            : 0;
    if (!(ars > 0)) continue;
    out[r.categoryId] = (out[r.categoryId] ?? 0) + ars;
  }
  for (const id of Object.keys(out)) out[id] = Math.round(out[id]!);
  return out;
}

function recurringToArs(amount: number, currency: string, rates: { usd: number; usdt: number }) {
  if (!(amount > 0)) return 0;
  if (currency === "ARS") return amount;
  if (currency === "USD") return rates.usd > 0 ? amount * rates.usd : 0;
  if (currency === "USDT") return rates.usdt > 0 ? amount * rates.usdt : 0;
  return 0;
}

export function recurringLines(
  rows: { id: string; name: string; bookId: string; type: string; active: boolean; categoryId: string; amount: number; currency: string }[],
  bookId: string,
  rates: { usd: number; usdt: number },
  type: "expense" | "income",
) {
  return rows
    .filter((r) => r.active && r.type === type && r.bookId === bookId && r.amount > 0 && r.categoryId)
    .map((r) => ({ id: r.id, name: r.name, amount: Math.round(recurringToArs(r.amount, r.currency, rates)) }))
    .filter((r) => r.amount > 0);
}

export function recurringArs(
  rows: { id: string; name: string; bookId: string; type: string; active: boolean; categoryId: string; amount: number; currency: string }[],
  bookId: string,
  rates: { usd: number; usdt: number },
  type: "expense" | "income",
): number {
  return recurringLines(rows, bookId, rates, type).reduce((s, r) => s + r.amount, 0);
}

export type PlanSuggestion = { id: string; name: string; amount: number; spent: number; avg: number };

export type PlanCategory = { id: string; name: string; spent: number; avg: number };

/** Average spend per category over the previous months that had any expense at all. */
export function previousMonthsAverage(months: Record<string, number>[]): Record<string, number> {
  const active = months.filter((m) => Object.values(m).some((v) => v > 0));
  if (!active.length) return {};
  const sum: Record<string, number> = {};
  for (const m of active) {
    for (const [id, v] of Object.entries(m)) {
      if (v > 0) sum[id] = (sum[id] ?? 0) + v;
    }
  }
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(sum)) out[id] = Math.round(v / active.length);
  return out;
}

/**
 * "Te quedan" = what came in this month minus what was already spent.
 * Pending fijos (not written down yet) are reserved first; the rest is split
 * among categories with real spending, weighted by this month's spend plus the
 * average of previous months. Categories with no spending get nothing.
 */
export function buildMonthPlan(input: {
  income: number;
  spent: number;
  pendingFijos: number;
  daysLeft: number;
  categories: PlanCategory[];
  margin?: number;
}) {
  const income = Math.max(0, Math.round(input.income));
  const spent = Math.max(0, Math.round(input.spent));
  const reserved = Math.max(0, Math.round(input.pendingFijos));
  const over = Math.max(0, spent - income);
  const left = Math.max(0, income - spent);
  const free = Math.max(0, left - reserved);
  const perDay = input.daysLeft > 0 ? Math.round(free / input.daysLeft) : 0;
  const share = income > 0 ? (spent + reserved) / income : 0;
  const tone: "over" | "tight" | "ok" = over > 0 || (income > 0 && reserved > left) ? "over" : share >= 0.65 ? "tight" : "ok";
  const open = input.categories
    .map((c) => ({ ...c, weight: Math.max(0, c.spent) + Math.max(0, c.avg) }))
    .filter((c) => c.weight > 0);
  const weight = open.reduce((s, c) => s + c.weight, 0);
  const pool = Math.round(free * (1 - (input.margin ?? 0.1)));
  const suggestions: PlanSuggestion[] =
    pool > 0 && weight > 0
      ? open
          .map((c) => ({
            id: c.id,
            name: c.name,
            spent: Math.round(c.spent),
            avg: Math.round(c.avg),
            amount: Math.floor((pool * c.weight) / weight / 1000) * 1000,
          }))
          .filter((s) => s.amount > 0)
          .sort((a, b) => b.amount - a.amount)
      : [];
  const cushion = Math.max(0, free - suggestions.reduce((s, x) => s + x.amount, 0));
  return { income, spent, over, left, reserved, free, perDay, share, tone, suggestions, cushion };
}

export function budgetsFromSpend(byCat: Record<string, number>): Record<string, number> {
  const patch: Record<string, number> = {};
  for (const [id, spent] of Object.entries(byCat)) {
    if (spent > 0) patch[id] = Math.round(spent);
  }
  return patch;
}

export function unsetBudgetPatch(
  byCat: Record<string, number>,
  budgets: Record<string, number>,
  seedDefaults: Record<string, number> = {},
  locks: Record<string, boolean> = {},
  planned: Record<string, number> = {},
): Record<string, number> | null {
  const patch: Record<string, number> = {};
  const ids = new Set([...Object.keys(byCat), ...Object.keys(planned)]);
  for (const id of ids) {
    const spent = byCat[id] ?? 0;
    const plan = planned[id] ?? 0;
    if (!(spent > 0) && !(plan > 0)) continue;
    if (isUserSetTope(id, budgets[id] ?? 0, seedDefaults, Boolean(locks[id]))) continue;
    const next = plan > 0 ? Math.round(plan) : Math.round(spent);
    if ((budgets[id] ?? 0) === next) continue;
    patch[id] = next;
  }
  return Object.keys(patch).length ? patch : null;
}

export function hydrateBookMoney(input: {
  books: { id: string; kind: string }[];
  legacyBudgets: Record<string, number>;
  legacyGlobal: number;
  bookBudgets: Record<string, Record<string, number>>;
  bookGlobals: Record<string, number>;
}) {
  const personal = input.books.find((b) => b.kind === "personal")?.id;
  const bookBudgets = { ...input.bookBudgets };
  const bookGlobals = { ...input.bookGlobals };
  if (personal && !bookBudgets[personal]) {
    bookBudgets[personal] = { ...input.legacyBudgets };
  }
  if (personal && bookGlobals[personal] == null) {
    bookGlobals[personal] = input.legacyGlobal;
  }
  return { bookBudgets, bookGlobals };
}

export function moneyForBook(
  bookId: string,
  bookBudgets: Record<string, Record<string, number>>,
  bookGlobals: Record<string, number>,
) {
  return {
    budgets: bookBudgets[bookId] ?? {},
    globalBudget: bookGlobals[bookId] ?? 0,
  };
}

export function parseBookBudgets(raw: unknown): Record<string, Record<string, number>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [bookId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!bookId || !val || typeof val !== "object" || Array.isArray(val)) continue;
    const inner: Record<string, number> = {};
    for (const [k, n] of Object.entries(val as Record<string, unknown>)) {
      const num = Number(n);
      if (k && Number.isFinite(num) && num >= 0) inner[k] = num;
    }
    out[bookId] = inner;
  }
  return out;
}

export function parseBookLocks(raw: unknown): Record<string, Record<string, boolean>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, boolean>> = {};
  for (const [bookId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!bookId || !val || typeof val !== "object" || Array.isArray(val)) continue;
    const inner: Record<string, boolean> = {};
    for (const [k, n] of Object.entries(val as Record<string, unknown>)) {
      if (k && n === true) inner[k] = true;
    }
    out[bookId] = inner;
  }
  return out;
}

export function locksForBook(bookId: string, bookLocks: Record<string, Record<string, boolean>>) {
  return bookLocks[bookId] ?? {};
}

export function parseBookGlobals(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [bookId, val] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(val);
    if (bookId && Number.isFinite(n) && n >= 0) out[bookId] = n;
  }
  return out;
}
