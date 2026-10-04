import { test } from "node:test";
import assert from "node:assert/strict";
import { contentSecurityPolicy, securityHeaders } from "./security-headers.mjs";

test("CSP blocks framing and third-party scripts by default", () => {
  const csp = contentSecurityPolicy();
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /grok\.com/);
  assert.match(csp, /font-src [^;]*https:\/\/fonts\.gstatic\.com/);
});

test("CSP allows the grok.com script only when extensions are on", () => {
  assert.match(contentSecurityPolicy({ grokExtensions: true }), /script-src 'self' 'unsafe-inline' https:\/\/grok\.com/);
});

test("headers include the basics", () => {
  const h = securityHeaders({ grokExtensions: false });
  assert.equal(h["X-Frame-Options"], "DENY");
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
});
