import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { GOAL_KINDS, goalPace, type GoalKind } from "@/lib/goals";
import { money, parseAmount } from "@/lib/format";
import { useLedger } from "@/lib/store";
import { todayISO } from "@/lib/utils";
import type { Currency } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_app/metas")({
  component: Metas,
});

function Metas() {
  const goals = useLedger((s) => s.goals.filter((g) => g.bookId === s.activeBookId && g.active));
  const saveGoal = useLedger((s) => s.saveGoal);
  const addToGoal = useLedger((s) => s.addToGoal);
  const removeGoal = useLedger((s) => s.removeGoal);
  const today = todayISO();
  const [kind, setKind] = useState<GoalKind>("ahorro");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");

  function create() {
    const n = parseAmount(target);
    if (!n || n <= 0) {
      toast.error("Poné cuánto hace falta");
      return;
    }
    saveGoal({ kind, name, currency, target: n, deadline });
    setName("");
    setTarget("");
    setDeadline("");
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
            name={g.name}
            kind={g.kind}
            currency={g.currency}
            saved={g.saved}
            target={g.target}
            deadline={g.deadline}
            today={today}
            onAdd={(n) => addToGoal(g.id, n)}
            onRemove={() => removeGoal(g.id)}
          />
        ))}
      </div>
    </div>
  );
}

function GoalCard({
  name,
  kind,
  currency,
  saved,
  target,
  deadline,
  today,
  onAdd,
  onRemove,
}: {
  name: string;
  kind: GoalKind;
  currency: Currency;
  saved: number;
  target: number;
  deadline: string;
  today: string;
  onAdd: (n: number) => void;
  onRemove: () => void;
}) {
  const pace = goalPace({ id: "", bookId: "", kind, name, currency, saved, target, deadline, active: true, createdAt: "", updatedAt: "" }, today);
  const [text, setText] = useState("");
  const label = GOAL_KINDS.find((k) => k.id === kind)?.label;
  return (
    <article className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</p>
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
      <div className="mt-4 flex gap-2">
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
        <Button variant="ghost" onClick={onRemove}>
          Borrar
        </Button>
      </div>
    </article>
  );
}
