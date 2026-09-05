import { createFileRoute } from "@tanstack/react-router";
import { categoryRows, computeMonth } from "@/lib/analytics";
import { moneyARS } from "@/lib/format";
import { CatIcon } from "@/lib/icons";
import { PAY_METHODS } from "@/lib/types";
import { useLedger, useBookTxs } from "@/lib/store";
import { CatDonut, WeekdayBars } from "@/components/charts";
import { MonthSwitcher } from "@/components/month-switcher";
import { Progress } from "@/components/ui/progress";

const WD = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const Route = createFileRoute("/_app/analitica")({
  component: Analitica,
});

function Analitica() {
  const { viewMonth, setViewMonth, usdRate, usdtRate, budgets, globalBudget } = useLedger();
  const transactions = useBookTxs();
  const fx = { usd: usdRate, usdt: usdtRate };
  const stats = computeMonth(transactions, viewMonth, fx);
  const prev = computeMonth(transactions, prevYm(viewMonth), fx);
  const prevSlice = prev.byDay.slice(0, stats.elapsed);
  const prevMtdSpent = prevSlice.reduce((s, d) => s + d.spent, 0);
  const prevMtdEarned = prevSlice.reduce((s, d) => s + d.earned, 0);
  const cats = categoryRows(stats.byCat, budgets);
  const donut = cats
    .filter((c) => c.spent > 0)
    .map((c) => ({
      name: c.name,
      value: c.spent,
      color: cssColor(`--color-${c.token}`),
    }));
  const weekday = stats.weekdayAvg.map((v, i) => ({ name: WD[i]!, value: Math.round(v) }));
  // Monday-first for AR
  const weekdayMon = [...weekday.slice(1), weekday[0]!];

  const methods = PAY_METHODS.map((m) => ({
    ...m,
    amount: stats.byMethod[m.id] ?? 0,
  })).filter((m) => m.amount > 0);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Estadística</p>
          <h1 className="font-display text-4xl tracking-tight">Analítica</h1>
        </div>
        <MonthSwitcher value={viewMonth} onChange={setViewMonth} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Gasto" a={stats.spent} b={prevMtdSpent} />
        <Stat label="Ingresos" a={stats.earned} b={prevMtdEarned} invert />
        <Stat label="Neto" a={stats.earned - stats.spent} b={prevMtdEarned - prevMtdSpent} invert />
      </div>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
          <h2 className="text-sm font-medium">Por categoría</h2>
          <CatDonut data={donut} />
        </div>
        <div className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
          <h2 className="text-sm font-medium">Promedio por día de semana</h2>
          <WeekdayBars data={weekdayMon} />
        </div>
      </section>

      <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        <h2 className="mb-4 text-sm font-medium">Desglose y presupuesto</h2>
        <div className="grid gap-4">
          {cats.map((c) => {
            const pct = c.budget ? (c.spent / c.budget) * 100 : 0;
            return (
              <div key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <CatIcon name={c.icon} className="size-3.5 text-muted" />
                  {c.name}
                </div>
                <p className="text-sm tabular-nums text-muted">
                  {moneyARS(c.spent)}
                  {c.budget ? ` / ${moneyARS(c.budget)}` : ""}
                </p>
                <Progress
                  className="col-span-2"
                  value={c.budget ? pct : c.spent ? 8 : 0}
                  barClassName={pct > 100 ? "bg-expense" : pct > 85 ? "bg-warn" : undefined}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-subtle">
          Tope global {moneyARS(globalBudget)} · proyección de cierre {moneyARS(stats.projected)}
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
          <h2 className="mb-3 text-sm font-medium">Comercios</h2>
          <ul className="grid gap-2">
            {stats.topMerchants.map((m) => (
              <li key={m.name} className="flex items-center justify-between text-sm">
                <span className="truncate text-fg">{m.name}</span>
                <span className="tabular-nums text-muted">{moneyARS(m.amount)}</span>
              </li>
            ))}
            {stats.topMerchants.length === 0 ? (
              <li className="text-sm text-muted">Sin datos.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
          <h2 className="mb-3 text-sm font-medium">Medio de pago</h2>
          <ul className="grid gap-2">
            {methods.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span>{m.label}</span>
                <span className="tabular-nums text-muted">{moneyARS(m.amount)}</span>
              </li>
            ))}
            {methods.length === 0 ? <li className="text-sm text-muted">Sin datos.</li> : null}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  a,
  b,
  invert = false,
}: {
  label: string;
  a: number;
  b: number;
  invert?: boolean;
}) {
  const pct = b ? ((a - b) / Math.abs(b)) * 100 : 0;
  const good = invert ? pct >= 0 : pct <= 0;
  return (
    <div className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums tracking-tight">{moneyARS(a)}</p>
      <p className={`mt-1 text-xs tabular-nums ${good ? "text-income" : "text-expense"}`}>
        {pct === 0 ? "Igual al mes previo" : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}% vs mes previo`}
      </p>
    </div>
  );
}

function prevYm(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function cssColor(name: string) {
  if (typeof document === "undefined") return "#8c8c86";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#8c8c86";
}
