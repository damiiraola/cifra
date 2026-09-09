import { useEffect } from "react";
import { isArgentineWeekday, quotesAreStale, QUOTE_INTERVAL_MS } from "@/lib/market-hours";
import { useLedger } from "@/lib/store";

export function QuotesTicker() {
  const refreshQuotes = useLedger((s) => s.refreshQuotes);

  useEffect(() => {
    const run = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!isArgentineWeekday()) return;
      if (!quotesAreStale(useLedger.getState().quotesAt)) return;
      void refreshQuotes(true);
    };

    const id = window.setInterval(run, QUOTE_INTERVAL_MS);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [refreshQuotes]);

  return null;
}
