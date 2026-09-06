import { Navigate, createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useSessionWait } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const { user, isPending, timedOut } = useSessionWait();
  if (isPending && timedOut) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
        <div className="max-w-sm text-center">
          <p className="font-display text-4xl tracking-tight">Cifra</p>
          <p className="mt-3 text-sm text-muted">
            El login no arranca. Falta Neon (<span className="text-fg">DATABASE_URL</span>) o la URL pública (
            <span className="text-fg">BETTER_AUTH_URL</span>).
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Recargar
          </Button>
        </div>
      </main>
    );
  }
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg text-fg">
        <div className="h-10 w-28 animate-pulse rounded-lg bg-elevated" />
      </main>
    );
  }
  if (user) return <Navigate to="/" />;

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm">
        <p className="font-display text-5xl tracking-tight">Cifra</p>
        <p className="mt-2 text-sm text-muted">
          Entrá para guardar tu libro en tu cuenta. Cada usuario ve solo lo suyo.
        </p>
        <div className="mt-8 grid gap-2">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continuar con {p.label}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted">El acceso con cuenta está desactivado.</p>
          )}
        </div>
        <Link
          to="/beta"
          className="mt-6 block text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Definir la beta — 20 toques
        </Link>
      </div>
    </main>
  );
}
