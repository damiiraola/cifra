import { createAuthClient } from "better-auth/react";
import { runSignOut } from "../../../scripts/sign-out-plan.mjs";

/**
 * Better Auth client for this React SPA (browser-side). Cifra only signs in
 * with email + password (`authClient.signIn.email` / `signUp.email`).
 *
 * Talks to this app's OWN Better Auth at same-origin `/api/auth/*`. In the live
 * preview the app is an embedded iframe with PARTITIONED cookies, so the
 * session cookie may not stick there — the client keeps the session token the
 * server returns (`set-auth-token`, from the `bearer` plugin) and sends it as a
 * bearer token instead. Deployed (cookie auth) no token is stored, so nothing
 * changes.
 *
 * To sign out call `signOut()` below, NOT `authClient.signOut()`: the raw call
 * leaves the bearer token in place, and `onRequest` keeps re-attaching it, so
 * the visitor stays signed in.
 */
export const authClient = createAuthClient({
  fetchOptions: {
    onRequest(ctx) {
      const token = getBearerToken();
      if (token) ctx.headers.set("Authorization", `Bearer ${token}`);
      return ctx;
    },
    onSuccess(ctx) {
      // Live preview only: keep the session token (partitioned cookies).
      if (!inLivePreview()) return;
      const token = ctx.response.headers.get("set-auth-token");
      if (token) setBearerToken(token);
    },
  },
});

/**
 * True when sign-in UI should be shown — i.e. whenever `VITE_AUTH_ENABLED` is
 * not `"false"`. With `"false"` the app uses the dev user (see
 * `use-current-user`).
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

// ── Live-preview bearer token ────────────────────────────────────────────────
// The embedded preview iframe has partitioned cookies, so we keep the session's
// bearer token in sessionStorage and attach it to every Better Auth request (and
// to server functions, via `@/lib/auth/middleware`). Empty everywhere except the
// preview after an email sign-in, so the cookie path is untouched elsewhere.
const BEARER_KEY = "grok-auth.bearer-token";

/** The stored preview bearer token, or null. */
export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

function setBearerToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(BEARER_KEY, token);
    else window.sessionStorage.removeItem(BEARER_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

/** The sandbox live preview runs this app inside an iframe on a `*.grok-sandbox.com` host. */
function inLivePreview(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".grok-sandbox.com")
  );
}

/**
 * Sign out of THIS app's local session, clear the preview token, then redirect.
 *
 * Use this, never `authClient.signOut()` — see the note on `authClient`.
 * Sequencing lives in `scripts/sign-out-plan.mjs` so it can be unit-tested.
 *
 * **Rejects when deployed if the server never confirms.** There the session is
 * an HttpOnly cookie only the server can clear, so redirecting anyway would
 * report a sign-out that did not happen. `<UserButton />` handles that for you;
 * a hand-rolled control must catch it and let the visitor retry. In the live
 * preview the local clear is sufficient, so it always resolves.
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  await runSignOut({
    livePreview: inLivePreview(),
    hasBearer: Boolean(getBearerToken()),
    // Better Auth resolves with `{ error }` instead of rejecting, so surface a
    // failed response as a rejection for the sequence to act on.
    requestSignOut: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    clearToken: () => setBearerToken(null),
    redirect: () => {
      window.location.href = redirectTo;
    },
  });
}
