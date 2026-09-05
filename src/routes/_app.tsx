import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, isPending } = useCurrentUserState();

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
