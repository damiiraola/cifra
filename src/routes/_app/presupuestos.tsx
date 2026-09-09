import { createFileRoute } from "@tanstack/react-router";
import { categoryRows, computeMonth } from "@/lib/analytics";
import { moneyARS, parseAmount } from "@/lib/format";
import { CatIcon } from "@/lib/icons";
import { useLedger, useBookTxs, useAllCategories } from "@/lib/store";
import { MonthSwitcher } from "@/components/month-switcher";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_app/presupuestos")({
  component: Presupuestos,
});

function Presupuestos() {
  const {
    viewMonth,
    setViewMonth,
    usdRate,
    usdtRate,
    budgets,
    setBudget,
    globalBudget,
    setGlobalBudget,
  } = useLedger();
  const transactions = useBookTxs();
  const allCats = useAllCategories();
  const stats = computeMonth(transactions, viewMonth, { usd: usdRate, usdt: usdtRate });
  const cats = categoryRows(stats.byCat, budgets, allCats);
  const used = globalBudget ? (stats.spent / globalBudget) * 100 : 0;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Límites</p>
          <h1 className="font-display text-4xl tracking-tight">Presupuestos</h1>
        </div>
        <MonthSwitcher value={viewMonth} onChange={setViewMonth} />
      </div>

      <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Tope global</p>
            <p className="font-display text-3xl tabular-nums">{moneyARS(globalBudget)}</p>
          </div>
          <div className="w-40">
            <Input
              inputMode="decimal"
              defaultValue={String(globalBudget)}
              onBlur={(e) => {
                const n = parseAmount(e.target.value);
                if (n && n > 0) setGlobalBudget(n);
              }}
            />
          </div>
        </div>
        <Progress className="mt-4" value={used} barClassName={used > 100 ? "bg-expense" : undefined} />
        <p className="mt-2 text-xs text-subtle">
          Consumido {moneyARS(stats.spent)} ({used.toFixed(0)}%)
        </p>
      </section>

      <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        <h2 className="mb-4 text-sm font-medium">Por categoría</h2>
        <div className="grid gap-5">
          {cats.map((c) => {
            const pct = c.budget ? (c.spent / c.budget) * 100 : 0;
            return (
              <div key={c.id} className="grid gap-2 sm:grid-cols-[1fr_8rem] sm:items-center">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm">
                      <CatIcon name={c.icon} className="size-3.5 text-muted" />
                      {c.name}
                    </span>
                    <span className="text-xs tabular-nums text-muted">
                      {moneyARS(c.spent)}
                      {c.budget ? ` / ${moneyARS(c.budget)}` : ""}
                    </span>
                  </div>
                  <Progress
                    className="mt-2"
                    value={c.budget ? pct : 0}
                    barClassName={pct > 100 ? "bg-expense" : pct > 85 ? "bg-warn" : undefined}
                  />
                </div>
                <Input
                  inputMode="decimal"
                  defaultValue={c.budget ? String(c.budget) : ""}
                  placeholder="Sin tope"
                  onBlur={(e) => {
                    const n = parseAmount(e.target.value);
                    setBudget(c.id, n && n > 0 ? n : 0);
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
