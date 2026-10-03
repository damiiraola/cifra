/**
 * Hosts of the sandbox live preview (server-only). Each preview is served on a
 * dynamic `https://*.grok-sandbox.com` URL, so Better Auth derives the origin
 * from the request host and validates it against this list (wildcard-matched).
 * There is no OAuth client here any more: Cifra only signs in with email +
 * password.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
