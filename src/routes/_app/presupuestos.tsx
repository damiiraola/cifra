import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { budgetAllocation, buildMonthPlan, fijoTopes, liveCategoryRows, recurringLines } from "@/lib/budget-math";
import { DEFAULT_BUDGETS } from "@/lib/categories";
import { computeMonth } from "@/lib/analytics";
import { money, moneyARS, monthLabel, parseAmount, amountInput } from "@/lib/format";
import { toGoalCurrency } from "@/lib/goals";
import { CatIcon } from "@/lib/icons";
import { useAllCategories, useBookTxs, useLedger } from "@/lib/store";
import { committedForMonth } from "@/lib/card-math";
import { cn, daysInMonth, monthISO, todayISO } from "@/lib/utils";
import { MonthSwitcher } from "@/components/month-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    budgetLocks,
    setBudget,
    globalBudget,
    setGlobalBudget,
    recurrings,
    activeBookId,
  } = useLedger();
  const transactions = useBookTxs();
  const allCats = useAllCategories();
  const stats = computeMonth(transactions, viewMonth, { usd: usdRate, usdt: usdtRate });
  const planned = fijoTopes(recurrings, activeBookId, { usd: usdRate, usdt: usdtRate });
  const rows = liveCategoryRows(stats.byCat, budgets, allCats, DEFAULT_BUDGETS, budgetLocks, planned);
  const live = rows.filter((c) => c.spent > 0 || c.budget > 0);
  const idle = rows.filter((c) => c.spent <= 0 && c.budget <= 0);
  const { assigned, unassigned, overAssigned } = budgetAllocation(rows, globalBudget);
  const days = daysLeft(viewMonth);
  const incomeLines = recurringLines(recurrings, activeBookId, { usd: usdRate, usdt: usdtRate }, "income");
  const income = incomeLines.reduce((s, r) => s + r.amount, 0);
  const plan = buildMonthPlan({
    cap: income > 0 ? income : globalBudget,
    assigned,
    daysLeft: days,
    openCategories: idle.map((c) => ({ id: c.id, name: c.name })),
  });
  const pendingFijos = live.filter((c) => (planned[c.id] ?? 0) > 0 && c.spent <= 0).map((c) => c.name);
  const used = globalBudget ? (stats.spent / globalBudget) * 100 : 0;
  const assignedPct = globalBudget ? Math.min(100, (assigned / globalBudget) * 100) : 0;
  const future = viewMonth > monthISO();
  const committed = future
    ? committedForMonth(transactions, recurrings.filter((r) => r.bookId === activeBookId), viewMonth, usdRate)
    : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Plan del mes</p>
          <h1 data-tour="titulo" className="font-display text-4xl tracking-tight">Presupuestos</h1>
        </div>
        <MonthSwitcher value={viewMonth} onChange={setViewMonth} ahead={12} />
      </div>

      <section data-tour="tope">
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Tope del mes</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <p className="font-display text-5xl tabular-nums tracking-tight">{moneyARS(globalBudget)}</p>
          <Input
            className="w-40"
            inputMode="decimal"
            defaultValue={amountInput(globalBudget)}
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
          {future ? "Ya cargado" : "Gastado"} {moneyARS(stats.spent)}
          {globalBudget ? ` · ${used.toFixed(0)}% del tope` : ""}
        </p>
        {committed && committed.total > 0 ? (
          <p className="mt-1 text-sm text-subtle">
            Para {monthLabel(viewMonth, "LLLL")} ya tenés {moneyARS(committed.cuotas)} en cuotas
            {committed.fijos > 0 ? ` y ${moneyARS(committed.fijos)} de fijos sin anotar` : ""}
            {globalBudget ? `. Te quedan ${moneyARS(Math.max(0, globalBudget - committed.fijos - stats.spent))} antes de gastar.` : "."}
          </p>
        ) : null}
      </section>

      <PlanCard
        plan={plan}
        income={income}
        incomeLines={incomeLines}
        assigned={assigned}
        cap={globalBudget}
        days={days}
        pendingFijos={pendingFijos}
        onApply={(rows) => {
          for (const s of rows) setBudget(s.id, s.amount);
        }}
      />

      <section data-tour="categorias">
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
          Si no escribís un tope, Cifra usa los fijos de esa categoría. Si no hay fijos, usa lo que ya gastaste.
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
                key={c.id}
                spent={c.spent}
                budget={c.budget}
                locked={Boolean(budgetLocks[c.id])}
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
                key={c.id}
                spent={0}
                budget={c.budget}
                locked={Boolean(budgetLocks[c.id])}
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
  locked,
  quiet,
  onSave,
}: {
  name: string;
  icon: string;
  token: string;
  spent: number;
  budget: number;
  locked?: boolean;
  quiet?: boolean;
  onSave: (n: number) => void;
}) {
  const pct = budget ? (spent / budget) * 100 : 0;
  const over = budget > 0 && spent > budget;
  const [text, setText] = useState(() => amountInput(budget));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(amountInput(budget));
  }, [budget, editing]);
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
        value={text}
        placeholder="Sin tope"
        aria-label={`Tope de ${name}`}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const n = parseAmount(text);
          const next = n && n > 0 ? n : 0;
          if (next === budget && (next > 0) === Boolean(locked)) {
            setText(amountInput(budget));
            return;
          }
          onSave(next);
        }}
      />
    </div>
  );
}

function daysLeft(ym: string) {
  const today = todayISO();
  const last = daysInMonth(ym);
  if (ym < today.slice(0, 7)) return 0;
  if (ym > today.slice(0, 7)) return last;
  return Math.max(1, last - Number(today.slice(8)) + 1);
}

function PlanCard({
  plan,
  income,
  incomeLines,
  assigned,
  cap,
  days,
  pendingFijos,
  onApply,
}: {
  plan: ReturnType<typeof buildMonthPlan>;
  income: number;
  incomeLines: { id: string; name: string; amount: number }[];
  assigned: number;
  cap: number;
  days: number;
  pendingFijos: string[];
  onApply: (rows: { id: string; amount: number }[]) => void;
}) {
  const pct = Math.round(plan.share * 100);
  const sig = plan.suggestions.map((s) => `${s.id}:${s.amount}`).join("|");
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(plan.suggestions.map((s) => [s.id, amountInput(s.amount)])),
  );
  useEffect(() => {
    setDrafts(Object.fromEntries(plan.suggestions.map((s) => [s.id, amountInput(s.amount)])));
  }, [sig]);
  const rows = plan.suggestions.map((s) => ({
    id: s.id,
    name: s.name,
    amount: Math.max(0, Math.round(parseAmount(drafts[s.id] ?? "") ?? 0)),
  }));
  const used = rows.reduce((s, r) => s + r.amount, 0);
  const cushion = plan.left - used;
  const goals = useLedger((s) => s.goals.filter((g) => g.bookId === s.activeBookId && g.active));
  const addToGoal = useLedger((s) => s.addToGoal);
  const usdRate = useLedger((s) => s.usdRate);
  const usdtRate = useLedger((s) => s.usdtRate);
  const [sendTo, setSendTo] = useState("");
  const [sent, setSent] = useState("");
  const headline =
    plan.tone === "over"
      ? `Te pasás ${moneyARS(plan.over)}`
      : days > 0
        ? `Te quedan ${moneyARS(plan.left)}`
        : "Este mes ya cerró";
  const detail =
    plan.tone === "over"
      ? "Los fijos y lo ya asignado superan el tope. Bajá un tope o subí el del mes."
      : plan.tone === "tight"
        ? `El ${pct}% del mes ya está comprometido. ${days ? `Para ${days} días son ${moneyARS(plan.perDay)} por día. No lo sueltes en la primera semana.` : ""}`
        : days
          ? `Unos ${moneyARS(plan.perDay)} por día hasta fin de mes.`
          : "";

  return (
    <section data-tour="plan" className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
        {plan.tone === "over" ? "No cierra" : plan.tone === "tight" ? "Estás justo" : "Hay margen"}
      </p>
      <p className="mt-1 font-display text-4xl tracking-tight">{headline}</p>
      {detail ? <p className="mt-2 max-w-xl text-sm text-muted">{detail}</p> : null}
      {incomeLines.length > 0 ? (
        <div className="mt-4 grid gap-1.5">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Entra</p>
          {incomeLines.map((line) => (
            <p key={line.id} className="flex justify-between gap-3 text-sm">
              <span>{line.name}</span>
              <span className="tabular-nums text-income">+{moneyARS(line.amount)}</span>
            </p>
          ))}
        </div>
      ) : null}
      {income > 0 && cap > 0 && cap !== income ? (
        <p className="mt-2 max-w-xl text-sm text-muted">
          {cap > income
            ? `El tope del mes es ${moneyARS(cap)}, más alto que lo que entra. El plan usa lo que entra.`
            : `El tope del mes es ${moneyARS(cap)}. Entra más que eso: el plan usa el ingreso, no el tope.`}
        </p>
      ) : null}
      {income > 0 ? (
        <p className="mt-2 max-w-xl text-sm text-muted">
          {income < assigned
            ? `Esos ingresos no cubren los fijos: faltan ${moneyARS(assigned - income)}.`
            : `Después de los fijos quedan ${moneyARS(income - assigned)}.`}
        </p>
      ) : null}
      {pendingFijos.length > 0 ? (
        <p className="mt-2 max-w-xl text-sm text-subtle">
          Todavía no anotaste {pendingFijos.join(", ")}. Cuando los cargues, el gastado sube. El plan ya los descontó.
        </p>
      ) : null}
      {plan.suggestions.length > 0 ? (
        <div className="mt-5">
          <p className="text-sm font-medium">Así repartiría lo que queda</p>
          <p className="mt-1 text-xs text-muted">Cambialos si querés. Lo que no asignás queda sin tocar.</p>
          <div className="mt-3 grid gap-2">
            {plan.suggestions.map((s) => (
              <label key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{s.name}</span>
                <Input
                  inputMode="decimal"
                  value={drafts[s.id] ?? ""}
                  aria-label={`Reparto de ${s.name}`}
                  className="w-36 text-right tabular-nums"
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  onBlur={() => {
                    const n = parseAmount(drafts[s.id] ?? "");
                    setDrafts((prev) => ({ ...prev, [s.id]: n && n > 0 ? amountInput(n) : "" }));
                  }}
                />
              </label>
            ))}
            <p className="flex justify-between gap-3 text-sm">
              <span>Sin tocar, por si aparece algo</span>
              <span className={cn("tabular-nums", cushion < 0 ? "text-expense" : "text-muted")}>
                {cushion < 0 ? `Te pasás ${moneyARS(-cushion)}` : moneyARS(cushion)}
              </span>
            </p>
          </div>
          {cushion > 0 ? (
            goals.length ? (
              <label className="mt-3 grid gap-1 text-sm">
                Mandar lo que sobra a
                <select
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  className="h-11 rounded-lg bg-elevated px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
                >
                  <option value="">No mandar</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Lo que sobra se puede ir a una meta.{" "}
                <Link to="/metas" className="underline-offset-4 hover:underline">
                  Crear una
                </Link>
              </p>
            )
          ) : null}
          <Button
            className="mt-4"
            onClick={() => {
              onApply(rows);
              const stamp = `${sendTo}:${Math.round(cushion)}`;
              const goal = goals.find((g) => g.id === sendTo);
              if (goal && cushion > 0 && sent !== stamp) {
                const amount = toGoalCurrency(cushion, goal.currency, { usd: usdRate, usdt: usdtRate });
                if (amount > 0) {
                  addToGoal(goal.id, amount);
                  setSent(stamp);
                  toast.success(`Plan guardado. ${money(amount, goal.currency)} fueron a ${goal.name}.`);
                  return;
                }
              }
              toast.success("Plan guardado");
            }}
          >
            Guardar plan
          </Button>
        </div>
      ) : null}
    </section>
  );
}