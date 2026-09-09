import { useEffect } from "react";
import { QUOTE_TICK_MS, shouldRefreshQuotes } from "@/lib/market-hours";
import { useLedger } from "@/lib/store";

export function QuotesTicker() {
  const refreshQuotes = useLedger((s) => s.refreshQuotes);

  useEffect(() => {
    const run = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!shouldRefreshQuotes(useLedger.getState().quotesAt)) return;
      void refreshQuotes(true);
    };

    run();
    const id = window.setInterval(run, QUOTE_TICK_MS);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [refreshQuotes]);

  return null;
}
