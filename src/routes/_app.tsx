import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useSessionWait } from "@/lib/auth/use-current-user";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, isPending, timedOut } = useSessionWait();

  if (isPending && timedOut) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
        <div className="max-w-sm text-center">
          <p className="font-display text-4xl tracking-tight">Cifra</p>
          <p className="mt-3 text-sm text-muted">
            La sesión no responde. En Vercel falta <span className="text-fg">DATABASE_URL</span> (Neon) o{" "}
            <span className="text-fg">BETTER_AUTH_URL</span> (tu URL pública). Pegá esas variables, redeploy, y recargá.
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Recargar
          </Button>
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-fg">
        <div className="text-center">
          <p className="font-display text-4xl tracking-tight">Cifra</p>
          <div className="mx-auto mt-4 h-1.5 w-24 animate-pulse rounded-full bg-elevated" />
        </div>
      </div>
    );
  }

  if (!user) return <RedirectToSignIn />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
