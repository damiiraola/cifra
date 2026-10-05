import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOURS, markSeen, placeBubble, readSeen, tourFor } from "./tours.ts";

describe("tours", () => {
  it("has a short tour for every main page", () => {
    for (const path of ["/", "/analitica", "/presupuestos", "/tarjetas", "/ia", "/ajustes", "/aprender"]) {
      const tour = tourFor(path);
      assert.ok(tour);
      assert.ok(tour.steps.length >= 2);
      assert.ok(tour.steps.every((s) => s.anchor && s.title && s.body.length < 220));
    }
    assert.equal(TOURS.length, 7);
  });

  it("remembers a page only for that account", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    markSeen("Damian@cifra.lol", "/", storage);
    assert.deepEqual(readSeen("damian@cifra.lol", storage), ["/"]);
    assert.deepEqual(readSeen("otro@cifra.lol", storage), []);
  });

  it("puts the note next to the lit area, not stuck at the bottom", () => {
    const view = { width: 1200, height: 800 };
    const card = { width: 340, height: 160 };
    const below = placeBubble({ top: 80, left: 300, right: 700, bottom: 160, width: 400 }, card, view);
    assert.equal(below.tip, "up");
    assert.ok(below.top >= 160);
    const above = placeBubble({ top: 640, left: 300, right: 700, bottom: 760, width: 400 }, card, view);
    assert.equal(above.tip, "down");
    assert.ok(above.top + card.height <= 640);
    const side = placeBubble({ top: 120, left: 16, right: 200, bottom: 164, width: 184 }, card, view);
    assert.equal(side.tip, "left");
    assert.ok(side.left >= 200);
  });
});
