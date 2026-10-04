import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authClient, authEnabled } from "@/lib/auth/client";
import { useSessionWait } from "@/lib/auth/use-current-user";
import { AuthScreen } from "@/components/auth-screen";
import { MailHealthNotice } from "@/components/mail-health-notice";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_MESSAGES, authErrorMessage, isExpiredLinkError } from "@/lib/auth/errors";

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
  const [checkEmail, setCheckEmail] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const linkError = new URLSearchParams(window.location.search).get("error");
    if (linkError && isExpiredLinkError(linkError.toUpperCase())) {
      setError("El enlace para confirmar la cuenta venció o ya se usó. Entrá con tu mail y clave y te mandamos otro.");
    }
  }, []);

  useEffect(() => {
    if (isPending || !user) return;
    window.location.replace("/");
  }, [isPending, user?.id]);

  if (isPending && timedOut) {
    return (
      <AuthScreen kicker="Cifra no responde. Revisá tu conexión y recargá en un ratito.">
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
          setError(authErrorMessage(err, "No pude crear la cuenta. Probá de nuevo."));
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
        const msg = authErrorMessage(err, AUTH_MESSAGES.wrongCredentials);
        setError(msg);
        if (msg === AUTH_MESSAGES.notVerified) setCheckEmail(true);
        return;
      }
      window.location.replace("/");
    } catch (err) {
      setError(authErrorMessage(err, "No pude entrar. Probá de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: err } = await authClient.sendVerificationEmail({
        email: email.trim(),
        callbackURL: "/",
      });
      if (err) setError(authErrorMessage(err, "No pude reenviar el mail. Probá en un rato."));
      else setNotice("Listo, te lo reenviamos.");
    } catch (err) {
      setError(authErrorMessage(err, "No pude reenviar el mail. Probá en un rato."));
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <AuthScreen kicker="Revisá tu mail. Ahí está el enlace para confirmar la cuenta. Si no llega en unos minutos, mirá en spam.">
        <div className="mt-8 grid gap-3">
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-muted">
              {notice}
            </p>
          ) : null}
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
          <MailHealthNotice />
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen kicker="Entrá para guardar tu libro en tu cuenta. Cada usuario ve solo lo suyo.">
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-elevated p-1">
        <button
          type="button"
          className={`h-11 rounded-lg text-sm font-medium ${mode === "in" ? "bg-surface text-fg" : "text-muted"}`}
          onClick={() => {
            setMode("in");
            setError(null);
          }}
        >
          Entrar
        </button>
        <button
          type="button"
          className={`h-11 rounded-lg text-sm font-medium ${mode === "up" ? "bg-surface text-fg" : "text-muted"}`}
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
          <PasswordInput
            id="password"
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
          />
        </div>
        {mode === "in" ? (
          <Link
            to="/olvide"
            className="inline-flex min-h-11 items-center self-start text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Olvidé la contraseña
          </Link>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="mt-1 w-full" disabled={busy || !authEnabled}>
          {busy ? "Un segundo…" : mode === "up" ? "Crear cuenta" : "Entrar"}
        </Button>
        {mode === "up" ? (
          <p className="text-center text-xs text-subtle">
            Al crear la cuenta, Cifra guarda tu mail y el libro.{" "}
            <Link to="/privacidad" className="-my-3.5 inline-block py-3.5 underline-offset-4 hover:text-muted hover:underline">
              Privacidad
            </Link>
            .
          </p>
        ) : null}
      </form>
    </AuthScreen>
  );
}
