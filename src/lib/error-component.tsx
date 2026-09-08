import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
      <div className="max-w-sm">
        <TriangleAlert className="mx-auto size-8 text-expense" strokeWidth={2} />
        <h1 className="mt-4 font-display text-3xl tracking-tight">Cifra se trabó</h1>
        <p className="mt-2 text-sm break-words text-muted">
          {error.message?.startsWith("Minified React error")
            ? "Hubo un bucle al entrar. Recargá; si sigue, salí y volvé a entrar."
            : error.message || "Error inesperado."}
        </p>
        <button
          type="button"
          className="mt-6 h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg"
          onClick={() => window.location.replace("/")}
        >
          Recargar
        </button>
      </div>
    </main>
  );
}
