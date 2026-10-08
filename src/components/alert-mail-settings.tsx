import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAlertMailPrefs, setAlertMailPrefs, type AlertMailPrefs } from "@/lib/alert-mail-api";
import { userMessage } from "@/lib/user-error";
import { Button } from "@/components/ui/button";

/**
 * Opt-in for the alert mails. Hidden while the feature is off in this deploy
 * (no ALERT_MAILS_ENABLED / CRON_SECRET / Resend), so nothing shows in prod
 * until it is turned on.
 */
export function AlertMailSettings({ children }: { children: (body: React.ReactNode) => React.ReactNode }) {
  const [prefs, setPrefs] = useState<AlertMailPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    getAlertMailPrefs()
      .then((p) => live && setPrefs(p))
      .catch(() => live && setPrefs({ available: false, enabled: false }));
    return () => {
      live = false;
    };
  }, []);
  if (!prefs?.available) return null;

  async function toggle() {
    if (!prefs) return;
    setBusy(true);
    try {
      const next = await setAlertMailPrefs({ data: { enabled: !prefs.enabled } });
      setPrefs(next);
      toast.success(next.enabled ? "Listo: te mandamos los avisos importantes por mail" : "Avisos por mail apagados");
    } catch (err) {
      toast.error(userMessage(err, "No pude guardar el cambio"));
    } finally {
      setBusy(false);
    }
  }

  return children(
    <div className="grid gap-3">
      <p className="text-sm text-muted">
        Un mail a la mañana, solo si hay algo importante: un resumen que vence en 5 días o menos, un resumen
        vencido o una meta atrasada. Cada aviso llega una sola vez y todos los mails tienen un enlace para
        darte de baja.
      </p>
      <p className="text-sm">
        Estado: <span className="font-medium">{prefs.enabled ? "activados" : "apagados"}</span>
      </p>
      <Button variant={prefs.enabled ? "secondary" : "default"} disabled={busy} onClick={toggle} aria-pressed={prefs.enabled}>
        {prefs.enabled ? "Apagar avisos por mail" : "Activar avisos por mail"}
      </Button>
    </div>,
  );
}
