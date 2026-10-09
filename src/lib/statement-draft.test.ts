import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearAllDrafts,
  clearDraft,
  DRAFT_MAX_AGE_MS,
  loadDraft,
  saveDraft,
  type DraftStorage,
} from "./statement-draft.ts";

function memory(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("revisión del PDF guardada", () => {
  const read = {
    ok: true,
    statement: { lines: [{ description: "Coto", amount: 1000 }] },
    inText: [true],
  };

  it("vuelve después de recargar, por tarjeta", () => {
    const s = memory();
    saveDraft(s, "visa", read, 1000);
    assert.deepEqual(loadDraft(s, "visa", 2000), read);
    assert.equal(loadDraft(s, "master", 2000), null);
  });

  it("se borra al importar o cancelar, y vence en un día", () => {
    const s = memory();
    saveDraft(s, "visa", read, 0);
    assert.equal(loadDraft(s, "visa", DRAFT_MAX_AGE_MS + 1), null);
    assert.equal(s.map.size, 0, "the expired draft is removed");
    saveDraft(s, "visa", read, 0);
    clearDraft(s, "visa");
    assert.equal(loadDraft(s, "visa", 1), null);
  });

  it("al cerrar sesión no queda ningún resumen, y no toca otras claves", () => {
    const s = memory();
    saveDraft(s, "visa", read);
    saveDraft(s, "master", read);
    s.setItem("otra", "x");
    clearAllDrafts(s);
    assert.deepEqual([...s.map.keys()], ["otra"]);
  });

  it("ignora basura sin romper", () => {
    const s = memory();
    s.setItem("cifra-pdf-review:v1:visa", "{no");
    assert.equal(loadDraft(s, "visa"), null);
  });
});
