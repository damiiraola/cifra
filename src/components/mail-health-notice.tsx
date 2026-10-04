import { useEffect, useState } from "react";
import { getMailHealth } from "@/lib/mail-health";

/**
 * Shown under "revisá tu mail": if sending mails is failing right now, say so
 * instead of letting the user wait for a mail that is not coming.
 */
export function MailHealthNotice() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let alive = true;
    // Give the send that just happened a moment to be recorded.
    const t = window.setTimeout(() => {
      void getMailHealth()
        .then((r) => alive && setDown(!r.ok))
        .catch(() => undefined);
    }, 1500);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, []);
  if (!down) return null;
  return (
    <p role="alert" className="rounded-xl bg-elevated px-3 py-2.5 text-sm text-warn">
      Ahora mismo no estamos pudiendo mandar mails, así que puede que este no llegue. Probá de nuevo en un rato o
      escribinos a hola@cifra.lol.
    </p>
  );
}
