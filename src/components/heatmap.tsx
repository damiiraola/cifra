import { useRef, type PointerEvent } from "react";
import { heatmapIntensity, heatmapMax } from "@/lib/analytics";
import { moneyARS } from "@/lib/format";
import { cn, monthISO, todayISO } from "@/lib/utils";

const HEAD = ["L", "M", "M", "J", "V", "S", "D"];

function mondayIndex(iso: string) {
  const wd = new Date(`${iso}T12:00:00`).getDay();
  return (wd + 6) % 7;
}

export function Heatmap({
  byDay,
  selected,
  viewMonth,
  onSelect,
  onLongPress,
  onMonthDelta,
}: {
  byDay: { date: string; spent: number; count: number }[];
  selected: string | null;
  viewMonth: string;
  onSelect: (date: string) => void;
  onLongPress?: (date: string) => void;
  onMonthDelta?: (delta: -1 | 1) => void;
}) {
  const max = heatmapMax(byDay);
  const first = byDay[0]?.date;
  const today = todayISO();
  const startX = useRef(0);
  const startY = useRef(0);
  const swiped = useRef(false);
  const longFired = useRef(false);
  const longTimer = useRef<number | null>(null);
  const ignoreClick = useRef(false);

  if (!first) return null;
  const pad = mondayIndex(first);
  const currentYm = monthISO();

  function clearLong() {
    if (longTimer.current != null) {
      window.clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  }

  function onPointerDown(e: PointerEvent) {
    startX.current = e.clientX;
    startY.current = e.clientY;
    swiped.current = false;
    longFired.current = false;
    ignoreClick.current = false;
  }

  function onPointerMove(e: PointerEvent) {
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) clearLong();
    if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      swiped.current = true;
      ignoreClick.current = true;
    }
  }

  function onPointerUp(e: PointerEvent) {
    clearLong();
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!onMonthDelta) return;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    const delta: -1 | 1 = dx < 0 ? 1 : -1;
    if (delta === 1 && viewMonth >= currentYm) return;
    ignoreClick.current = true;
    onMonthDelta(delta);
  }

  function pressDay(date: string, future: boolean) {
    if (future) return;
    clearLong();
    longFired.current = false;
    longTimer.current = window.setTimeout(() => {
      longFired.current = true;
      ignoreClick.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(12);
      }
      onLongPress?.(date);
    }, 400);
  }

  function selectDay(date: string, future: boolean) {
    clearLong();
    if (future || ignoreClick.current || longFired.current || swiped.current) return;
    onSelect(date);
  }

  return (
    <div
      className="touch-pan-y select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={clearLong}
    >
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
          const intensity = heatmapIntensity(d.spent, max);
          const future = d.date > today;
          const on = selected === d.date;
          const isToday = d.date === today;
          return (
            <button
              key={d.date}
              type="button"
              disabled={future}
              aria-label={
                future
                  ? `${d.date}, futuro`
                  : `${d.date}, ${moneyARS(d.spent)}${d.count ? `, ${d.count} movimientos` : ""}`
              }
              aria-pressed={on}
              onPointerDown={() => pressDay(d.date, future)}
              onClick={() => selectDay(d.date, future)}
              className={cn(
                "relative flex min-h-11 aspect-square items-center justify-center rounded-lg text-xs tabular-nums transition-[transform,box-shadow] duration-150",
                future ? "text-subtle/40" : "text-fg",
                on && "z-[1] scale-[1.04] shadow-[0_0_0_1px_rgba(200,204,212,0.85)]",
                isToday && !on && "shadow-[0_0_0_1px_rgba(244,244,240,0.28)]",
              )}
              style={
                future || d.spent <= 0
                  ? { background: "var(--color-elevated)" }
                  : {
                      background: `color-mix(in oklab, var(--color-accent) ${Math.round(intensity * 100)}%, var(--color-elevated))`,
                    }
              }
            >
              {Number(d.date.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-elevated" />
          nada
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{
              background: "color-mix(in oklab, var(--color-accent) 40%, var(--color-elevated))",
            }}
          />
          normal
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{
              background: "color-mix(in oklab, var(--color-accent) 88%, var(--color-elevated))",
            }}
          />
          pico
        </span>
      </div>
    </div>
  );
}