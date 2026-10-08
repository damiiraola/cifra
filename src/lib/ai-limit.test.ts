import { test } from "node:test";
import assert from "node:assert/strict";
import { aiDailyLimit, aiLimitMessage, aiUsageDay, cleanAskInput, DEFAULT_AI_DAILY_LIMIT, pdfLimitMessage } from "./ai-limit.ts";

test("daily limit parsing", () => {
  assert.equal(aiDailyLimit(undefined), DEFAULT_AI_DAILY_LIMIT);
  assert.equal(aiDailyLimit(""), DEFAULT_AI_DAILY_LIMIT);
  assert.equal(aiDailyLimit("50"), 50);
  assert.equal(aiDailyLimit("0"), 0);
  assert.equal(aiDailyLimit("-3"), DEFAULT_AI_DAILY_LIMIT);
  assert.match(aiLimitMessage(30), /30 usos del asistente por hoy/);
});

test("usage day follows Buenos Aires midnight", () => {
  // 02:30 UTC on Oct 4 is still Oct 3 in Buenos Aires (UTC-3).
  assert.equal(aiUsageDay(new Date("2026-10-04T02:30:00Z")), "2026-10-03");
  assert.equal(aiUsageDay(new Date("2026-10-04T03:30:00Z")), "2026-10-04");
});

test("cleanAskInput: only 'parse' (questions go to the assistant), everything trimmed", () => {
  assert.throws(() => cleanAskInput({ mode: "admin", message: "x" }));
  assert.throws(() => cleanAskInput({ mode: "chat", message: "x" }));
  assert.throws(() => cleanAskInput({ mode: "report", message: "x" }));
  assert.throws(() => cleanAskInput(null));
  const out = cleanAskInput({
    mode: "parse",
    message: "a".repeat(5000),
    snapshot: "LIBRO",
    history: [{ role: "user", content: "hola" }],
    categories: [{ id: "alimentos", name: "Alimentación", kind: "expense" }, "basura"],
  });
  assert.equal(out.message.length, 2000);
  assert.deepEqual(Object.keys(out).sort(), ["categories", "message", "mode"]);
  assert.equal(out.categories.length, 1);
});

test("statement PDF limit messages", () => {
  assert.match(pdfLimitMessage({ limit: 30, used: 26, pdfs: 1, units: 6 }), /usa 6 de tus 30 .* quedan 4/);
  assert.match(pdfLimitMessage({ limit: 30, used: 29, pdfs: 0, units: 6 }), /queda 1\./);
  assert.match(pdfLimitMessage({ limit: 30, used: 6, pdfs: 3, units: 6 }), /Ya leíste 3 resúmenes/);
  assert.equal(pdfLimitMessage({ limit: 0, used: 0, pdfs: 0, units: 6 }), aiLimitMessage(0));
});
