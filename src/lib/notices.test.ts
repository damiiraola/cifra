/** UX audit 2026-10-10, P5: one tour, notices by priority. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { autoTour, FIRST_TOUR, TOURS } from "./tours.ts";
import { byPriority } from "./plan/alerts.ts";

describe("tours: one short tour, the first time", () => {
  it("only the Diario's shows by itself, once", () => {
    assert.equal(autoTour("/", []), true);
    assert.equal(autoTour("/", ["/"]), false);
    for (const t of TOURS.filter((x) => x.path !== FIRST_TOUR)) assert.equal(autoTour(t.path, []), false, t.path);
  });
  it("it is short", () => {
    assert.ok(TOURS.find((t) => t.path === FIRST_TOUR)!.steps.length <= 3);
  });
});

describe("Diario notices: most urgent first", () => {
  it("bad, then warn, then info; same tone keeps its order", () => {
    const got = byPriority([
      { id: "a", tone: "info" as const },
      { id: "b", tone: "warn" as const },
      { id: "c", tone: "bad" as const },
      { id: "d", tone: "warn" as const },
    ]);
    assert.deepEqual(got.map((x) => x.id), ["c", "b", "d", "a"]);
  });
});
