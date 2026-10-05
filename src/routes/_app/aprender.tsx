import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lessonSet } from "@/lib/lessons";
import { TOURS, replayTour, type Tour } from "@/lib/tours";
import { useLedger } from "@/lib/store";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/aprender")({
  component: Aprender,
});

function Aprender() {
  const cap = useLedger((s) => s.globalBudget);
  const lessons = lessonSet(cap);

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Educación</p>
        <h1 data-tour="titulo" className="font-display text-4xl tracking-tight">Aprender</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Para quien nunca anotó la plata. Una idea por vez. Si algo no cierra, el asistente lo
          explica con los números de este libro.
        </p>
      </div>
      <div className="grid gap-3">
        {lessons.map((l, i) => (
          <details
            key={l.id}
            id={l.id}
            open={i === 0}
            className="rounded-3xl bg-surface px-5 py-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]"
          >
            <summary className="cursor-pointer text-sm font-medium text-fg">
              {i + 1}. {l.title}
            </summary>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{l.body}</p>
          </details>
        ))}
      </div>
      <section data-tour="recorridos" className="grid gap-3">
        <div>
          <h2 className="text-sm font-medium">Recorridos</h2>
          <p className="mt-1 text-sm text-muted">La primera vez, cada página se explica sola. Desde acá se ven de nuevo.</p>
        </div>
        <div className="grid gap-2">
          {TOURS.map((tour) => (
            <ReplayRow key={tour.path} tour={tour} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ReplayRow({ tour }: { tour: Tour }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
      <span className="text-sm">{tour.page}</span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          replayTour(tour.path);
          if (tour.path === "/") navigate({ to: "/" });
          else if (tour.path === "/analitica") navigate({ to: "/analitica" });
          else if (tour.path === "/presupuestos") navigate({ to: "/presupuestos" });
          else if (tour.path === "/tarjetas") navigate({ to: "/tarjetas" });
          else if (tour.path === "/ia") navigate({ to: "/ia" });
          else if (tour.path === "/ajustes") navigate({ to: "/ajustes" });
        }}
      >
        Ver
      </Button>
    </div>
  );
}
