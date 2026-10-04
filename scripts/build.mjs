#!/usr/bin/env node
/**
 * `npm run build`: what Vercel runs on every deploy.
 *
 * 1. Production only: typecheck + unit tests. If anything fails the build
 *    fails, and Vercel keeps the previous deployment online.
 * 2. `vite build` (through with-app-env, as before).
 * 3. Database migrations — production only (see ./deploy-policy.mjs).
 */
import { spawnSync } from "node:child_process";
import { shouldRunTestsBeforeBuild } from "./deploy-policy.mjs";

/** @param {string} cmd @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env });
  if (r.status !== 0) {
    console.error(`[build] "${[cmd, ...args].join(" ")}" failed — stopping the deploy.`);
    process.exit(r.status ?? 1);
  }
}

if (shouldRunTestsBeforeBuild(process.env)) {
  console.log("[build] production: typecheck + tests before building");
  // Tests run like in CI: without the deploy's app/database variables (some
  // tests check the defaults, and no test should ever reach a real database).
  const testEnv = { ...process.env };
  for (const key of Object.keys(testEnv)) {
    if (/^(VITE_|DATABASE_URL|POSTGRES_|PG[A-Z]+$|RESEND_|XAI_|SENTRY_|BETTER_AUTH_)/.test(key)) delete testEnv[key];
  }
  run("npm", ["run", "typecheck"]);
  run("npm", ["test"], testEnv);
}
run("node", ["scripts/with-app-env.mjs", "vite", "build"]);
run("npm", ["run", "db:migrate"]);
