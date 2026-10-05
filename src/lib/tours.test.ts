import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOURS, markSeen, readSeen, tourFor } from "./tours.ts";

describe("tours", () => {
  it("has a short tour for every main page", () => {
    for (const path of ["/", "/analitica", "/presupuestos", "/tarjetas", "/ia", "/ajustes", "/aprender"]) {
      const tour = tourFor(path);
      assert.ok(tour);
      assert.ok(tour.steps.length >= 2);
      assert.ok(tour.steps.every((s) => s.title && s.body.length < 220));
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
});
