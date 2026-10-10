import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { usePlanAlerts } from "@/lib/plan/use-plan";
import { byPriority, type AlertTone } from "@/lib/plan/alerts";
import { cn } from "@/lib/utils";

const HIDDEN_KEY = "cifra-avisos-ocultos:v1";

const DOT: Record<AlertTone, string> = {
  bad: "bg-expense",
  warn: "bg-warn",
  info: "bg-muted",
};

function readHidden(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Avisos sin IA, computed from the user's own numbers (lib/plan/alerts).
 * Hiding one only hides that alert for that period: its id carries the month.
 */
export function PlanAlerts({ limit = 3, title = false }: { limit?: number; title?: boolean }) {
  const alerts = usePlanAlerts();
  const [hidden, setHidden] = useState<string[] | null>(null);
  useEffect(() => setHidden(readHidden()), []);
  if (hidden === null) return null;
  const visible = byPriority(alerts.filter((a) => !hidden.includes(a.id)));
  if (!visible.length) {
    return title ? <p className="text-sm text-muted">Sin avisos por ahora.</p> : null;
  }
  const shown = visible.slice(0, limit);

  function hide(id: string) {
    const next = [id, ...(hidden ?? [])].slice(0, 200);
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      // Private mode: it stays hidden until reload.
    }
  }

  return (
    <section aria-label="Avisos" className="grid gap-2">
      {shown.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-2.5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]"
        >
          <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[a.tone])} />
          <Link
            to={a.to}
            className="-my-2.5 min-w-0 flex-1 py-2.5 text-[13px] leading-snug hover:text-fg"
          >
            {a.text}
          </Link>
          <button
            type="button"
            aria-label="Ocultar aviso"
            onClick={() => hide(a.id)}
            className="-my-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-lg text-subtle hover:bg-elevated hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      {visible.length > shown.length ? (
        <Link
          to="/metas"
          hash="avisos"
          className="inline-flex min-h-11 items-center text-xs text-muted hover:text-fg"
        >
          {visible.length - shown.length === 1 ? "1 aviso más" : `${visible.length - shown.length} avisos más`}
        </Link>
      ) : null}
    </section>
  );
}
