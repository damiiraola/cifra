import { formatRate, USD_SOURCES } from "@/lib/fx";
import { useLedger } from "@/lib/store";

export function FxStrip() {
  const { usdRate, usdtRate, usdSource, quotesBusy, refreshQuotes } = useLedger();
  const usdLabel = USD_SOURCES.find((s) => s.id === usdSource)?.label ?? "USD";

  return (
    <button
      type="button"
      onClick={() => void refreshQuotes()}
      className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl bg-surface px-4 py-3 text-left shadow-[0_0_0_1px_rgba(244,244,240,0.06)]"
    >
      <span className="text-xs text-muted">
        {quotesBusy ? "Actualizando cotizaciones…" : "Cotizaciones en vivo"}
      </span>
      <span className="text-sm tabular-nums text-fg">
        USD {usdLabel} ${formatRate(usdRate)}
        <span className="mx-2 text-subtle">·</span>
        USDT ${formatRate(usdtRate)}
      </span>
    </button>
  );
}
