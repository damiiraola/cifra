import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidad")({
  component: Privacidad,
});

function Privacidad() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-16 text-fg">
      <Link to="/login" className="text-xs tracking-wide text-muted uppercase">
        Cifra
      </Link>
      <h1 className="mt-3 font-display text-4xl tracking-tight">Privacidad</h1>
      <p className="mt-2 text-sm text-muted">Corto y en criollo. Qué se guarda y cómo se borra.</p>

      <section className="mt-8 grid gap-6 text-sm leading-relaxed text-fg">
        <div>
          <h2 className="font-medium">Qué se guarda</h2>
          <p className="mt-1 text-muted">
            Mail, nombre, movimientos, fijos, cajas, presupuestos, categorías y cotizaciones. El
            asistente, si lo usás, recibe un resumen del mes — no el historial completo.
          </p>
        </div>
        <div>
          <h2 className="font-medium">Dónde</h2>
          <p className="mt-1 text-muted">
            El libro vive en Neon (Postgres). Los mails de confirmar cuenta y cambiar clave los
            manda Resend. El asistente consulta a Grok. Un respaldo diario queda 30 días, atado a
            tu mail.
          </p>
        </div>
        <div>
          <h2 className="font-medium">Qué no hacemos</h2>
          <p className="mt-1 text-muted">
            No vendemos datos. No hay publicidad. No hay tracking de terceros. Otro mail es otro
            libro: no se mezclan.
          </p>
        </div>
        <div>
          <h2 className="font-medium">Cómo salir</h2>
          <p className="mt-1 text-muted">
            En Ajustes podés exportar CSV o JSON, o borrar la cuenta. Borrar cuenta elimina
            movimientos, fijos, respaldos y el login. No hay vuelta atrás.
          </p>
        </div>
      </section>

      <p className="mt-10 text-xs text-subtle">Cifra · libro de gastos</p>
    </main>
  );
}
