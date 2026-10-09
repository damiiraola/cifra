import { useEffect } from "react";
import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useSessionWait } from "@/lib/auth/use-current-user";
import { isLeaving } from "@/lib/auth/leaving";
import { sessionHint } from "@/lib/auth/session-hint";
import { signedOutView } from "@/lib/auth/signed-out-view";
import { Landing } from "@/components/landing";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app")({
  // Only on the server render: whether there is a session cookie at all, so a
  // visitor gets the front page in the HTML instead of a loading screen.
  loader: async () => (typeof window === "undefined" ? await sessionHint() : { hasCookie: null }),
  component: AppLayout,
});

function AppLayout() {
  const { user, isPending, timedOut } = useSessionWait();
  const userId = user?.id ?? null;
  const path = useLocation({ select: (l) => l.pathname });
  const { hasCookie } = Route.useLoaderData();
  const view = userId ? null : signedOutView({ path, isPending, hasCookie });
  // Better Auth's `?error=` (e.g. an expired confirmation link) always goes to
  // /login, which explains it. Read from the router so the server agrees.
  const linkError = useLocation({ select: (l) => new URLSearchParams(l.searchStr).has("error") });

  useEffect(() => {
    if (isPending || timedOut) return;
    // A sign-out or account deletion is already taking this tab to its own page.
    if (isLeaving()) return;
    if (!userId && (view !== "landing" || linkError)) {
      const error = new URLSearchParams(window.location.search).get("error");
      window.location.replace(error ? `/login?error=${encodeURIComponent(error)}` : "/login");
    }
  }, [isPending, timedOut, userId, view, linkError]);

  if (view === "landing" && !linkError) return <Landing focus={path === "/ia" ? "asistente" : undefined} />;

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
