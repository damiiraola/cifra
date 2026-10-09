/**
 * What `/` (and `/ia`) show to someone without a user:
 * - "landing": the public front page;
 * - "wait": still resolving the session, show the loading screen;
 * - "login": somewhere else in the app, go to /login (as before).
 * `hasCookie` is the server's hint (false = surely a visitor), null when unknown
 * (client-side navigation). A user who shows up later (e.g. a bearer session in
 * the live preview) always wins: the caller checks `user` first.
 */
export function signedOutView(input: {
  path: string;
  isPending: boolean;
  hasCookie: boolean | null;
}): "landing" | "wait" | "login" {
  const publicPath = input.path === "/" || input.path === "/ia";
  if (!publicPath) return input.isPending ? "wait" : "login";
  if (input.hasCookie === false) return "landing";
  return input.isPending ? "wait" : "landing";
}
