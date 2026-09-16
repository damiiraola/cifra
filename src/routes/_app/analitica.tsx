import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { computeMonth, isFixedExpense, prevMonth, splitFixedVariable } from "@/lib/analytics";
import { budgetAllocation, liveCategoryRows } from "@/lib/budget-math";
import { catColorVar, DEFAULT_BUDGETS } from "@/lib/categories";
import { moneyARS, monthLabel } from "@/lib/format";
import { CatIcon } from "@/lib/icons";
import { useAllCategories, useBookTxs, useLedger } from "@/lib/store";
import { RhythmChart } from "@/components/charts";
import { DrillSheet } from "@/components/drill-sheet";
import { MonthSwitcher } from "@/components/month-switcher";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

export const Route = createFileRoute("/_app/analitica")({
  component: Analitica,
});

type Drill = { title: string; txs: Transaction[] } | null;

function Analitica() {
  const { viewMonth, setViewMonth, usdRate, usdtRate, budgets, globalBudget } = useLedger();
  const transactions = useBookTxs();
  const allCats = useAllCategories();
  const fx = { usd: usdRate, usdt: usdtRate };
  const stats = computeMonth(transactions, viewMonth, fx);
  const prev = computeMonth(transactions, prevMonth(viewMonth), fx);
  const prevSlice = prev.byDay.slice(0, stats.elapsed);
  const prevMtdSpent = prevSlice.reduce((s, d) => s + d.spent, 0);
  const split = splitFixedVariable(stats.txs, fx);
  const rows = liveCategoryRows(stats.byCat, budgets, allCats, DEFAULT_BUDGETS);
  const cats = rows.filter((c) => c.spent > 0);
  const { assigned, unassigned, overAssigned } = budgetAllocation(rows, globalBudget);
  const spentDelta = prevMtdSpent ? ((stats.spent - prevMtdSpent) / prevMtdSpent) * 100 : 0;
  const [drill, setDrill] = useState<Drill>(null);

  const over = globalBudget > 0 && stats.spent > globalBudget;
  const remain = globalBudget - stats.spent;
  const fixedPct = stats.spent ? Math.round((split.fixed / stats.spent) * 100) : 0;

  const merchantRows = stats.topMerchants;

  function openCat(id: string, name: string) {
    setDrill({
      title: name,
      txs: stats.txs
        .filter((t) => t.categoryId === id && t.type === "expense")
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    });
  }

  function openMerchant(name: string) {
    setDrill({
      title: name,
      txs: stats.txs
        .filter((t) => t.type === "expense" && (t.merchant.trim() || t.note.trim() || "Sin detalle") === name)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    });
  }

  const splitHint = useMemo(() => {
    if (!stats.spent) return "Sin gastos este mes.";
    return `${fixedPct}% fijo · ${100 - fixedPct}% variable`;
  }, [stats.spent, fixedPct]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">El mes</p>
          <h1 className="font-display text-4xl tracking-tight capitalize">{monthLabel(viewMonth, "LLLL")}</h1>
        </div>
        <MonthSwitcher value={viewMonth} onChange={setViewMonth} />
      </div>

      <section>
        <p className="font-display text-5xl tabular-nums tracking-tight sm:text-6xl">{moneyARS(stats.spent)}</p>
        <p className="mt-2 text-sm text-muted">
          {spentDelta === 0
            ? "Igual al mes previo"
            : `${spentDelta > 0 ? "+" : ""}${spentDelta.toFixed(0)}% vs ${monthLabel(prevMonth(viewMonth), "LLL")}`}
          {" · "}
          ingresos {moneyARS(stats.earned)}
          {" · "}
          neto {moneyARS(stats.net)}
        </p>
        {globalBudget ? (
          <p className={cn("mt-1 text-sm", over ? "text-expense" : "text-subtle")}>
            {over
              ? `Te pasaste ${moneyARS(stats.spent - globalBudget)} del tope.`
              : `Quedan ${moneyARS(remain)}. Proyección ${moneyARS(stats.projected)}.`}
            {" · "}
            {overAssigned
              ? `categorías ${moneyARS(assigned)} (de más ${moneyARS(overAssigned)})`
              : `categorías ${moneyARS(assigned)} · sin repartir ${moneyARS(unassigned)}`}
          </p>
        ) : null}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Fijo vs variable</h2>
          <p className="text-xs text-subtle">{splitHint}</p>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-elevated">
          {stats.spent ? (
            <>
              <span className="bg-accent" style={{ width: `${fixedPct}%` }} />
              <span className="bg-border-strong" style={{ width: `${100 - fixedPct}%` }} />
            </>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="rounded-2xl bg-elevated px-3 py-3 text-left"
            onClick={() =>
              setDrill({
                title: "Fijos",
                txs: stats.txs.filter((t) => isFixedExpense(t)),
              })
            }
          >
            <p className="text-[11px] uppercase text-muted">Fijo</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{moneyARS(split.fixed)}</p>
          </button>
          <button
            type="button"
            className="rounded-2xl bg-elevated px-3 py-3 text-left"
            onClick={() =>
              setDrill({
                title: "Variable",
                txs: stats.txs.filter((t) => t.type === "expense" && !isFixedExpense(t)),
              })
            }
          >
            <p className="text-[11px] uppercase text-muted">Variable</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{moneyARS(split.variable)}</p>
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Categorías</h2>
          <Link to="/presupuestos" className="text-xs text-muted hover:text-fg">
            Editar tope
          </Link>
        </div>
        <div className="grid gap-2">
          {cats.map((c) => {
            const hasTope = c.budget > 0;
            const pct = hasTope ? (c.spent / c.budget) * 100 : 0;
            const overCat = hasTope && c.spent > c.budget;
            const width = hasTope ? Math.min(100, pct) : 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => openCat(c.id, c.name)}
                className="grid gap-1 rounded-xl px-1 py-1.5 text-left hover:bg-elevated"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span style={{ color: catColorVar(c.token) }}>
                      <CatIcon name={c.icon} className="size-3.5" />
                    </span>
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className={cn("tabular-nums", overCat ? "text-expense" : "text-muted")}>
                    {moneyARS(c.spent)}
                    {hasTope ? ` / ${moneyARS(c.budget)}` : " · sin tope"}
                  </span>
                </div>
                <span className="h-1.5 overflow-hidden rounded-full bg-elevated">
                  <span
                    className={cn("block h-full rounded-full", overCat && "bg-expense")}
                    style={{
                      width: `${hasTope ? width : 8}%`,
                      background: overCat ? undefined : catColorVar(c.token),
                    }}
                  />
                </span>
              </button>
            );
          })}
          {cats.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Todavía no hay gastos este mes.</p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Ritmo vs tope</h2>
        <RhythmChart byDay={stats.byDay} budget={globalBudget} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium">Comercios</h2>
        <ul className="grid gap-1">
          {merchantRows.map((m) => (
            <li key={m.name}>
              <button
                type="button"
                onClick={() => openMerchant(m.name)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left text-sm hover:bg-elevated"
              >
                <span className="truncate text-fg">{m.name}</span>
                <span className="tabular-nums text-muted">{moneyARS(m.amount)}</span>
              </button>
            </li>
          ))}
          {merchantRows.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted">Sin comercios todavía.</li>
          ) : null}
        </ul>
      </section>

      <DrillSheet
        title={drill?.title ?? ""}
        txs={drill?.txs ?? []}
        open={Boolean(drill)}
        onOpenChange={(open) => {
          if (!open) setDrill(null);
        }}
      />
    </div>
  );
}