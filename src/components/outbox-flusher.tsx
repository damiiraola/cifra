import { useEffect, useState } from "react";
import { showUnsaved, UNSAVED_GRACE_MS } from "@/lib/outbox";
import { useLedger } from "@/lib/store";

export function OutboxFlusher() {
  const flushOutbox = useLedger((s) => s.flushOutbox);
  const flushRecurrings = useLedger((s) => s.flushRecurrings);
  const txPending = useLedger((s) => s.outbox.length);
  const recPending = useLedger((s) => s.pendingRecurringIds.length);
  const pending = txPending + recPending;
  const hasPending = pending > 0;
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(true);

  // Start the clock when something is waiting, and re-render once the grace
  // period is over, so a normal 2–3 s save never shows the yellow pill.
  useEffect(() => {
    if (!hasPending) {
      setPendingSince(null);
      return;
    }
    const since = Date.now();
    setPendingSince(since);
    setNow(since);
    const t = window.setTimeout(() => setNow(Date.now()), UNSAVED_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [hasPending]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

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

  if (!showUnsaved(pending, pendingSince === null ? 0 : now - pendingSince, online)) return null;

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
