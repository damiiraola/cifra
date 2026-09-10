import { useEffect } from "react";
import { useLedger } from "@/lib/store";

export function OutboxFlusher() {
  const flushOutbox = useLedger((s) => s.flushOutbox);
  const pending = useLedger((s) => s.outbox.length);

  useEffect(() => {
    const run = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!useLedger.getState().outbox.length) return;
      void flushOutbox();
    };
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [flushOutbox]);

  if (!pending) return null;

  return (
    <button
      type="button"
      onClick={() => void flushOutbox({ force: true })}
      className="fixed bottom-[4.75rem] left-1/2 z-40 h-11 -translate-x-1/2 rounded-full bg-warn px-4 text-sm font-medium text-bg shadow-lg md:bottom-6"
    >
      {pending === 1 ? "1 movimiento sin guardar · Reintentar" : `${pending} sin guardar · Reintentar`}
    </button>
  );
}
