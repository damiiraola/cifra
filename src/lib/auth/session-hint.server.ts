import { readSessionToken } from "./server";

/**
 * Server-only (`.server` suffix, see `isolation.server.ts`): whether the request
 * carries a session cookie at all. Only a hint for the first paint of `/`: no
 * cookie means a visitor, so the public front page can be server-rendered
 * instead of a loading screen. A cookie does NOT mean a valid session; the app
 * still waits for `/get-session` before showing anything private.
 */
export function hasSessionCookie(): boolean {
  return Boolean(readSessionToken());
}
