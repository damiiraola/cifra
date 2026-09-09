import { createFileRoute, Link } from "@tanstack/react-router";
import { categoryRows, compareDelta, computeMonth } from "@/lib/analytics";
import { catColorVar } from "@/lib/categories";
import { moneyARS } from "@/lib/format";
import { CatIcon } from "@/lib/icons";
import { logStreak } from "@/lib/books";
import { isPosted } from "@/lib/recurring";
import { useAllCategories, useBookTxs, useLedger } from "@/lib/store";
import { todayISO } from "@/lib/utils";
import { DailyArea } from "@/components/charts";
import { HeroSpend, Kpi } from "@/components/kpi";
import { MonthSwitcher } from "@/components/month-switcher";
import { TxRow } from "@/components/tx-row";
import { Progress } from "@/components/ui/progress";
import { FxStrip } from "@/components/fx-strip";
import { WalletStrip } from "@/components/wallet-strip";

export const Route = createFileRoute("/_app/")({
  component: Home,
});

function Home() {
  const { viewMonth, setViewMonth, usdRate, usdtRate, budgets, globalBudget, openQuick, recurrings, activeBookId } =
    useLedger();
  const transactions = useBookTxs();
  const allCats = useAllCategories();
  const fx = { usd: usdRate, usdt: usdtRate };
  const stats = computeMonth(transactions, viewMonth, fx);
  const prev = computeMonth(transactions, shift(viewMonth), fx);
  const prevMtd = prev.byDay.slice(0, stats.elapsed).reduce((s, d) => s + d.spent, 0);
  const spentDelta = compareDelta(stats.spent, prevMtd);
  const today = todayISO();
  const todaySpend = stats.byDay.find((d) => d.date === today)?.spent ?? 0;
  const loggedToday = transactions.some((t) => t.date === today && t.type !== "transfer");
  const streak = logStreak(transactions, today);
  const recent = [...stats.txs]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const cats = categoryRows(stats.byCat, budgets, allCats).filter((c) => c.spent > 0).slice(0, 5);
  const budgetPct = globalBudget ? (stats.spent / globalBudget) * 100 : 0;
  const over = budgetPct > 100;
  const fijosPendientes = recurrings.filter(
    (r) => r.bookId === activeBookId && r.active && !isPosted(r, transactions, viewMonth),
  ).length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Este mes</p>
          <h1 className="font-display text-4xl tracking-tight">Resumen</h1>
        </div>
        <MonthSwitcher value={viewMonth} onChange={setViewMonth} />
      </div>

      {over ? (
        <p className="rounded-2xl bg-expense/15 px-4 py-3 text-sm text-expense">
          Te pasaste el presupuesto por {moneyARS(stats.spent - globalBudget)}.
        </p>
      ) : null}
      {!loggedToday && viewMonth === today.slice(0, 7) ? (
        <button
          type="button"
          onClick={() => openQuick()}
          className="rounded-2xl bg-elevated px-4 py-3 text-left text-sm text-fg"
        >
          ¿Cargaste el día? Tocá para anotar un movimiento.
        </button>
      ) : null}
      {fijosPendientes > 0 ? (
        <Link to="/fijos" className="rounded-2xl bg-elevated px-4 py-3 text-sm text-fg">
          Hay {fijosPendientes} fijo{fijosPendientes === 1 ? "" : "s"} sin anotar este mes.
        </Link>
      ) : null}

      <FxStrip />
      <WalletStrip />

      {transactions.length === 0 ? (
        <section className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
          <p className="font-display text-2xl tracking-tight">Libro nuevo</p>
          <p className="mt-1 text-sm text-muted">
            Todavía no hay movimientos en este libro. Cargá el primero.
          </p>
          <button
            type="button"
            className="mt-4 text-sm text-fg underline-offset-4 hover:underline"
            onClick={() => openQuick()}
          >
            Cargar un movimiento
          </button>
        </section>
      ) : null}

      <HeroSpend
        label="Gastado"
        amount={moneyARS(stats.spent)}
        hint={
          spentDelta.dir === "flat"
            ? `${stats.expenseCount} movimientos · promedio ${moneyARS(stats.avgDaily)} / día`
            : `${spentDelta.pct > 0 ? "+" : ""}${spentDelta.pct.toFixed(0)}% vs mismas fechas del mes anterior · promedio ${moneyARS(stats.avgDaily)} / día`
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Hoy"
          value={moneyARS(todaySpend, true)}
          hint={viewMonth === today.slice(0, 7) ? "Lo que va del día" : "Mes cerrado"}
        />
        <Kpi label="Ingresos" value={moneyARS(stats.earned, true)} tone="income" hint="En el mes" />
        <Kpi
          label="Racha"
          value={`${streak}d`}
          hint={streak >= 7 ? "Beta cumplida" : "Días seguidos cargando"}
        />
        <Kpi
          label="Proyección"
          value={moneyARS(stats.projected, true)}
          tone={globalBudget && stats.projected > globalBudget ? "warn" : "default"}
          hint="Si seguís este ritmo"
        />
      </div>

      <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Presupuesto del mes</h2>
          <Link to="/presupuestos" className="text-xs tabular-nums text-muted hover:text-fg">
            {moneyARS(stats.spent)} / {moneyARS(globalBudget)}
          </Link>
        </div>
        <Progress
          value={budgetPct}
          barClassName={over ? "bg-expense" : budgetPct > 80 ? "bg-warn" : "bg-accent"}
        />
        <p className="mt-2 text-xs text-subtle">
          {over
            ? `Te pasaste ${moneyARS(stats.spent - globalBudget)} del tope.`
            : `Quedan ${moneyARS(Math.max(0, globalBudget - stats.spent))}.`}
        </p>
      </section>

      <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        <h2 className="mb-2 text-sm font-medium">Gasto diario</h2>
        <DailyArea data={stats.byDay} />
      </section>

      <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Categorías</h2>
          <Link to="/analitica" className="text-xs text-muted hover:text-fg">
            Ver todo
          </Link>
        </div>
        <div className="grid gap-3">
          {cats.map((c) => {
            const pct = c.budget ? Math.min(100, (c.spent / c.budget) * 100) : 0;
            return (
              <div key={c.id}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-fg">
                    <span style={{ color: catColorVar(c.token) }}>
                      <CatIcon name={c.icon} className="size-3.5" />
                    </span>
                    {c.name}
                  </span>
                  <span className="tabular-nums text-muted">{moneyARS(c.spent)}</span>
                </div>
                <Progress
                  value={c.budget ? pct : 0}
                  barClassName={pct > 100 ? "bg-expense" : undefined}
                />
              </div>
            );
          })}
          {cats.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Todavía no hay gastos este mes.</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">Últimos movimientos</h2>
          <Link to="/movimientos" className="text-xs text-muted hover:text-fg">
            Ver todos
          </Link>
        </div>
        <div>
          {recent.map((tx) => (
            <TxRow key={tx.id} tx={tx} showDate onClick={() => openQuick(tx)} />
          ))}
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nada cargado todavía.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function shift(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
