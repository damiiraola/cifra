import { toast } from "sonner";
import { GOAL_PRIORITIES, type Goal } from "@/lib/goals";
import { moneyARS } from "@/lib/format";
import type { Lever } from "@/lib/plan/month-plan";
import { useMonthPlan } from "@/lib/plan/use-plan";
import { useBookGoals, useLedger } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const LEVER_BUTTON: Record<Lever["kind"], string> = {
  recorte: "Aplicar topes",
  fecha: "Mover fecha",
  monto: "Bajar monto",
  prioridad: "Subir prioridad",
};

function Row({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "in" | "out";
}) {
  return (
    <p className={cn("flex justify-between gap-3 text-sm", strong && "font-medium")}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className={cn("tabular-nums", tone === "in" && "text-income")}>{value}</span>
    </p>
  );
}

/**
 * Plan de un mes normal (§2.4): entra, ya comprometido, metas, queda para el
 * día a día; topes sugeridos con "Aplicar topes" and, when it does not close,
 * the levers. Every number comes from lib/plan; applying is the user's call.
 */
export function MonthPlanCard() {
  const { plan, suggestion, levers: all, hasHistory } = useMonthPlan();
  // Trimming is already the "Aplicar topes" button above.
  const levers = all.filter((l) => l.kind !== "recorte");
  const goals = useBookGoals();
  const setBudget = useLedger((s) => s.setBudget);
  const saveGoal = useLedger((s) => s.saveGoal);
  if (plan.income <= 0 && plan.usual <= 0 && plan.goals.length === 0) return null;

  const priorityLabel = (p: Goal["priority"]) =>
    GOAL_PRIORITIES.find((x) => x.id === p)?.label.toLowerCase() ?? "";
  const topes = suggestion.rows.filter((r) => r.tope > 0);

  function applyTopes() {
    for (const r of topes) setBudget(r.id, r.tope);
    toast.success(`Apliqué ${topes.length} tope${topes.length === 1 ? "" : "s"} en Presupuestos`);
  }

  function applyLever(l: Lever) {
    if (l.kind === "recorte") return applyTopes();
    const g = goals.find((x) => x.id === l.goalId);
    if (!g) return;
    const base = {
      id: g.id,
      kind: g.kind,
      name: g.name,
      currency: g.currency,
      target: g.target,
      deadline: g.deadline,
      priority: g.priority,
    };
    if (l.kind === "fecha") saveGoal({ ...base, deadline: l.deadline });
    if (l.kind === "monto") saveGoal({ ...base, target: l.target });
    if (l.kind === "prioridad") saveGoal({ ...base, priority: l.priority });
    toast.success(`${g.name} actualizada`);
  }

  return (
    <section
      id="mes"
      className="scroll-mt-24 rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]"
    >
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
        Plan de un mes normal
      </p>
      <p className="mt-1 font-display text-3xl tracking-tight">
        {plan.closes
          ? plan.gap > 0
            ? `Cierra: sobran ${moneyARS(plan.gap)}`
            : "Cierra justo"
          : `No cierra: faltan ${moneyARS(-plan.gap)} por mes`}
      </p>
      <div className="mt-4 grid gap-1.5">
        <Row label="Entra" value={`+${moneyARS(plan.income)}`} tone="in" />
        <Row label="Ya comprometido" value={`−${moneyARS(plan.committed)}`} />
        <p className="pl-3 text-xs text-subtle">
          Fijos {moneyARS(plan.fijos)} · tarjetas {moneyARS(plan.cards)} (cuotas y fijos con
          tarjeta)
        </p>
        <Row label="Metas" value={`−${moneyARS(plan.goalsTotal)}`} />
        {plan.goals.map((g) => (
          <p key={g.id} className="flex justify-between gap-3 pl-3 text-xs text-subtle">
            <span>
              {g.name} · {priorityLabel(g.priority)}
            </span>
            <span className="tabular-nums">{moneyARS(g.needArs)} por mes</span>
          </p>
        ))}
        <Row label="Queda para el día a día" value={moneyARS(plan.dayToDay)} strong />
        <Row label="Lo que gastás normalmente" value={moneyARS(plan.usual)} />
      </div>

      {hasHistory && topes.length ? (
        <div className="mt-5">
          <p className="text-sm font-medium">
            {suggestion.freed > 0
              ? suggestion.short > 0
                ? "Topes con recorte"
                : "Topes para que cierre"
              : "Topes a tu medida"}
          </p>
          <p className="mt-1 text-xs text-muted">
            Lo comprometido del mes más lo que gastás normalmente
            {suggestion.freed > 0
              ? `, recortando ${moneyARS(suggestion.freed)} donde se puede. Fijos y cuotas no se tocan.`
              : "."}
          </p>
          <div className="mt-3 grid gap-1.5">
            {topes.map((r) => (
              <p key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span>
                  {r.name}
                  {r.cut > 0 ? (
                    <span className="text-xs text-subtle"> · −{moneyARS(r.cut)}</span>
                  ) : null}
                </span>
                <span className="tabular-nums">{moneyARS(r.tope)}</span>
              </p>
            ))}
          </div>
          {!plan.closes && suggestion.short > 0 ? (
            <p className="mt-2 text-xs text-subtle">
              Aun recortando lo posible, siguen faltando {moneyARS(suggestion.short)}.
            </p>
          ) : null}
          <Button className="mt-4" onClick={applyTopes}>
            Aplicar topes
          </Button>
        </div>
      ) : !hasHistory ? (
        <p className="mt-4 text-sm text-subtle">
          Con un mes completo cargado aparecen los topes sugeridos por categoría.
        </p>
      ) : null}

      {levers.length ? (
        <div className="mt-5 grid gap-2">
          <p className="text-sm font-medium">
            {plan.closes ? "Para llegar con las metas" : "Para que cierre"}
          </p>
          {levers.map((l) => (
            <div
              key={l.id}
              className="flex items-start justify-between gap-3 rounded-2xl bg-elevated px-4 py-3"
            >
              <p className="text-sm leading-snug">{l.text}</p>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                onClick={() => applyLever(l)}
              >
                {LEVER_BUTTON[l.kind]}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
