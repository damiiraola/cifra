import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useLedger } from "@/lib/store";
import { autoTour, clearReplay, currentReplay, markSeen, placeBubble, readSeen, subscribeReplay, tourFor } from "@/lib/tours";
import { Button } from "@/components/ui/button";

const MOVE = "top .4s cubic-bezier(.2,.7,.2,1), left .4s cubic-bezier(.2,.7,.2,1), width .4s cubic-bezier(.2,.7,.2,1), height .4s cubic-bezier(.2,.7,.2,1)";

export function PageTour() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const email = useLedger((s) => s.ownerEmail);
  const onboarded = useLedger((s) => s.onboarded);
  const status = useLedger((s) => s.status);
  const [replay, setReplay] = useState(currentReplay);
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState<string[] | null>(null);
  const [spot, setSpot] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [place, setPlace] = useState<ReturnType<typeof placeBubble> | null>(null);
  const [move, setMove] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  const tour = tourFor(pathname);
  const show =
    seen !== null &&
    status === "ready" &&
    onboarded &&
    Boolean(email) &&
    Boolean(tour) &&
    (replay === pathname || autoTour(pathname, seen));
  const current = tour?.steps[step];

  useEffect(
    () =>
      subscribeReplay(() => {
        setReplay(currentReplay());
        setStep(0);
        setMove(false);
      }),
    [],
  );

  useEffect(() => {
    setSeen(readSeen(email, localStorage));
    setStep(0);
    setMove(false);
  }, [email, pathname]);

  useEffect(() => {
    if (!show || !current?.anchor) {
      setSpot(null);
      setPlace(null);
      return;
    }
    const nodes = [...document.querySelectorAll<HTMLElement>(`[data-tour="${current.anchor}"]`)];
    const el = nodes.find((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!el) {
      setSpot(null);
      setPlace(null);
      return;
    }
    let parent: HTMLElement | null = el;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const focusOf = () => {
      const r = el.getBoundingClientRect();
      const cap = Math.min(r.height, window.innerHeight * 0.42);
      return { top: r.top, left: r.left, right: r.right, bottom: r.top + cap, width: r.width, height: cap };
    };
    const measure = () => {
      const focus = focusOf();
      setSpot({ top: focus.top, left: focus.left, width: focus.width, height: focus.height });
      const card = cardRef.current?.getBoundingClientRect();
      setPlace(
        placeBubble(
          focus,
          { width: card?.width || Math.min(340, window.innerWidth - 32), height: card?.height || 168 },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };
    const rect = el.getBoundingClientRect();
    const off = rect.top < 72 || rect.bottom > window.innerHeight - 48;
    if (off) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    measure();
    const later = window.setTimeout(measure, reduce ? 0 : 420);
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(later);
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, true);
    };
  }, [show, current?.anchor, step, pathname]);

  useEffect(() => {
    if (!spot) return;
    const id = window.requestAnimationFrame(() => setMove(true));
    return () => window.cancelAnimationFrame(id);
  }, [spot]);

  if (!show || !tour || !current) return null;

  const last = step >= tour.steps.length - 1;
  const cardWidth = Math.min(340, typeof window !== "undefined" ? window.innerWidth - 32 : 340);

  function finish() {
    markSeen(email, pathname, localStorage);
    setSeen(readSeen(email, localStorage));
    if (currentReplay() === pathname) clearReplay();
    setStep(0);
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0" />
      {spot ? (
        <div
          className="pointer-events-none fixed z-[61] rounded-2xl"
          style={{
            top: spot.top - 8,
            left: spot.left - 8,
            width: spot.width + 16,
            height: spot.height + 16,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
            outline: "1.5px solid rgba(244,244,240,0.9)",
            transition: move ? MOVE : "none",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}
      <section
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="fixed z-[62] rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.14)]"
        style={{
          width: cardWidth,
          top: place?.top ?? 24,
          left: place?.left ?? 16,
          transition: move && place ? "top .4s cubic-bezier(.2,.7,.2,1), left .4s cubic-bezier(.2,.7,.2,1)" : "none",
        }}
      >
        {place ? (
          <span
            aria-hidden
            className="absolute size-3 rotate-45 bg-surface"
            style={
              place.tip === "left"
                ? { top: 22, left: -6 }
                : place.tip === "down"
                  ? { bottom: -6, left: place.arrow }
                  : { top: -6, left: place.arrow }
            }
          />
        ) : null}
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
