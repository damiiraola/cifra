import { useEffect, useRef } from "react";
import { computeMonth } from "@/lib/analytics";
import { unsetBudgetPatch } from "@/lib/budget-math";
import { DEFAULT_BUDGETS } from "@/lib/categories";
import { useBookTxs, useLedger } from "@/lib/store";
import { monthISO } from "@/lib/utils";

export function BudgetSeeder() {
  const status = useLedger((s) => s.status);
  const usdRate = useLedger((s) => s.usdRate);
  const usdtRate = useLedger((s) => s.usdtRate);
  const budgets = useLedger((s) => s.budgets);
  const replaceBudgets = useLedger((s) => s.replaceBudgets);
  const txs = useBookTxs();
  const busy = useRef(false);

  useEffect(() => {
    if (status !== "ready" || busy.current) return;
    const stats = computeMonth(txs, monthISO(), { usd: usdRate, usdt: usdtRate });
    const patch = unsetBudgetPatch(stats.byCat, budgets, DEFAULT_BUDGETS);
    if (!patch) return;
    busy.current = true;
    replaceBudgets(patch);
    busy.current = false;
  }, [status, txs, usdRate, usdtRate, budgets, replaceBudgets]);

  return null;
}