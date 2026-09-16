import { useEffect, useState } from "react";
import { formatRate, USD_SOURCES } from "@/lib/fx";
import { isArgentineWeekday, quotesAgeLabel } from "@/lib/market-hours";
import { useLedger } from "@/lib/store";

export function FxStrip() {
  const { usdRate, usdtRate, usdSource, quotesBusy, quotesAt, refreshQuotes } = useLedger();
  const usdLabel = USD_SOURCES.find((s) => s.id === usdSource)?.label ?? "USD";
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const live = isArgentineWeekday();
  const age = quotesAgeLabel(quotesAt);

  return (
    <button
      type="button"
      onClick={() => void refreshQuotes()}
      className="flex w-full items-baseline justify-between gap-3 text-left"
    >
      <span className="text-[11px] text-muted">
        {quotesBusy ? "Actualizando…" : live ? `En vivo · ${age}` : `Fin de semana · ${age}`}
      </span>
      <span className="text-xs tabular-nums text-fg">
        USD {usdLabel} ${formatRate(usdRate)}
        <span className="mx-1.5 text-subtle">·</span>
        USDT ${formatRate(usdtRate)}
      </span>
    </button>
  );
}