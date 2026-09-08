import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useSessionWait } from "@/lib/auth/use-current-user";
import { AuthScreen } from "@/components/auth-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: Login,
});

function spanishAuthError(message: string | undefined, fallback: string): string {
  const raw = (message ?? "").toLowerCase();
  if (raw.includes("invalid origin")) return "URL pública mal configurada (BETTER_AUTH_URL).";
  if (raw.includes("not verified") || raw.includes("email_not_verified")) {
    return "Confirmá el mail primero. Te reenviamos el enlace si hace falta.";
  }
  if (raw.includes("already exists") || raw.includes("user already")) return "Ese mail ya tiene cuenta. Entrá o recuperá la clave.";
  if (raw.includes("invalid") && raw.includes("password")) return "Mail o contraseña incorrectos.";
  return message || fallback;
}

function Login() {
  const { user, isPending, timedOut } = useSessionWait();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const onGrok =
    typeof window !== "undefined" && window.location.hostname.endsWith(".grok-sandbox.com");

  useEffect(() => {
    if (isPending || !user) return;
    window.location.replace("/");
  }, [isPending, user?.id]);

  if (isPending && timedOut) {
    return (
      <AuthScreen kicker="La sesión no responde. En Vercel falta DATABASE_URL o BETTER_AUTH_URL.">
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Recargar
        </Button>
      </AuthScreen>
    );
  }
  if (isPending || user) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg text-fg">
        <div className="h-10 w-28 animate-pulse rounded-lg bg-elevated" />
      </main>
    );
  }

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
          setError(spanishAuthError(err.message, "No pude crear la cuenta."));
          return;
        }
        const session = await authClient.getSession();
        if (session.data?.user) {
          window.location.replace("/");
          return;
        }
        setCheckEmail(true);
        return;
      }
      const { error: err } = await authClient.signIn.email({
        email: email.trim(),
        password,
        callbackURL: "/",
      });
      if (err) {
        const msg = spanishAuthError(err.message, "Mail o contraseña incorrectos.");
        setError(msg);
        if (msg.includes("Confirmá el mail")) setCheckEmail(true);
        return;
      }
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude entrar. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.sendVerificationEmail({
        email: email.trim(),
        callbackURL: "/",
      });
      if (err) setError(spanishAuthError(err.message, "No pude reenviar el mail."));
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <AuthScreen kicker="Revisá tu mail. Ahí está el enlace para confirmar la cuenta. Si no llega, spam.">
        <div className="mt-8 grid gap-3">
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="button" variant="secondary" disabled={busy || !email} onClick={() => void resend()}>
            {busy ? "Enviando…" : "Reenviar confirmación"}
          </Button>
          <button
            type="button"
            className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
            onClick={() => {
              setCheckEmail(false);
              setMode("in");
            }}
          >
            Ya confirmé — entrar
          </button>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen kicker="Entrá para guardar tu libro en tu cuenta. Cada usuario ve solo lo suyo.">
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
        {mode === "in" ? (
          <Link to="/olvide" className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            Olvidé la contraseña
          </Link>
        ) : null}
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
    </AuthScreen>
  );
}
