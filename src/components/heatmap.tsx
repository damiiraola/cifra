import { heatmapMax } from "@/lib/analytics";
import { moneyARS } from "@/lib/format";
import { cn } from "@/lib/utils";

const HEAD = ["L", "M", "M", "J", "V", "S", "D"];

function mondayIndex(iso: string) {
  const wd = new Date(`${iso}T12:00:00`).getDay();
  return (wd + 6) % 7;
}

export function Heatmap({
  byDay,
  selected,
  onSelect,
}: {
  byDay: { date: string; spent: number; count: number }[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const max = heatmapMax(byDay);
  const first = byDay[0]?.date;
  if (!first) return null;
  const pad = mondayIndex(first);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-subtle">
        {HEAD.map((h, i) => (
          <span key={`${h}-${i}`}>{h}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: pad }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {byDay.map((d) => {
          const intensity = d.spent <= 0 ? 0 : 0.18 + (d.spent / max) * 0.72;
          const future = d.date > today;
          const on = selected === d.date;
          const isToday = d.date === today;
          return (
            <button
              key={d.date}
              type="button"
              disabled={future}
              title={`${d.date}: ${moneyARS(d.spent)}`}
              onClick={() => onSelect(d.date)}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-lg text-xs tabular-nums transition-[transform,box-shadow] duration-150",
                future ? "text-subtle/40" : "text-fg",
                on && "shadow-[0_0_0_1px_rgba(200,204,212,0.8)]",
                isToday && !on && "shadow-[0_0_0_1px_rgba(244,244,240,0.22)]",
              )}
              style={
                future || d.spent <= 0
                  ? { background: "var(--color-elevated)" }
                  : { background: `color-mix(in oklab, var(--color-accent) ${Math.round(intensity * 100)}%, var(--color-elevated))` }
              }
            >
              {Number(d.date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
