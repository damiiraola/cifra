/**
 * Set while a sign-out (or a deleted account) is sending this tab somewhere.
 * The app layout also redirects to /login when the session disappears; without
 * this flag its redirect could land after ours and drop the destination's query
 * (`/login?cuenta=borrada` ended up as plain `/login`).
 */
let leaving = false;

export function markLeaving() {
  leaving = true;
}

export function clearLeaving() {
  leaving = false;
}

export function isLeaving() {
  return leaving;
}
