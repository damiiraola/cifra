import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeChatThreads, parseChatThreads, threadFromMessages, upsertThread } from "./chat-threads.ts";

describe("chat threads", () => {
  it("keeps a titled conversation", () => {
    const parsed = parseChatThreads([
      {
        id: "a",
        title: "",
        updatedAt: "2026-10-04T12:00:00.000Z",
        messages: [{ id: "1", role: "user", content: "¿Me paso el presupuesto?", createdAt: "2026-10-04T12:00:00.000Z" }],
      },
    ]);
    assert.equal(parsed[0]?.title, "¿Me paso el presupuesto?");
  });

  it("keeps the newer copy when the phone and the account disagree", () => {
    const older = threadFromMessages("a", [{ id: "1", role: "user", content: "vieja", createdAt: "2026-10-01T00:00:00.000Z" }], "2026-10-01T00:00:00.000Z")!;
    const newer = { ...older, title: "nueva", updatedAt: "2026-10-04T00:00:00.000Z" };
    const merged = mergeChatThreads([newer], [older]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.title, "nueva");
  });

  it("puts the conversation just saved first", () => {
    const a = threadFromMessages("a", [{ id: "1", role: "user", content: "a", createdAt: "2026-10-01" }])!;
    const b = threadFromMessages("b", [{ id: "2", role: "user", content: "b", createdAt: "2026-10-02" }])!;
    assert.deepEqual(upsertThread([a], b).map((t) => t.id), ["b", "a"]);
  });
});
