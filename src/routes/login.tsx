import { useState, type FormEvent } from "react";
import { Navigate, createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useSessionWait } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const { user, isPending, timedOut } = useSessionWait();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onGrok =
    typeof window !== "undefined" && window.location.hostname.endsWith(".grok-sandbox.com");

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "up") {
        const { error: err } = await authClient.signUp.email({
          name: name.trim() || email.split("@")[0] || "Cifra",
          email: email.trim(),
          password,
          callbackURL: "/",
        });
        if (err) {
          setError(err.message || "No pude crear la cuenta.");
          return;
        }
      } else {
        const { error: err } = await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: "/",
        });
        if (err) {
          setError(err.message || "Mail o contraseña incorrectos.");
          return;
        }
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude entrar. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm">
        <p className="font-display text-5xl tracking-tight">Cifra</p>
        <p className="mt-2 text-sm text-muted">
          Entrá para guardar tu libro en tu cuenta. Cada usuario ve solo lo suyo.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-elevated p-1">
          <button
            type="button"
            className={`h-9 rounded-lg text-sm font-medium ${mode === "in" ? "bg-surface text-fg" : "text-muted"}`}
            onClick={() => {
              setMode("in");
              setError(null);
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`h-9 rounded-lg text-sm font-medium ${mode === "up" ? "bg-surface text-fg" : "text-muted"}`}
            onClick={() => {
              setMode("up");
              setError(null);
            }}
          >
            Crear cuenta
          </button>
        </div>

        <form className="mt-5 grid gap-3" onSubmit={(e) => void onSubmit(e)}>
          {mode === "up" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cómo te llamás"
              />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="email">Mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@mail.com"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="submit" className="mt-1 w-full" disabled={busy || !authEnabled}>
            {busy ? "Un segundo…" : mode === "up" ? "Crear cuenta" : "Entrar"}
          </Button>
        </form>

        {onGrok && authEnabled ? (
          <div className="mt-8 grid gap-2">
            <p className="text-center text-[11px] tracking-wide text-muted uppercase">o continuar con</p>
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continuar con {p.label}
              </Button>
            ))}
          </div>
        ) : null}

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
