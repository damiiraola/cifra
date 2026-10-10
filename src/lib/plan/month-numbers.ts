/**
 * The month's numbers, one source for every screen (UX audit 2026-10-10, P2).
 *
 * Cifra shows two different things on purpose, and every text says which one:
 *
 * - "Este mes": what came in this month minus what you already spent
 *   (Presupuestos, the assistant's resumen del mes). Real money, this month.
 * - "Un mes normal": the projection (projectCashflow → monthPlan): a typical
 *   coming month. "Antes de tus metas" is what is left after fijos, tarjetas
 *   and the usual day to day; "con tus metas" also takes what the goals ask.
 *   Metas, the plan del mes (screen and assistant) and the simulator use it.
 *
 * Before, the same user read "Te quedan $ 78.975", "No cierra: faltan
 * $ 559.620" and "Te sobran $ 17.880" with no hint that they measure
 * different things.
 */
import { moneyARS } from "../format.ts";
import { monthlySurplus, type Cashflow } from "./cashflow.ts";
import { monthPlan } from "./month-plan.ts";
import type { GoalLine } from "./goal-plan.ts";

/** Income of this month: the income fijos, or what was written down if it's more. */
export function thisMonthIncome(incomeFijos: number, earned: number): number {
  return Math.max(Math.round(incomeFijos), Math.round(earned));
}

export type MonthNumbers = {
  /** Este mes: income − spent (never < 0). */
  thisMonthLeft: number;
  /** Este mes: spent over income (0 if not). */
  thisMonthOver: number;
  /** Un mes normal, antes de metas (can be < 0). */
  beforeGoals: number;
  /** What the goals with a date ask per month. */
  goalsTotal: number;
  /** Un mes normal, con metas = beforeGoals − goalsTotal. */
  afterGoals: number;
};

export function monthNumbers(input: {
  incomeFijos: number;
  earned: number;
  spent: number;
  flow: Cashflow;
  lines: GoalLine[];
}): MonthNumbers {
  const income = thisMonthIncome(input.incomeFijos, input.earned);
  const spent = Math.round(input.spent);
  const plan = monthPlan(input.flow, input.lines);
  return {
    thisMonthLeft: Math.max(0, income - spent),
    thisMonthOver: Math.max(0, spent - income),
    beforeGoals: plan.gap + plan.goalsTotal,
    goalsTotal: plan.goalsTotal,
    afterGoals: plan.gap,
  };
}

/** The same surplus the simulator and goal plan use (clamped at 0). */
export const surplusForGoals = monthlySurplus;

/** Texts: every number says what it measures. */
export const say = {
  thisMonth: (left: number) => `Te quedan este mes ${moneyARS(left)}`,
  thisMonthOver: (over: number) => `Este mes te pasás ${moneyARS(over)}`,
  beforeGoals: (v: number) =>
    v > 0
      ? `Un mes normal, antes de tus metas, te sobran ${moneyARS(v)}`
      : v < 0
        ? `Un mes normal, antes de tus metas, faltan ${moneyARS(-v)}`
        : "Un mes normal, antes de tus metas, no sobra nada",
  afterGoals: (gap: number, goalsTotal: number) =>
    goalsTotal > 0
      ? gap >= 0
        ? `Con tus metas sobran ${moneyARS(gap)} por mes`
        : `Para tus metas faltan ${moneyARS(-gap)} por mes`
      : gap > 0
        ? `Un mes normal cierra: sobran ${moneyARS(gap)}`
        : gap === 0
          ? "Un mes normal cierra justo"
          : `Un mes normal no cierra: faltan ${moneyARS(-gap)}`,
  /** One line that ties the two "mes normal" numbers together. */
  bridge: (before: number, goalsTotal: number) =>
    goalsTotal > 0
      ? `Antes de tus metas ${before >= 0 ? `te sobran ${moneyARS(before)}` : `faltan ${moneyARS(-before)}`}; tus metas piden ${moneyARS(goalsTotal)} por mes.`
      : "",
};
