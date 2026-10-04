import { test } from "node:test";
import assert from "node:assert/strict";
import { authOrigins } from "./origins.ts";

test("production trusts only cifra.lol and its own deployment URLs", () => {
  const { trustedOrigins, allowedHosts } = authOrigins({
    VERCEL_ENV: "production",
    BETTER_AUTH_URL: "https://cifra.lol",
    VERCEL_URL: "cifra-prpfe-abc123-damians-projects-ef5d899c.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "cifra.lol",
  });
  assert.ok(trustedOrigins.includes("https://cifra.lol"));
  assert.ok(trustedOrigins.includes("https://www.cifra.lol"));
  assert.ok(trustedOrigins.includes("https://cifra-prpfe-abc123-damians-projects-ef5d899c.vercel.app"));
  assert.ok(!trustedOrigins.some((o) => o.includes("*")), "no wildcards in production");
  assert.ok(!trustedOrigins.some((o) => o.startsWith("http://")), "no plain http in production");
  assert.ok(!allowedHosts.includes("localhost"));
  assert.ok(!allowedHosts.some((h) => h.includes("vercel.app") && h.includes("*")));
});

test("a preview trusts its own URLs but not other vercel.app sites", () => {
  const { trustedOrigins } = authOrigins({
    VERCEL_ENV: "preview",
    VERCEL_URL: "cifra-prpfe-xyz-damians-projects-ef5d899c.vercel.app",
    VERCEL_BRANCH_URL: "cifra-prpfe-ye-git-fix-damians-projects-ef5d899c.vercel.app",
  });
  assert.ok(trustedOrigins.includes("https://cifra-prpfe-xyz-damians-projects-ef5d899c.vercel.app"));
  assert.ok(trustedOrigins.includes("https://cifra-prpfe-ye-git-fix-damians-projects-ef5d899c.vercel.app"));
  assert.ok(!trustedOrigins.includes("https://*.vercel.app"));
  assert.ok(!trustedOrigins.includes("*.vercel.app"));
});

test("local dev keeps localhost and the sandbox preview", () => {
  const { trustedOrigins, allowedHosts } = authOrigins({});
  assert.ok(trustedOrigins.includes("http://localhost:8080"));
  assert.ok(trustedOrigins.includes("http://127.0.0.1:8080"));
  assert.ok(allowedHosts.includes("*.grok-sandbox.com"));
});

test("AUTH_EXTRA_ORIGINS and BETTER_AUTH_URL are honoured", () => {
  const { trustedOrigins, allowedHosts } = authOrigins({
    BETTER_AUTH_URL: "http://localhost:8095/",
    AUTH_EXTRA_ORIGINS: "https://staging.cifra.lol, nonsense",
  });
  assert.ok(trustedOrigins.includes("http://localhost:8095"));
  assert.ok(trustedOrigins.includes("https://staging.cifra.lol"));
  assert.ok(allowedHosts.includes("staging.cifra.lol"));
});
