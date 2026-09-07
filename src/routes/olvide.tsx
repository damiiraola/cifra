import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { AuthScreen } from "@/components/auth-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        setError(err.message || "No pude pedir el reset.");
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude pedir el reset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen kicker="Te mandamos un enlace para elegir una clave nueva. Si el mail no existe, no avisamos nada.">
      {sent ? (
        <div className="mt-8">
          <p className="text-sm text-fg">Si ese mail está en Cifra, ya salió el enlace. Revisá spam.</p>
          <Link to="/login" className="mt-6 block text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            Volver a entrar
          </Link>
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
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Enviando…" : "Mandar enlace"}
          </Button>
          <Link to="/login" className="mt-2 block text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            Volver
          </Link>
        </form>
      )}
    </AuthScreen>
  );
}
