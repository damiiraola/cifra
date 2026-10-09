import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { AuthScreen } from "@/components/auth-screen";
import { MailHealthNotice } from "@/components/mail-health-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authErrorMessage } from "@/lib/auth/errors";

export const Route = createFileRoute("/olvide")({
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset`,
      });
      if (err) {
        setError(authErrorMessage(err, "No pude pedir el enlace. Probá de nuevo en un rato."));
        return;
      }
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err, "No pude pedir el enlace. Probá de nuevo en un rato."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen kicker="Te mandamos un enlace para elegir una contraseña nueva. Si el mail no existe, no avisamos nada.">
      {sent ? (
        <div className="mt-8">
          <p className="text-sm text-fg">Si ese mail tiene cuenta en Cifra, te mandamos el enlace. Si no llega en unos minutos, mirá en spam.</p>
          <Link to="/login" className="mt-3 block py-3 text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            Volver a entrar
          </Link>
          <div className="mt-4">
            <MailHealthNotice />
          </div>
        </div>
      ) : (
        <form className="mt-8 grid gap-3" onSubmit={(e) => void onSubmit(e)}>
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
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Enviando…" : "Mandar enlace"}
          </Button>
          <Link to="/login" className="mt-1 block py-3 text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            Volver
          </Link>
        </form>
      )}
    </AuthScreen>
  );
}
