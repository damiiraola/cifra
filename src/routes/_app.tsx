import { useEffect } from "react";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useSessionWait } from "@/lib/auth/use-current-user";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, isPending, timedOut } = useSessionWait();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (isPending || timedOut) return;
    if (!userId) {
      // Keep Better Auth's `?error=` (e.g. an expired confirmation link) so the
      // login screen can explain it.
      const linkError = new URLSearchParams(window.location.search).get("error");
      window.location.replace(linkError ? `/login?error=${encodeURIComponent(linkError)}` : "/login");
    }
  }, [isPending, timedOut, userId]);

  if (isPending && timedOut) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
        <div className="max-w-sm text-center">
          <p className="font-display text-4xl tracking-tight">Cifra</p>
          <p className="mt-3 text-sm text-muted">
            Cifra no responde. Revisá tu conexión y recargá. Si sigue igual, probá en un rato: tus datos
            están guardados.
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Recargar
          </Button>
        </div>
      </div>
    );
  }

  if (isPending || !user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-fg">
        <div className="text-center">
          <p className="font-display text-4xl tracking-tight">Cifra</p>
          <div className="mx-auto mt-4 h-1.5 w-24 animate-pulse rounded-full bg-elevated" />
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
