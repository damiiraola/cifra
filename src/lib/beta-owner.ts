/**
 * Who may open /panel: the same verified owner as /costos. Locally (PGLite, no
 * DATABASE_URL, not production) `DEV_OWNER_EMAIL` stands in for the owner so the
 * page can be tried without mail; it is ignored anywhere with a real database.
 */
import { isOwner } from "./ai-cost.ts";

export function isBetaOwner(
  email: unknown,
  verified: unknown,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (isOwner(email, verified)) return true;
  const dev = env.DEV_OWNER_EMAIL?.trim().toLowerCase();
  if (!dev || env.DATABASE_URL?.trim() || env.NODE_ENV === "production" || env.VERCEL) return false;
  return (
    String(email ?? "")
      .trim()
      .toLowerCase() === dev
  );
}
