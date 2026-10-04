import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Vercel OIDC token for this request. Vercel sends it to every Function as the
 * `x-vercel-oidc-token` header (valid ~12 h); `VERCEL_OIDC_TOKEN` covers builds
 * and `vercel env pull` in local dev. Used to call the AI Gateway without an
 * API key. Never logged.
 */
export function vercelOidcToken(): string | null {
  let header: string | undefined;
  try {
    header = getRequestHeader("x-vercel-oidc-token");
  } catch {
    header = undefined;
  }
  return header?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || null;
}
