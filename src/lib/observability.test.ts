import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEnvelope, parseDsn, scrub } from "./observability.ts";

test("parseDsn builds the envelope endpoint", () => {
  assert.deepEqual(parseDsn("https://abc123@o42.ingest.us.sentry.io/4507"), {
    endpoint: "https://o42.ingest.us.sentry.io/api/4507/envelope/",
    publicKey: "abc123",
  });
  assert.equal(parseDsn(""), null);
  assert.equal(parseDsn(undefined), null);
  assert.equal(parseDsn("no es una url"), null);
  assert.equal(parseDsn("https://o42.ingest.sentry.io/4507"), null, "needs a key");
});

test("no mail addresses leave the app", () => {
  assert.equal(scrub("fallo para ana.perez+x@gmail.com hoy"), "fallo para [mail] hoy");
  const env = buildEnvelope(new Error("No pude mandar a juan@example.com"), {
    platform: "node",
    tags: { to: "juan@example.com", where: "mail" },
    url: "https://cifra.lol/reset?token=secreto",
  });
  assert.doesNotMatch(env, /juan@example\.com/);
  assert.doesNotMatch(env, /secreto/);
  const [header, item, event] = env.split("\n").map((l) => JSON.parse(l));
  assert.equal(item.type, "event");
  assert.equal(header.event_id, event.event_id);
  assert.equal(event.exception.values[0].type, "Error");
});
