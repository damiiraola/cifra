import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAIL_DRILL_TO, handleMailDrill, tokensMatch, type MailDrillDeps } from "./mail-drill.ts";

const URL_ = "https://cifra.lol/api/mail-drill";
const TOKEN = "s3cret-drill-token-0123456789abcdef";

function setup(overrides: Partial<MailDrillDeps> = {}) {
  const sent: string[] = [];
  const deps: MailDrillDeps = {
    token: TOKEN,
    mailConfigured: () => true,
    sendPreviews: async (to) => {
      sent.push(to);
      return { ok: true };
    },
    ...overrides,
  };
  return { deps, sent };
}

function req(method: string, auth?: string) {
  return new Request(URL_, { method, headers: auth ? { Authorization: auth } : {} });
}

describe("mail drill", () => {
  it("is a 404 for every method when MAIL_DRILL_TOKEN is unset or blank", async () => {
    for (const token of [undefined, "", "   "]) {
      const { deps, sent } = setup({ token });
      for (const r of [req("GET"), req("POST"), req("POST", `Bearer ${TOKEN}`)]) {
        const res = await handleMailDrill(r, deps);
        assert.equal(res.status, 404);
      }
      assert.deepEqual(sent, []);
    }
  });

  it("never sends on GET, even with the right token", async () => {
    const { deps, sent } = setup();
    const res = await handleMailDrill(req("GET", `Bearer ${TOKEN}`), deps);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
    assert.deepEqual(sent, []);
  });

  it("rejects a POST without a token", async () => {
    const { deps, sent } = setup();
    const res = await handleMailDrill(req("POST"), deps);
    assert.equal(res.status, 401);
    assert.deepEqual(sent, []);
  });

  it("rejects a POST with a wrong or malformed token", async () => {
    const { deps, sent } = setup();
    for (const auth of [
      "Bearer nope",
      `Bearer ${TOKEN}x`,
      `Bearer ${TOKEN.slice(0, -1)}`,
      TOKEN,
      `Basic ${TOKEN}`,
      "Bearer ",
    ]) {
      const res = await handleMailDrill(req("POST", auth), deps);
      assert.equal(res.status, 401, auth);
    }
    assert.deepEqual(sent, []);
  });

  it("ignores ?token= in the query string", async () => {
    const { deps, sent } = setup();
    const res = await handleMailDrill(
      new Request(`${URL_}?token=${TOKEN}`, { method: "POST" }),
      deps,
    );
    assert.equal(res.status, 401);
    assert.deepEqual(sent, []);
  });

  it("sends the previews to the owner with the right bearer token", async () => {
    const { deps, sent } = setup();
    const res = await handleMailDrill(req("POST", `Bearer ${TOKEN}`), deps);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { ok: true, to: MAIL_DRILL_TO });
    assert.deepEqual(sent, [MAIL_DRILL_TO]);
  });

  it("does not send when Resend is not configured", async () => {
    const { deps, sent } = setup({ mailConfigured: () => false });
    const res = await handleMailDrill(req("POST", `Bearer ${TOKEN}`), deps);
    assert.equal(res.status, 500);
    assert.deepEqual(sent, []);
  });

  it("reports a send failure as 500", async () => {
    const { deps } = setup({ sendPreviews: async () => ({ ok: false, error: "boom" }) });
    const res = await handleMailDrill(req("POST", `Bearer ${TOKEN}`), deps);
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, "boom");
  });

  it("compares tokens exactly", async () => {
    assert.equal(await tokensMatch(TOKEN, TOKEN), true);
    assert.equal(await tokensMatch(TOKEN, TOKEN.toUpperCase()), false);
    assert.equal(await tokensMatch("", TOKEN), false);
  });
});
