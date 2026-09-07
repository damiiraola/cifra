import type { ReactNode } from "react";

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
      </div>
    </main>
  );
}
