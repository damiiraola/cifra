import { Link } from "@tanstack/react-router";
import { GOAL_KINDS, goalPace } from "@/lib/goals";
import { money } from "@/lib/format";
import { useLedger } from "@/lib/store";
import { todayISO } from "@/lib/utils";

export function GoalStrip() {
  const goals = useLedger((s) => s.goals.filter((g) => g.bookId === s.activeBookId && g.active));
  const today = todayISO();
  if (!goals.length) return null;

  return (
    <section data-tour="metas" className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Metas</h2>
        <Link to="/metas" className="text-xs text-muted hover:text-fg">
          Ver
        </Link>
      </div>
      {goals.slice(0, 3).map((g) => {
        const pace = goalPace(g, today);
        const kind = GOAL_KINDS.find((k) => k.id === g.kind)?.label;
        return (
          <Link key={g.id} to="/metas" className="rounded-2xl bg-surface px-4 py-3 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm">{g.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {money(g.saved, g.currency)} / {money(g.target, g.currency)}
              </span>
            </span>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-elevated">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(pace.pct * 100)}%` }} />
            </span>
            <span className="mt-1.5 block text-xs text-subtle">
              {kind}
              {pace.left <= 0
                ? " · lista"
                : pace.days > 0
                  ? ` · faltan ${money(pace.left, g.currency)} · ${money(pace.perDay, g.currency)} por día`
                  : ` · faltan ${money(pace.left, g.currency)}`}
            </span>
          </Link>
        );
      })}
    </section>
  );
}
