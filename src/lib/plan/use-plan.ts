import { useMemo } from "react";
import { computeMonth } from "@/lib/analytics";
import { isUserSetTope } from "@/lib/budget-math";
import { argentinaDay } from "@/lib/market-hours";
import {
  useAllCategories,
  useBookAccounts,
  useBookCards,
  useBookGoals,
  useBookStatements,
  useBookTxs,
  useLedger,
} from "@/lib/store";
import {
  cashOut,
  cashOutTxs,
  monthlySurplus,
  pendingFijos,
  projectCashflow,
  statementsDueIn,
  type PlanData,
} from "./cashflow";
import { goalPlan } from "./goal-plan";
import { planAlerts } from "./alerts";
import { committedByCategory, suggestBudgets } from "./budgets";
import { monthPlan, planLevers } from "./month-plan";
import { cardDebts, compareDebtPlans, suggestedDebtBudget } from "./debt";
import { simulate, type Scenario } from "./simulate";

/** Everything the planner needs, from the store, for the active book. */
export function usePlanData(): PlanData {
  const txs = useBookTxs();
  const accounts = useBookAccounts();
  const cards = useBookCards();
  const statements = useBookStatements();
  const recurrings = useLedger((s) => s.recurrings);
  const bookId = useLedger((s) => s.activeBookId);
  const usd = useLedger((s) => s.usdRate);
  const usdt = useLedger((s) => s.usdtRate);
  const today = argentinaDay();
  return useMemo(
    () => ({ today, bookId, txs, accounts, cards, statements, recurrings, rates: { usd, usdt } }),
    [today, bookId, txs, accounts, cards, statements, recurrings, usd, usdt],
  );
}

/** Next months, the monthly surplus and how the goals fit in it. */
export function usePlan(months = 6) {
  const data = usePlanData();
  const goals = useBookGoals();
  return useMemo(() => {
    const flow = projectCashflow(data, months);
    const surplus = monthlySurplus(flow);
    return { data, flow, surplus, goals: goalPlan(goals, surplus, data.today, data.rates) };
  }, [data, goals, months]);
}

export function usePlanAlerts() {
  const { data, goals } = usePlan(4);
  const budgets = useLedger((s) => s.budgets);
  const locks = useLedger((s) => s.budgetLocks);
  const globalBudget = useLedger((s) => s.globalBudget);
  const cats = useAllCategories();
  return useMemo(() => {
    const ym = data.today.slice(0, 7);
    const stats = computeMonth(data.txs, ym, data.rates);
    const budgetRows = cats
      .filter(
        (c) =>
          c.kind === "expense" && isUserSetTope(c.id, budgets[c.id] ?? 0, {}, Boolean(locks[c.id])),
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        spent: stats.byCat[c.id] ?? 0,
        budget: budgets[c.id] ?? 0,
      }));
    return planAlerts({
      ...data,
      budgetRows,
      globalBudget: Number(globalBudget) || 0,
      monthSpent: stats.spent,
      projected: stats.projected,
      goals,
    });
  }, [data, goals, budgets, locks, globalBudget, cats]);
}

/** "Sale de tus cajas" for a month; for the current one, also what is still to leave. */
export function useCashOut(ym: string) {
  const data = usePlanData();
  return useMemo(() => {
    const done = cashOut(data, ym);
    const txs = cashOutTxs(data, ym);
    if (ym !== data.today.slice(0, 7)) return { done, txs, pending: null };
    const cards = statementsDueIn(data, ym).reduce((s, b) => s + b.totalArs, 0);
    const fijos = pendingFijos(data, ym, "expense").reduce((s, f) => s + f.amount, 0);
    return { done, txs, pending: { cards: Math.round(cards), fijos: Math.round(fijos) } };
  }, [data, ym]);
}

/** Plan de un mes normal, topes sugeridos and the levers when it does not close. */
export function useMonthPlan() {
  const { data, flow, surplus, goals: lines } = usePlan(6);
  const goals = useBookGoals();
  const cats = useAllCategories();
  return useMemo(() => {
    const plan = monthPlan(flow, lines);
    const names = Object.fromEntries(cats.map((c) => [c.id, c.name]));
    const suggestion = suggestBudgets({
      usual: flow.history.byCategory,
      committed: committedByCategory(data, data.today.slice(0, 7)),
      cut: Math.max(0, -plan.gap),
      names,
    });
    const levers = planLevers({
      plan,
      lines,
      goals,
      surplus,
      suggestion,
      today: data.today,
      rates: data.rates,
    });
    return { plan, suggestion, levers, hasHistory: flow.history.months.length > 0 };
  }, [data, flow, surplus, lines, goals, cats]);
}

/** Card debts, a suggested monthly budget and avalancha vs bola de nieve vs mínimo. */
export function useDebtPlan(budget: number | null) {
  const { data, surplus } = usePlan(6);
  const debts = useMemo(
    () =>
      cardDebts({
        today: data.today,
        cards: data.cards,
        txs: data.txs,
        statements: data.statements,
        accounts: data.accounts,
        usdRate: data.rates.usd,
      }),
    [data],
  );
  return useMemo(() => {
    const suggested = suggestedDebtBudget(debts, data.today, surplus);
    const comparison = debts.length
      ? compareDebtPlans(debts, budget != null && budget > 0 ? budget : suggested, data.today)
      : null;
    return { debts, suggested, comparison, today: data.today, surplus };
  }, [debts, data.today, surplus, budget]);
}

/** "¿Y si…?": the plan with and without the scenario. Nothing is saved. */
export function useSimulation(scenario: Scenario | null) {
  const data = usePlanData();
  const goals = useBookGoals();
  return useMemo(() => (scenario ? simulate(data, goals, scenario, 6) : null), [data, goals, scenario]);
}
