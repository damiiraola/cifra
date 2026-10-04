import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const detail = error instanceof Error ? error.message : "";
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
      <div className="max-w-sm">
        <TriangleAlert className="mx-auto size-8 text-expense" strokeWidth={2} />
        <h1 className="mt-4 font-display text-3xl tracking-tight">Cifra se trabó</h1>
        <p className="mt-2 text-sm text-muted">
          Recargá la página. Si sigue pasando, cerrá sesión y volvé a entrar. Lo que ya cargaste no se pierde.
        </p>
        <button
          type="button"
          className="mt-6 h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg"
          onClick={() => window.location.reload()}
        >
          Recargar
        </button>
        {detail ? (
          <details className="mt-6 text-left text-xs text-muted">
            <summary className="cursor-pointer">Detalle técnico (para mandarle a soporte)</summary>
            <p className="mt-2 break-words">{detail}</p>
          </details>
        ) : null}
      </div>
    </main>
  );
}

/** Shown for any URL that does not match a route. */
export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
      <div className="max-w-sm">
        <p className="font-display text-4xl tracking-tight">Cifra</p>
        <h1 className="mt-6 text-lg font-medium">Esta página no existe</h1>
        <p className="mt-2 text-sm text-muted">Puede que el enlace esté mal escrito o que la página se haya movido.</p>
        <a
          href="/"
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-medium text-accent-fg"
        >
          Ir al inicio
        </a>
      </div>
    </main>
  );
}
