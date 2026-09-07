import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { AuthScreen } from "@/components/auth-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ResetSearch = { token?: string };

export const Route = createFileRoute("/reset")({
  validateSearch: (search: Record<string, unknown>): ResetSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: Reset,
});

function Reset() {
  const { token } = useSearch({ from: "/reset" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("Falta el token. Pedí el mail de nuevo.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (err) {
        setError(err.message || "El enlace venció o es inválido.");
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude cambiar la clave.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthScreen kicker="Este enlace está incompleto.">
        <Link to="/olvide" className="mt-8 block text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
          Pedir uno nuevo
        </Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen kicker="Elegí una clave nueva. Mínimo 8 caracteres.">
      {done ? (
        <div className="mt-8">
          <p className="text-sm">Listo. Ya podés entrar con la clave nueva.</p>
          <Link to="/login" className="mt-6 block text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            Ir a entrar
          </Link>
        </div>
      ) : (
        <form className="mt-8 grid gap-3" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Nueva contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar clave"}
          </Button>
        </form>
      )}
    </AuthScreen>
  );
}
