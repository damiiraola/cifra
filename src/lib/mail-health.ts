import { createServerFn } from "@tanstack/react-start";

/**
 * Public, no login: only says whether Cifra's mail sending works right now.
 * Says nothing about any account, so it can be shown on "revisá tu mail" and
 * "te mandamos el enlace" screens.
 */
export const getMailHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { mailConfigured } = await import("@/lib/mail");
  if (!mailConfigured()) return { ok: false };
  const { readMailHealth } = await import("@/lib/mail-health.server");
  return readMailHealth();
});
