/**
 * How the goals fit in what is left each month (§2.2). Pure, sin IA.
 * Builds on the goals Damián stores in `ledger_settings.goals` (lib/goals.ts).
 */
import type { Goal } from "../goals.ts";
import { daysUntil, roundGoal } from "../goals.ts";
import { addMonths, round0, type Rates } from "./cashflow.ts";

export type GoalLine = {
  goal: Goal;
  /** What is missing, ARS at today's rate. */
  leftArs: number;
  /** Months until the deadline (≥ 1), 0 without a deadline. */
  months: number;
  /** Per month to arrive on time, ARS (0 without a deadline). */
  neededArs: number;
  /** Per month this goal gets from the surplus, ARS. */
  assignedArs: number;
  /** Same two in the goal's currency. */
  needed: number;
  assigned: number;
  /** null without a deadline. */
  onTrack: boolean | null;
  /** YYYY-MM when it arrives with `assigned` per month; "" if never. */
  eta: string;
  /** Pesos for more than 6 months: suggest dollars. Cifra does not predict inflation. */
  usdHint: boolean;
};

function rateFor(goal: Goal, rates: Rates) {
  if (goal.currency === "ARS") return 1;
  return goal.currency === "USD" ? rates.usd : rates.usdt;
}

export function monthsUntil(today: string, deadline: string) {
  if (!deadline) return 0;
  return Math.max(1, Math.ceil(daysUntil(today, deadline) / 30.4375));
}

/** Share of what is left for goals without a date, by priority. */
const UNDATED_WEIGHT = { 1: 3, 2: 2, 3: 1 } as const;

/**
 * Splits the monthly surplus (ARS) between goals that are not done yet, by
 * priority (1 alta → 3 baja). Within a priority, goals with a date get what
 * they need; if it does not reach, each gets its share and a realistic date,
 * and lower priorities get nothing. What is left after every dated goal goes
 * to goals without a date, weighted 3/2/1 by priority.
 */
export function goalPlan(
  goals: Goal[],
  surplusArs: number,
  today: string,
  rates: Rates,
): GoalLine[] {
  const current = today.slice(0, 7);
  const open = goals
    .filter((g) => g.active && g.target > g.saved)
    .map((goal) => {
      const rate = rateFor(goal, rates);
      const left = Math.max(0, goal.target - goal.saved);
      const leftArs = rate > 0 ? round0(left * rate) : 0;
      const months = monthsUntil(today, goal.deadline);
      const neededArs = months > 0 ? round0(leftArs / months) : 0;
      return { goal, rate, leftArs, months, neededArs };
    });
  let remaining = Math.max(0, surplusArs);
  const share = new Map<string, number>();
  for (const tier of [1, 2, 3] as const) {
    const group = open.filter((g) => g.months > 0 && g.goal.priority === tier);
    if (!group.length) continue;
    const need = group.reduce((s, g) => s + g.neededArs, 0);
    if (remaining >= need) {
      for (const g of group) share.set(g.goal.id, g.neededArs);
      remaining -= need;
    } else {
      for (const g of group)
        share.set(g.goal.id, need > 0 ? round0((remaining * g.neededArs) / need) : 0);
      remaining = 0;
    }
  }
  const undated = open.filter((g) => g.months === 0);
  const weights = undated.reduce((s, g) => s + UNDATED_WEIGHT[g.goal.priority], 0);
  for (const g of undated) {
    share.set(
      g.goal.id,
      weights > 0 ? round0((remaining * UNDATED_WEIGHT[g.goal.priority]) / weights) : 0,
    );
  }
  return open
    .map((g) => {
      const assignedArs = share.get(g.goal.id) ?? 0;
      const toGo = assignedArs > 0 ? Math.ceil(g.leftArs / assignedArs - 1e-9) : 0;
      const onTrack = g.months > 0 ? assignedArs >= g.neededArs - 1 : null;
      const eta = onTrack ? g.goal.deadline.slice(0, 7) : toGo > 0 ? addMonths(current, toGo) : "";
      const conv = (ars: number) => (g.rate > 0 ? roundGoal(ars / g.rate, g.goal.currency) : 0);
      const horizon = g.months > 0 ? g.months : toGo;
      return {
        goal: g.goal,
        leftArs: g.leftArs,
        months: g.months,
        neededArs: g.neededArs,
        assignedArs,
        needed: conv(g.neededArs),
        assigned: conv(assignedArs),
        onTrack,
        eta,
        usdHint: g.goal.currency === "ARS" && horizon > 6,
      };
    })
    .sort(
      (a, b) =>
        a.goal.priority - b.goal.priority ||
        (a.goal.deadline || "9999").localeCompare(b.goal.deadline || "9999"),
    );
}
