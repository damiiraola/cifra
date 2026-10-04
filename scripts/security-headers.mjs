/**
 * Security headers for every response (HTML, assets, server functions).
 * Wired in vite.config.ts as a Vercel route (`continue: true`) that ends up in
 * `.vercel/output/config.json`.
 *
 * The app only talks to itself; the only third parties are Google Fonts,
 * Sentry (errors, if SENTRY_DSN is set) and the optional grok.com extensions
 * script (off unless VITE_GROK_EXTENSIONS=1). Inline scripts/styles are needed by the
 * TanStack Start hydration payload and the PWA head tags.
 */
import { GROK_EXTENSIONS_SCRIPT_SRC, readGrokExtensionsEnabled } from "./grok-pwa-shared.mjs";

export function contentSecurityPolicy({ grokExtensions = false } = {}) {
  const grok = grokExtensions ? ` ${new URL(GROK_EXTENSIONS_SCRIPT_SRC).origin}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${grok}`,
    // Google Fonts (Instrument Serif + Outfit, imported in src/styles.css).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io${grok}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function securityHeaders(opts = { grokExtensions: readGrokExtensionsEnabled() }) {
  return {
    "Content-Security-Policy": contentSecurityPolicy(opts),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  };
}
