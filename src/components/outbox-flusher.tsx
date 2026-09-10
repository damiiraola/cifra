import { useEffect } from "react";
import { useLedger } from "@/lib/store";

export function OutboxFlusher() {
  const flushOutbox = useLedger((s) => s.flushOutbox);
  const flushRecurrings = useLedger((s) => s.flushRecurrings);
  const txPending = useLedger((s) => s.outbox.length);
  const recPending = useLedger((s) => s.pendingRecurringIds.length);
  const pending = txPending + recPending;

  useEffect(() => {
    const run = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const s = useLedger.getState();
      if (s.outbox.length) void flushOutbox();
      if (s.pendingRecurringIds.length) void flushRecurrings();
    };
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [flushOutbox, flushRecurrings]);

  if (!pending) return null;

  const label = (() => {
    if (txPending && recPending) return `${pending} sin guardar · Reintentar`;
    if (recPending === 1) return "1 fijo sin guardar · Reintentar";
    if (recPending > 1) return `${recPending} fijos sin guardar · Reintentar`;
    if (txPending === 1) return "1 movimiento sin guardar · Reintentar";
    return `${txPending} sin guardar · Reintentar`;
  })();

  return (
    <button
      type="button"
      onClick={() => {
        if (txPending) void flushOutbox({ force: true });
        if (recPending) void flushRecurrings();
      }}
      className="fixed bottom-[4.75rem] left-1/2 z-40 h-11 -translate-x-1/2 rounded-full bg-warn px-4 text-sm font-medium text-bg shadow-lg md:bottom-6"
    >
      {label}
    </button>
  );
}
