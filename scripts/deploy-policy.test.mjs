import { test } from "node:test";
import assert from "node:assert/strict";
import { migrationDecision, shouldRunTestsBeforeBuild } from "./deploy-policy.mjs";

const URL = "postgres://u:p@host/db";

test("only production builds migrate", () => {
  assert.equal(migrationDecision({ DATABASE_URL: URL, VERCEL_ENV: "production" }).run, true);
  assert.equal(migrationDecision({ DATABASE_URL: URL, VERCEL_ENV: "preview" }).run, false);
  assert.equal(migrationDecision({ DATABASE_URL: URL, VERCEL_ENV: "development" }).run, false);
  assert.match(migrationDecision({ DATABASE_URL: URL, VERCEL_ENV: "preview" }).reason, /only production/);
});

test("preview can opt in once it has its own database", () => {
  assert.equal(migrationDecision({ DATABASE_URL: URL, VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "1" }).run, true);
});

test("no DATABASE_URL never migrates; outside Vercel it does (manual npm run db:migrate)", () => {
  assert.equal(migrationDecision({ VERCEL_ENV: "production" }).run, false);
  assert.equal(migrationDecision({ DATABASE_URL: "  " }).run, false);
  assert.equal(migrationDecision({ DATABASE_URL: URL }).run, true);
});

test("tests run before production builds only", () => {
  assert.equal(shouldRunTestsBeforeBuild({ VERCEL_ENV: "production" }), true);
  assert.equal(shouldRunTestsBeforeBuild({ VERCEL_ENV: "preview" }), false);
  assert.equal(shouldRunTestsBeforeBuild({}), false);
  assert.equal(shouldRunTestsBeforeBuild({ VERCEL_ENV: "production", SKIP_BUILD_TESTS: "1" }), false);
});
