import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { sendFeedback } from "@/lib/beta-feedback-api";
import { FEEDBACK_MAX, type FeedbackKind } from "@/lib/beta-feedback";
import { cn } from "@/lib/utils";
import { OPEN_FEEDBACK } from "@/lib/feedback-events";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";


const KINDS: { id: FeedbackKind; label: string }[] = [
  { id: "problema", label: "Algo anda mal" },
  { id: "idea", label: "Una idea" },
  { id: "comentario", label: "Otra cosa" },
];

export function FeedbackSheet() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("problema");
  const [message, setMessage] = useState("");
  const [contactOk, setContactOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const page = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_FEEDBACK, on);
    return () => window.removeEventListener(OPEN_FEEDBACK, on);
  }, []);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <form
          className="grid gap-4 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void sendFeedback({ data: { kind, message, page, contactOk } })
              .then(({ result }) => {
                if (result === "vacio") return void toast.error("Escribí algo antes de mandar.");
                if (result === "tope")
                  return void toast.error("Ya mandaste muchos hoy. Gracias, mañana seguimos.");
                toast.success("¡Gracias! Lo leemos todo.");
                setMessage("");
                setOpen(false);
              })
              .catch(() => toast.error("No se pudo mandar. Probá de nuevo en un rato."))
              .finally(() => setBusy(false));
          }}
        >
          <div>
            <DrawerTitle>Contanos</DrawerTitle>
            <DrawerDescription className="mt-1">
              Cifra está en beta. Si algo falla, confunde o te falta, escribinos acá.
            </DrawerDescription>
          </div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Qué querés contar">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                aria-pressed={kind === k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  "min-h-11 rounded-lg px-2 text-sm font-medium",
                  kind === k.id ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="sr-only">Tu mensaje</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={FEEDBACK_MAX}
              rows={5}
              required
              placeholder={
                kind === "problema"
                  ? "Qué hiciste, qué esperabas y qué pasó. No pongas contraseñas ni números de tarjeta."
                  : "Contanos. No pongas contraseñas ni números de tarjeta."
              }
              className="w-full resize-none rounded-lg bg-elevated px-3 py-2.5 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] placeholder:text-subtle"
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-muted">
            <input
              type="checkbox"
              className="size-5"
              checked={contactOk}
              onChange={(e) => setContactOk(e.target.checked)}
            />
            Pueden escribirme a mi mail por esto
          </label>
          <p className="text-xs text-subtle">
            Guardamos el mensaje y la pantalla desde donde lo mandás. Se borra si borrás la cuenta.
          </p>
          <Button type="submit" disabled={busy || !message.trim()}>
            {busy ? "Mandando…" : "Mandar"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
