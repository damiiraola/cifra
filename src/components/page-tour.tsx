import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useLedger } from "@/lib/store";
import { clearReplay, currentReplay, markSeen, readSeen, subscribeReplay, tourFor } from "@/lib/tours";
import { Button } from "@/components/ui/button";

export function PageTour() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const email = useLedger((s) => s.ownerEmail);
  const onboarded = useLedger((s) => s.onboarded);
  const status = useLedger((s) => s.status);
  const [replay, setReplay] = useState(currentReplay);
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState<string[] | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);

  const tour = tourFor(pathname);
  const show =
    seen !== null &&
    status === "ready" &&
    onboarded &&
    Boolean(email) &&
    Boolean(tour) &&
    (replay === pathname || !seen.includes(pathname));
  const current = tour?.steps[step];

  useEffect(
    () =>
      subscribeReplay(() => {
        setReplay(currentReplay());
        setStep(0);
      }),
    [],
  );

  useEffect(() => {
    setSeen(readSeen(email, localStorage));
    setStep(0);
  }, [email, pathname]);

  useEffect(() => {
    if (!show || !current?.anchor) {
      setBox(null);
      return;
    }
    const nodes = [...document.querySelectorAll<HTMLElement>(`[data-tour="${current.anchor}"]`)];
    const el = nodes.find((n) => n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0);
    if (!el) {
      setBox(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const off = rect.bottom < 0 || rect.top > window.innerHeight - 80;
    if (off) el.scrollIntoView({ block: "center" });
    const measure = () => setBox(el.getBoundingClientRect());
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [show, current?.anchor, step, pathname]);

  if (!show || !tour || !current) return null;

  const last = step >= tour.steps.length - 1;
  const high = box ? box.top > window.innerHeight * 0.55 : false;

  function finish() {
    markSeen(email, pathname, localStorage);
    setSeen(readSeen(email, localStorage));
    if (currentReplay() === pathname) clearReplay();
    setStep(0);
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0" />
      {box ? (
        <div
          className="pointer-events-none fixed z-[61] rounded-2xl"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/70" />
      )}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className={
          high
            ? "absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[62] mx-auto max-w-md rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.12)]"
            : "absolute inset-x-4 bottom-[max(5.5rem,env(safe-area-inset-bottom))] z-[62] mx-auto max-w-md rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.12)] md:bottom-8"
        }
      >
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
          {tour.page} · {step + 1} de {tour.steps.length}
        </p>
        <h2 id="tour-title" className="mt-1 font-display text-2xl tracking-tight">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{current.body}</p>
        {last ? <p className="mt-2 text-xs text-subtle">Se puede volver a ver desde Aprender.</p> : null}
        <div className="mt-4 flex gap-2">
          {step > 0 ? (
            <Button variant="secondary" className="flex-1" onClick={() => setStep((n) => n - 1)}>
              Atrás
            </Button>
          ) : (
            <Button variant="secondary" className="flex-1" onClick={finish}>
              Saltar
            </Button>
          )}
          <Button className="flex-1" onClick={() => (last ? finish() : setStep((n) => n + 1))}>
            {last ? "Listo" : "Siguiente"}
          </Button>
        </div>
      </section>
    </div>
  );
}
