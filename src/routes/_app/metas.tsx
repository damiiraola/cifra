import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { GOAL_KINDS, GOAL_PRIORITIES, goalPace, type Goal, type GoalKind, type GoalPriority } from "@/lib/goals";
import { money, parseAmount } from "@/lib/format";
import { useBookGoals, useLedger } from "@/lib/store";
import { todayISO } from "@/lib/utils";
import type { Currency } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanAlerts } from "@/components/plan-alerts";
import { PlanMonths } from "@/components/plan-months";
import { MonthPlanCard } from "@/components/month-plan-card";
import { periodName } from "@/lib/card-pay";
import type { GoalLine } from "@/lib/plan/goal-plan";
import { usePlan } from "@/lib/plan/use-plan";

export const Route = createFileRoute("/_app/metas")({
  component: Metas,
});

function Metas() {
  const goals = useBookGoals();
  const saveGoal = useLedger((s) => s.saveGoal);
  const addToGoal = useLedger((s) => s.addToGoal);
  const removeGoal = useLedger((s) => s.removeGoal);
  const today = todayISO();
  const plan = usePlan(6);
  const [kind, setKind] = useState<GoalKind>("ahorro");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<GoalPriority>(2);

  function create() {
    const n = parseAmount(target);
    if (!n || n <= 0) {
      toast.error("Poné cuánto hace falta");
      return;
    }
    saveGoal({ kind, name, currency, target: n, deadline, priority });
    setName("");
    setTarget("");
    setDeadline("");
    setPriority(2);
    toast.success("Meta guardada");
  }

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Llegar</p>
        <h1 data-tour="titulo" className="font-display text-4xl tracking-tight">
          Metas
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Ahorrar lo que sobra, un viaje, un bien o invertir sin operar. Cada meta elige su moneda.
        </p>
      </div>

      <section data-tour="nueva" className="grid gap-3 rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
        <div className="flex flex-wrap gap-1.5">
          {GOAL_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={
                kind === k.id
                  ? "h-11 rounded-full bg-accent px-3.5 text-sm text-accent-fg"
                  : "h-11 rounded-full bg-elevated px-3.5 text-sm text-muted"
              }
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-subtle">{GOAL_KINDS.find((k) => k.id === kind)?.hint}</p>
        <Input aria-label="Nombre de la meta" value={name} placeholder="Ej. Brasil, la moto, colchón" onChange={(e) => setName(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {(["ARS", "USD", "USDT"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={
                currency === c
                  ? "h-11 rounded-full bg-accent px-3.5 text-sm text-accent-fg"
                  : "h-11 rounded-full bg-elevated px-3.5 text-sm text-muted"
              }
            >
              {c === "ARS" ? "Pesos" : c}
            </button>
          ))}
        </div>
        <Input inputMode="decimal" aria-label="Cuánto hace falta" value={target} placeholder="Cuánto hace falta" onChange={(e) => setTarget(e.target.value)} />
        <label className="grid gap-1 text-xs text-muted">
          Fecha, si tiene
          <Input type="date" aria-label="Fecha de la meta" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <div className="grid gap-1 text-xs text-muted">
          Prioridad
          <div className="flex flex-wrap gap-1.5">
            {GOAL_PRIORITIES.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={priority === p.id}
                onClick={() => setPriority(p.id)}
                className={
                  priority === p.id
                    ? "h-11 rounded-full bg-accent px-3.5 text-sm text-accent-fg"
                    : "h-11 rounded-full bg-elevated px-3.5 text-sm text-muted"
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-subtle">Lo que sobra va primero a las de prioridad alta.</span>
        </div>
        {kind === "inversion" ? (
          <p className="text-xs text-subtle">
            Esto es para apartar y dejar quieto: la parte grande en un índice S&P 500 y una manga chica en cripto. No es para comprar y vender.
          </p>
        ) : null}
        <Button onClick={create}>Crear meta</Button>
      </section>

      <div className="grid gap-3">
        {goals.length === 0 ? <p className="text-sm text-muted">Todavía no hay metas en este libro.</p> : null}
        {goals.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            today={today}
            plan={plan.goals.find((l) => l.goal.id === g.id)}
            onAdd={(n) => addToGoal(g.id, n)}
            onPriority={(p) =>
              saveGoal({ id: g.id, kind: g.kind, name: g.name, currency: g.currency, target: g.target, deadline: g.deadline, priority: p })
            }
            onRemove={() => removeGoal(g.id)}
          />
        ))}
      </div>

      <MonthPlanCard />

      <PlanMonths flow={plan.flow} surplus={plan.surplus} />

      <section id="avisos" className="grid scroll-mt-24 gap-2">
        <h2 className="text-sm font-medium">Avisos</h2>
        <PlanAlerts limit={50} title />
      </section>
    </div>
  );
}

function planText(line: GoalLine) {
  const c = line.goal.currency;
  if (line.onTrack === true) return `Con lo que te sobra por mes llegás a tiempo: apartá ${money(line.needed, c)} por mes.`;
  if (line.onTrack === false)
    return line.eta
      ? `Con lo que te sobra llegás en ${periodName(line.eta)}, no en ${periodName(line.goal.deadline.slice(0, 7))}. Para llegar a tiempo hacen falta ${money(line.needed, c)} por mes.`
      : `Hoy no te sobra para esta meta. Para llegar a tiempo hacen falta ${money(line.needed, c)} por mes.`;
  return line.assigned > 0 && line.eta
    ? `Con lo que sobra después de las otras metas (${money(line.assigned, c)} por mes) llegás en ${periodName(line.eta)}.`
    : "Sin fecha y sin sobrante libre: sumale cuando puedas.";
}

function GoalCard({
  goal,
  today,
  plan,
  onAdd,
  onPriority,
  onRemove,
}: {
  goal: Goal;
  today: string;
  plan?: GoalLine;
  onAdd: (n: number) => void;
  onPriority: (p: GoalPriority) => void;
  onRemove: () => void;
}) {
  const { name, kind, currency, saved, target } = goal;
  const pace = goalPace(goal, today);
  const [text, setText] = useState("");
  const label = GOAL_KINDS.find((k) => k.id === kind)?.label;
  return (
    <article className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
            {label} · prioridad {GOAL_PRIORITIES.find((p) => p.id === goal.priority)?.label.toLowerCase()}
          </p>
          <h2 className="truncate font-display text-2xl tracking-tight">{name}</h2>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-muted">
          {money(saved, currency)} / {money(target, currency)}
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(pace.pct * 100)}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {pace.left <= 0
          ? "Llegaste."
          : pace.days > 0
            ? `Faltan ${money(pace.left, currency)}. Para llegar a tiempo son ${money(pace.perDay, currency)} por día.`
            : `Faltan ${money(pace.left, currency)}. Sin fecha, no hay ritmo diario.`}
      </p>
      {plan ? <p className="mt-1 text-sm text-subtle">{planText(plan)}</p> : null}
      {plan?.usdHint ? (
        <p className="mt-1 text-xs text-subtle">
          Son más de 6 meses en pesos y la inflación se come el ahorro. Pensá en guardarlo en dólares.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Input
          inputMode="decimal"
          aria-label={`Apartar para ${name}`}
          value={text}
          placeholder="Aparté"
          className="w-36"
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => {
            const n = parseAmount(text);
            if (!n || n <= 0) return;
            onAdd(n);
            setText("");
            toast.success(`Sumé ${money(n, currency)} a ${name}`);
          }}
        >
          Sumar
        </Button>
        <select
          aria-label={`Prioridad de ${name}`}
          value={goal.priority}
          onChange={(e) => onPriority(Number(e.target.value) as GoalPriority)}
          className="h-11 rounded-lg bg-elevated px-2 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
        >
          {GOAL_PRIORITIES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <Button variant="ghost" onClick={onRemove}>
          Borrar
        </Button>
      </div>
    </article>
  );
}
