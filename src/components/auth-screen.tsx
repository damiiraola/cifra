import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function AuthScreen({
  kicker,
  children,
}: {
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm">
        <p className="font-display text-5xl tracking-tight">Cifra</p>
        {kicker ? <p className="mt-2 text-sm text-muted">{kicker}</p> : null}
        {children}
        <p className="mt-8 text-center text-xs text-subtle">
          <Link to="/privacidad" className="underline-offset-4 hover:text-muted hover:underline">
            Privacidad
          </Link>
          : qué se guarda y cómo se borra.
        </p>
      </div>
    </main>
  );
}
