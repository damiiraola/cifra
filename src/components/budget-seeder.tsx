import { useEffect, useRef } from "react";
import { computeMonth } from "@/lib/analytics";
import { fijoTopes, unsetBudgetPatch } from "@/lib/budget-math";
import { DEFAULT_BUDGETS } from "@/lib/categories";
import { useBookTxs, useLedger } from "@/lib/store";

export function BudgetSeeder() {
  const status = useLedger((s) => s.status);
  const usdRate = useLedger((s) => s.usdRate);
  const usdtRate = useLedger((s) => s.usdtRate);
  const budgets = useLedger((s) => s.budgets);
  const locks = useLedger((s) => s.budgetLocks);
  const viewMonth = useLedger((s) => s.viewMonth);
  const recurrings = useLedger((s) => s.recurrings);
  const bookId = useLedger((s) => s.activeBookId);
  const replaceBudgets = useLedger((s) => s.replaceBudgets);
  const txs = useBookTxs();
  const busy = useRef(false);

  useEffect(() => {
    if (status !== "ready" || busy.current) return;
    const stats = computeMonth(txs, viewMonth, { usd: usdRate, usdt: usdtRate });
    const planned = fijoTopes(recurrings, bookId, { usd: usdRate, usdt: usdtRate });
    const patch = unsetBudgetPatch(stats.byCat, budgets, DEFAULT_BUDGETS, locks, planned);
    if (!patch) return;
    busy.current = true;
    replaceBudgets(patch);
    busy.current = false;
  }, [status, txs, usdRate, usdtRate, budgets, locks, viewMonth, recurrings, bookId, replaceBudgets]);

  return null;
}