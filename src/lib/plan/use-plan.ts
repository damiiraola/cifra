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
