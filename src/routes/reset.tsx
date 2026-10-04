import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { AuthScreen } from "@/components/auth-screen";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_MESSAGES, authErrorMessage, isExpiredLinkError } from "@/lib/auth/errors";

// Better Auth sends people here as `/reset?token=…`, or `/reset?error=INVALID_TOKEN`
// when the link from the mail already expired.
type ResetSearch = { token?: string; error?: string };

export const Route = createFileRoute("/reset")({
  validateSearch: (search: Record<string, unknown>): ResetSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: Reset,
});

function ExpiredLink() {
  return (
    <AuthScreen kicker={AUTH_MESSAGES.linkExpired}>
      <p className="mt-6 text-sm text-muted">Los enlaces para cambiar la clave duran un rato y sirven una sola vez.</p>
      <Link
        to="/olvide"
        className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-fg"
      >
        Pedí uno nuevo
      </Link>
      <Link to="/login" className="mt-4 block text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
        Volver a entrar
      </Link>
    </AuthScreen>
  );
}

function Reset() {
  const { token, error: linkError } = useSearch({ from: "/reset" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (err) {
        if (isExpiredLinkError(err)) setExpired(true);
        else setError(authErrorMessage(err, "No pude cambiar la clave. Probá de nuevo."));
        return;
      }
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(err, "No pude cambiar la clave. Probá de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  // Any `?error=` from Better Auth here means the mail link is no good anymore.
  if (expired || linkError) return <ExpiredLink />;

  if (!token) {
    return (
      <AuthScreen kicker="A este enlace le falta una parte. Abrilo de nuevo desde el mail o pedí uno nuevo.">
        <Link
          to="/olvide"
          className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-fg"
        >
          Pedí uno nuevo
        </Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen kicker="Elegí una clave nueva. Mínimo 8 caracteres.">
      {done ? (
        <div className="mt-8">
          <p role="status" className="text-sm">
            Listo. Ya podés entrar con la clave nueva.
          </p>
          <Link
            to="/login"
            className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-fg"
          >
            Entrar
          </Link>
        </div>
      ) : (
        <form className="mt-8 grid gap-3" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Nueva contraseña</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar clave"}
          </Button>
        </form>
      )}
    </AuthScreen>
  );
}
