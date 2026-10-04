/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * Cifra only signs people in with email + password, stored in its own user DB
 * (see `./email-password`). There are no external logins: no Google, no X, no
 * Grok broker / generic OAuth. The app runs its own Better Auth at
 * `/api/auth/*`, so the session cookie stays on this app's own origin.
 *
 * Modes:
 *   - Deployed: `BETTER_AUTH_URL` + `BETTER_AUTH_SECRET` + `DATABASE_URL`, so
 *     users and sessions are persisted in Postgres (Neon).
 *   - Local / sandbox preview: no database configured -> the embedded PGLite DB
 *     (same DB as app data); a process restart wipes it. The preview runs in an
 *     iframe with partitioned cookies, so there the client keeps the session as
 *     a bearer token (see `client.ts`).
 *   - Off (`VITE_AUTH_ENABLED=false`): `requireUserId` resolves a dev user with
 *     no database configured, and throws fail-closed once `DATABASE_URL` is set
 *     (see `verify.server.ts`).
 *
 * NEVER import this from client code — it pulls in `pg` + the preview secret +
 * server-only Better Auth internals. The client uses `@/lib/auth/client`;
 * components read the user via `@/lib/auth/use-current-user`; server functions get
 * a verified id via `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled, emailPasswordOptions, emailVerificationOptions } from "./email-password";
import { pgliteDialect } from "./pglite-dialect";
import { authOrigins } from "./origins";

// Kick (and share) PGLite bootstrap as soon as the auth server module loads.
void ensureDbReady();

/**
 * Preview secret must outlive module reloads: PGLite (and its session rows) is
 * stored on `globalThis`, so an HMR re-eval of this file must NOT mint a new
 * signing secret or every existing session becomes invalid mid-dev. Process
 * restart clears both the secret and PGLite together.
 */
const globalAuthRef = globalThis as typeof globalThis & {
  __grokAuthPreviewSecret__?: string;
};
function previewAuthSecret(): string {
  globalAuthRef.__grokAuthPreviewSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__grokAuthPreviewSecret__;
}

/** Read an env var, treating empty/whitespace as unset. */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

// Explicit off-switch. Deploys set `VITE_AUTH_ENABLED=true`; set it to "false"
// to force auth off everywhere (dev user).
const authDisabled = env("VITE_AUTH_ENABLED") === "false";

/** True when sign-in is active (real auth is enforced). */
export const authConfigured = !authDisabled;

// This app's own Better Auth origin. When deployed the deployer injects the
// public URL. In the sandbox live preview there's no fixed URL (each preview gets
// a dynamic `*.grok-sandbox.com` host), so we hand Better Auth a dynamic baseURL:
// it derives the origin per-request from the (proxied) host, validated against the
// allowlist below, so verification / reset links point at the host in use.
const explicitBaseURL = env("BETTER_AUTH_URL")?.replace(/\/+$/, "");
// Explicit `string[]` (not a readonly tuple) — Better Auth's DynamicBaseURLConfig
// requires a mutable `allowedHosts: string[]`.
// Who may call the auth API, and which hosts the dynamic base URL may come
// from. Only cifra.lol + this deployment's own Vercel URLs (+ local dev and the
// sandbox preview outside production). See `./origins`.
const origins = authOrigins(process.env);
const baseURL = explicitBaseURL ?? {
  allowedHosts: origins.allowedHosts,
  protocol: "auto" as const,
  fallback: "http://localhost:8080",
};
const trustedOrigins: string[] = origins.trustedOrigins;

const databaseUrl = env("DATABASE_URL");

// Real Postgres when `DATABASE_URL` is set (deployed apps), else the app's
// embedded PGLite (preview) via a Kysely dialect — so Better Auth persists to the
// SAME DB as app data. Both use the Better Auth schema from
// `migrations/0001_auth.sql`. The `account` table stays: email/password users
// keep their hashed password there (providerId "credential"); older rows from
// the removed external logins are left untouched.
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Session token cookie name. */
export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

export const auth = betterAuth({
  baseURL,
  // Deployed apps inject BETTER_AUTH_SECRET. Preview: process-stable secret on
  // globalThis so HMR doesn't invalidate PGLite-backed sessions (see above).
  secret: env("BETTER_AUTH_SECRET") ?? previewAuthSecret(),
  database,

  // CSRF / origin check for credentialed auth POSTs (email sign-up/sign-in, …).
  // See `trustedOrigins` construction above — must cover live preview hosts AND
  // local loopback variants, or clients get "Invalid origin".
  trustedOrigins,

  // Cache the session in the short-lived signed `session_data` cookie so reads
  // (incl. the client's `/get-session`) skip the DB — this shrinks the "loading"
  // window and reduces auth flicker. See the `auth` skill for the full
  // flicker-prevention guidance (gate on `isPending`; SSR the session).
  session: { cookieCache: { enabled: true, maxAge: 300 } },

  // Limit of attempts, stored in Postgres (table "rateLimit", migration 0009)
  // so every Vercel instance shares the same counters. On by default in
  // production; `AUTH_RATE_LIMIT=1` turns it on locally to try it.
  rateLimit: {
    enabled: process.env.NODE_ENV === "production" || env("AUTH_RATE_LIMIT") === "1",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 600, max: 5 },
      "/request-password-reset": { window: 600, max: 3 },
      "/reset-password": { window: 600, max: 5 },
      "/send-verification-email": { window: 600, max: 3 },
      // Read-only and called on every screen; not worth a DB write each time.
      "/get-session": false,
    },
  },

  // Local email/password + verification / reset mail (see `./email-password`).
  ...(emailAndPasswordEnabled
    ? { emailAndPassword: emailPasswordOptions, emailVerification: emailVerificationOptions }
    : {}),

  // Better Auth swallows some failures (e.g. a reset/verification mail that
  // could not be sent) and only logs them. Keep the log, and also send errors
  // to Sentry when SENTRY_DSN is set.
  logger: {
    level: "warn",
    log: (level, message, ...args) => {
      const line = `[auth] ${message}`;
      if (level === "error") {
        console.error(line, ...args);
        const cause = args.find((a) => a instanceof Error);
        // Mail failures are already reported where they happen (mail.ts).
        if (cause && /mail|RESEND/i.test(cause.message)) return;
        void import("@/lib/observability.server").then(({ reportServerError }) =>
          reportServerError(cause ?? new Error(message), { where: "auth", message }),
        );
      } else {
        console.warn(line, ...args);
      }
    },
  },

  // `__Host-` prefixed cookies: the browser REFUSES any same-named cookie that
  // carries a `Domain` attribute, so a sibling `*.grok.me` app cannot "toss" a
  // `Domain=.grok.me` session cookie onto this app. `__Host-` requires Secure +
  // Path=/ + no Domain; Better Auth otherwise uses `__Secure-` (which permits
  // Domain), so we drop its auto prefix (`useSecureCookies: false`) and set
  // Secure + the names ourselves. (Browsers allow Secure cookies on
  // `http://localhost`, so local dev still works.)
  advanced: {
    // Vercel sets these to the real client IP; the rate limit keys on it.
    ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"] },
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-grok-auth.session_data" },
      account_data: { name: "__Host-grok-auth.account_data" },
      dont_remember: { name: "__Host-grok-auth.dont_remember" },
    },
  },

  plugins: [
    // Accept `Authorization: Bearer <session-token>` as an alternative to the
    // cookie. Needed for the LIVE PREVIEW: the app runs in an embedded iframe
    // where cookies are partitioned, so after an email sign-in it keeps the
    // session as a bearer token instead (see `client.ts`). The hook only fires
    // when an Authorization header is present, so the cookie path (deployed
    // apps) is unaffected.
    bearer(),

    // Bridges Better Auth's Set-Cookie into TanStack Start responses. MUST be
    // last so it runs after every other plugin's hooks.
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}
