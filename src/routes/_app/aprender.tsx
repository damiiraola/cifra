import { Link, createFileRoute } from "@tanstack/react-router";
import { lessonSet } from "@/lib/lessons";
import { useLedger } from "@/lib/store";

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
        <h1 className="font-display text-4xl tracking-tight">Aprender</h1>
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
      <Link to="/ia" className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
        Preguntarle al asistente con mis números
      </Link>
    </div>
  );
}
