import { createFileRoute } from "@tanstack/react-router";
import { budgetAllocation, liveCategoryRows } from "@/lib/budget-math";
import { DEFAULT_BUDGETS } from "@/lib/categories";
import { computeMonth } from "@/lib/analytics";
import { moneyARS, parseAmount } from "@/lib/format";
import { CatIcon } from "@/lib/icons";
import { useAllCategories, useBookTxs, useLedger } from "@/lib/store";
import { MonthSwitcher } from "@/components/month-switcher";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  const rows = liveCategoryRows(stats.byCat, budgets, allCats, DEFAULT_BUDGETS);
  const live = rows.filter((c) => c.spent > 0);
  const idle = rows.filter((c) => c.spent <= 0);
  const { assigned, unassigned, overAssigned } = budgetAllocation(rows, globalBudget);
  const used = globalBudget ? (stats.spent / globalBudget) * 100 : 0;
  const assignedPct = globalBudget ? Math.min(100, (assigned / globalBudget) * 100) : 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Límites</p>
          <h1 className="font-display text-4xl tracking-tight">Presupuestos</h1>
        </div>
        <MonthSwitcher value={viewMonth} onChange={setViewMonth} />
      </div>

      <section>
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Tope del mes</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <p className="font-display text-5xl tabular-nums tracking-tight">{moneyARS(globalBudget)}</p>
          <Input
            className="w-40"
            inputMode="decimal"
            defaultValue={globalBudget ? String(globalBudget) : ""}
            aria-label="Tope global"
            onBlur={(e) => {
              const n = parseAmount(e.target.value);
              if (n && n > 0) setGlobalBudget(n);
            }}
          />
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-elevated">
          <span
            className={cn("block h-full rounded-full", used > 100 ? "bg-expense" : "bg-accent")}
            style={{ width: `${Math.min(100, used)}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-muted">
          Gastado {moneyARS(stats.spent)}
          {globalBudget ? ` · ${used.toFixed(0)}% del tope` : ""}
        </p>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Contra las categorías de este mes</h2>
          <p className="text-xs text-subtle">
            {overAssigned
              ? `Las categorías superan el tope por ${moneyARS(overAssigned)}`
              : `Sin repartir ${moneyARS(unassigned)}`}
          </p>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-elevated">
          {globalBudget ? (
            <>
              <span className="bg-accent" style={{ width: `${assignedPct}%` }} />
              <span className="bg-border-strong" style={{ width: `${Math.max(0, 100 - assignedPct)}%` }} />
            </>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <p>
            <span className="block text-[11px] uppercase text-muted">Asignado</span>
            <span className="font-display text-2xl tabular-nums">{moneyARS(assigned)}</span>
          </p>
          <p>
            <span className="block text-[11px] uppercase text-muted">
              {overAssigned ? "De más" : "Libre"}
            </span>
            <span className="font-display text-2xl tabular-nums">
              {moneyARS(overAssigned || unassigned)}
            </span>
          </p>
        </div>
        <p className="mt-3 text-xs text-subtle">
          Si no escribís un tope, Cifra usa lo que ya cargaste en esa categoría.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium">Este mes</h2>
        {live.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Todavía no hay gastos. Cargá un movimiento y aparece acá.</p>
        ) : (
          <div className="grid gap-4">
            {live.map((c) => (
              <EnvelopeRow
                key={`${c.id}-${c.budget}`}
                spent={c.spent}
                budget={c.budget}
                name={c.name}
                icon={c.icon}
                token={c.token}
                onSave={(n) => setBudget(c.id, n)}
              />
            ))}
          </div>
        )}
      </section>

      {idle.length > 0 ? (
        <section>
          <h2 className="mb-1 text-sm font-medium">Sin movimiento este mes</h2>
          <p className="mb-3 text-xs text-subtle">No cuentan como asignadas hasta que les pongas un tope o cargues un gasto.</p>
          <div className="grid gap-3">
            {idle.map((c) => (
              <EnvelopeRow
                key={`${c.id}-${c.budget}`}
                spent={0}
                budget={c.budget}
                name={c.name}
                icon={c.icon}
                token={c.token}
                quiet
                onSave={(n) => setBudget(c.id, n)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EnvelopeRow({
  name,
  icon,
  token,
  spent,
  budget,
  quiet,
  onSave,
}: {
  name: string;
  icon: string;
  token: string;
  spent: number;
  budget: number;
  quiet?: boolean;
  onSave: (n: number) => void;
}) {
  const pct = budget ? (spent / budget) * 100 : 0;
  const over = budget > 0 && spent > budget;
  return (
    <div className={cn("grid gap-2 sm:grid-cols-[1fr_8rem] sm:items-center", quiet && "opacity-80")}>
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <span style={{ color: `var(--color-${token})` }}>
              <CatIcon name={icon} className="size-3.5" />
            </span>
            {name}
          </span>
          <span className={cn("text-xs tabular-nums", over ? "text-expense" : "text-muted")}>
            {spent > 0 ? moneyARS(spent) : "—"}
            {budget ? ` / ${moneyARS(budget)}` : " · sin tope"}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
          <span
            className={cn("block h-full rounded-full", over ? "bg-expense" : "bg-accent")}
            style={{ width: `${budget ? Math.min(100, pct) : 0}%` }}
          />
        </div>
      </div>
      <Input
        inputMode="decimal"
        defaultValue={budget ? String(budget) : ""}
        placeholder="Sin tope"
        aria-label={`Tope de ${name}`}
        onBlur={(e) => {
          const n = parseAmount(e.target.value);
          const next = n && n > 0 ? n : 0;
          if (next === budget) return;
          onSave(next);
        }}
      />
    </div>
  );
}