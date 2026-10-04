import { test } from "node:test";
import assert from "node:assert/strict";
import { mailLooksDown } from "./mail-status.ts";

const now = Date.parse("2026-10-03T22:00:00Z");
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

test("mail is down only when the latest send failed recently", () => {
  assert.equal(mailLooksDown([], now), false);
  assert.equal(mailLooksDown([{ key: "mail_last_failure", at: ago(5) }], now), true);
  assert.equal(mailLooksDown([{ key: "mail_last_failure", at: ago(45) }], now), false, "old failure");
  assert.equal(
    mailLooksDown([{ key: "mail_last_failure", at: ago(5) }, { key: "mail_last_success", at: ago(1) }], now),
    false,
    "a later success means it recovered",
  );
});
