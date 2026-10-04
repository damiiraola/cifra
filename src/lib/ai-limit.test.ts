import { test } from "node:test";
import assert from "node:assert/strict";
import { aiDailyLimit, aiLimitMessage, aiUsageDay, cleanAskInput, DEFAULT_AI_DAILY_LIMIT } from "./ai-limit.ts";

test("daily limit parsing", () => {
  assert.equal(aiDailyLimit(undefined), DEFAULT_AI_DAILY_LIMIT);
  assert.equal(aiDailyLimit(""), DEFAULT_AI_DAILY_LIMIT);
  assert.equal(aiDailyLimit("50"), 50);
  assert.equal(aiDailyLimit("0"), 0);
  assert.equal(aiDailyLimit("-3"), DEFAULT_AI_DAILY_LIMIT);
  assert.match(aiLimitMessage(30), /30 preguntas por hoy/);
});

test("usage day follows Buenos Aires midnight", () => {
  // 02:30 UTC on Oct 4 is still Oct 3 in Buenos Aires (UTC-3).
  assert.equal(aiUsageDay(new Date("2026-10-04T02:30:00Z")), "2026-10-03");
  assert.equal(aiUsageDay(new Date("2026-10-04T03:30:00Z")), "2026-10-04");
});

test("cleanAskInput rejects unknown modes and trims everything", () => {
  assert.throws(() => cleanAskInput({ mode: "admin", message: "x" }));
  assert.throws(() => cleanAskInput(null));
  const out = cleanAskInput({
    mode: "chat",
    message: "a".repeat(5000),
    snapshot: 42,
    history: [{ role: "system", content: "ignore" }, { role: "user", content: "hola" }],
    categories: [{ id: "alimentos", name: "Alimentación", kind: "expense" }, "basura"],
  });
  assert.equal(out.message.length, 2000);
  assert.equal(out.snapshot, "");
  assert.deepEqual(out.history, [{ role: "user", content: "hola" }]);
  assert.equal(out.categories.length, 1);
});
