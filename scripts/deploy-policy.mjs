// @ts-check
/**
 * What a build is allowed to do, by environment. Pure, so it can be tested.
 *
 * Vercel sets VERCEL_ENV to "production", "preview" or "development" on its
 * builds (unset elsewhere: local, GitHub Actions without `vercel build`).
 *
 * - Migrations: only production builds touch the database. Preview has its
 *   own database (Neon project "cifra-preview", separate from Production's;
 *   checked on 8 oct 2026), but previews still skip migrations unless
 *   MIGRATE_ON_PREVIEW=1 is set in the Preview environment, so the preview
 *   database can lack the newest tables (e.g. ai_call_log).
 * - Tests: production builds run the unit tests first; a failing test fails
 *   the build, and Vercel keeps serving the previous deployment.
 */

/** @param {Record<string, string | undefined>} env */
export function migrationDecision(env) {
  const vercelEnv = String(env.VERCEL_ENV ?? "").trim();
  if (!String(env.DATABASE_URL ?? "").trim()) {
    return { run: false, reason: "DATABASE_URL not set — skipping (the PGLite fallback migrates itself)." };
  }
  if (vercelEnv && vercelEnv !== "production" && env.MIGRATE_ON_PREVIEW !== "1") {
    return {
      run: false,
      reason:
        `VERCEL_ENV=${vercelEnv} — skipping: only production builds migrate the database ` +
        "(set MIGRATE_ON_PREVIEW=1 once Preview has its own DATABASE_URL).",
    };
  }
  return { run: true, reason: "" };
}

/** @param {Record<string, string | undefined>} env */
export function shouldRunTestsBeforeBuild(env) {
  if (env.SKIP_BUILD_TESTS === "1") return false;
  return String(env.VERCEL_ENV ?? "").trim() === "production";
}
