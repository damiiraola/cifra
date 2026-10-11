import { useEffect, useState } from "react";
import { joinBetaWaitlist } from "@/lib/beta-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Without an invitation: say so kindly and offer the waiting list. */
export function WaitlistBox({ initialEmail = "", className = "mt-6" }: { initialEmail?: string; className?: string }) {
  const [email, setEmail] = useState(initialEmail);
  // The mail typed in the signup form above, if it arrives after (no overwrite once edited here).
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (!edited) setEmail(initialEmail);
  }, [initialEmail, edited]);
  const [state, setState] = useState<"idle" | "busy" | "ok" | "invalido" | "error">("idle");
  return (
    <section id="lista-de-espera" className={`${className} scroll-mt-6 rounded-xl bg-elevated p-4 text-sm`}>
      <p className="font-medium">¿No tenés invitación?</p>
      <p className="mt-1 text-muted">
        Cifra está en beta cerrada, con un grupo chico. Dejanos tu mail y te avisamos cuando abramos.
      </p>
      {state === "ok" ? (
        <p role="status" className="mt-3 text-fg">
          Listo, te anotamos. Te escribimos cuando haya lugar.
        </p>
      ) : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setState("busy");
            void joinBetaWaitlist({ data: { email } })
              .then(({ result }) => setState(result === "ok" ? "ok" : result === "invalido" ? "invalido" : "error"))
              .catch(() => setState("error"));
          }}
        >
          <Label htmlFor="waitlist-email" className="sr-only">
            Tu mail para la lista de espera
          </Label>
          <Input
            id="waitlist-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEdited(true);
              setEmail(e.target.value);
            }}
            placeholder="vos@mail.com"
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" disabled={state === "busy"}>
            Avisame
          </Button>
        </form>
      )}
      {state === "invalido" ? <p className="mt-2 text-xs text-warn">Ese mail no parece válido. Revisalo.</p> : null}
      {state === "error" ? (
        <p className="mt-2 text-xs text-warn">No pude anotarte ahora. Probá de nuevo en un rato.</p>
      ) : null}
    </section>
  );
}
