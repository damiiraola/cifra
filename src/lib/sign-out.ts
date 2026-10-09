import { signOut } from "@/lib/auth/client";
import { clearAllDrafts } from "@/lib/statement-draft";
import { forgetLocalLedger, useLedger } from "@/lib/store";
import { forgetSeenTours } from "@/lib/tours";

/**
 * What else this device keeps about the user: the old tour keys with the mail
 * in clear and any PDF review left open. With `email` (account deleted) also
 * that account's tour key.
 */
export function forgetDevice(email?: string) {
  try {
    const s = window.localStorage;
    forgetSeenTours(s, email);
    clearAllDrafts(s);
  } catch {
    /* storage blocked: nothing to forget */
  }
}

/**
 * Sign out and wipe this browser's copy of the ledger.
 *
 * 1. Try to upload anything still waiting (movements/fijos saved offline).
 * 2. If something could not be uploaded, ask before throwing it away.
 * 3. Sign out on the server; only when that worked, clear local storage.
 *
 * Resolves `false` when the user chose to stay; rejects if the server did not
 * confirm the sign-out (callers show "No pude cerrar sesión").
 */
export async function signOutAndForget(redirectTo = "/login"): Promise<boolean> {
  const store = useLedger.getState();
  try {
    await Promise.all([store.flushOutbox({ force: true }), store.flushRecurrings({ force: true })]);
  } catch {
    /* counted below */
  }
  const now = useLedger.getState();
  const waiting = now.outbox.length + now.pendingRecurringIds.length;
  if (
    waiting > 0 &&
    !window.confirm(
      `Hay ${waiting === 1 ? "1 cambio que no se subió" : `${waiting} cambios que no se subieron`} todavía. ` +
        "Si cerrás sesión ahora se pierden de este dispositivo. ¿Cerrar sesión igual?",
    )
  ) {
    return false;
  }
  await signOut(redirectTo);
  forgetDevice();
  forgetLocalLedger();
  return true;
}
