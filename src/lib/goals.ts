import type { Currency } from "./types";

export type GoalKind = "ahorro" | "viaje" | "bien" | "inversion";

/** 1 alta, 2 media, 3 baja. The surplus goes to higher ones first. */
export type GoalPriority = 1 | 2 | 3;

export const GOAL_PRIORITIES: { id: GoalPriority; label: string }[] = [
  { id: 1, label: "Alta" },
  { id: 2, label: "Media" },
  { id: 3, label: "Baja" },
];

export function parsePriority(raw: unknown): GoalPriority {
  const n = Number(raw);
  return n === 1 || n === 3 ? n : 2;
}

export type Goal = {
  id: string;
  bookId: string;
  kind: GoalKind;
  name: string;
  currency: Currency;
  target: number;
  saved: number;
  /** YYYY-MM-DD, or empty when there is no date. */
  deadline: string;
  priority: GoalPriority;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const KINDS = new Set<GoalKind>(["ahorro", "viaje", "bien", "inversion"]);
const CURRENCIES = new Set<Currency>(["ARS", "USD", "USDT"]);

export const GOAL_KINDS: { id: GoalKind; label: string; hint: string }[] = [
  { id: "ahorro", label: "Ahorrar", hint: "Lo que sobra del mes" },
  { id: "viaje", label: "Viaje", hint: "Una fecha y un monto" },
  { id: "bien", label: "Comprar", hint: "Un auto, una casa, un bien" },
  { id: "inversion", label: "Invertir", hint: "Dejar quieto, no operar" },
];

export function roundGoal(amount: number, currency: Currency) {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  if (currency === "ARS") return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

export function toGoalCurrency(ars: number, currency: Currency, rates: { usd: number; usdt: number }) {
  if (!(ars > 0)) return 0;
  if (currency === "ARS") return Math.round(ars);
  const rate = currency === "USD" ? rates.usd : rates.usdt;
  if (!(rate > 0)) return 0;
  return Math.round((ars / rate) * 100) / 100;
}

export function daysUntil(today: string, deadline: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline < today) return 0;
  const a = Date.parse(`${today}T12:00:00`);
  const b = Date.parse(`${deadline}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function goalPace(goal: Goal, today: string) {
  const left = roundGoal(Math.max(0, goal.target - goal.saved), goal.currency);
  const days = daysUntil(today, goal.deadline);
  const perDay = days > 0 ? roundGoal(left / days, goal.currency) : 0;
  const pct = goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 0;
  return { left, days, perDay, pct };
}

export function parseGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  const out: Goal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const g = item as Partial<Goal>;
    if (!g.id || !KINDS.has(g.kind as GoalKind) || !CURRENCIES.has(g.currency as Currency)) continue;
    const currency = g.currency as Currency;
    out.push({
      id: String(g.id).slice(0, 40),
      bookId: String(g.bookId ?? ""),
      kind: g.kind as GoalKind,
      name: String(g.name ?? "Meta").trim().slice(0, 40) || "Meta",
      currency,
      target: roundGoal(Number(g.target), currency),
      saved: roundGoal(Number(g.saved), currency),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(g.deadline ?? "")) ? String(g.deadline) : "",
      priority: parsePriority(g.priority),
      active: g.active !== false,
      createdAt: String(g.createdAt ?? ""),
      updatedAt: String(g.updatedAt ?? g.createdAt ?? ""),
    });
  }
  return out.slice(0, 30);
}

export function mergeGoals(local: Goal[], remote: Goal[]) {
  const map = new Map<string, Goal>();
  for (const g of remote) map.set(g.id, g);
  for (const g of local) {
    const prev = map.get(g.id);
    if (!prev || g.updatedAt >= prev.updatedAt) map.set(g.id, g);
  }
  return [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
}
