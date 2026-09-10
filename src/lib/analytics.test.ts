import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { snapshotText } from "./snapshot-text.ts";

describe("snapshotText", () => {
  it("keeps totals, categories, fijos and budgets — not tickets", () => {
    const text = snapshotText(
      {
        ym: "2026-09",
        spent: 15400,
        earned: 0,
        net: -15400,
        avgDaily: 1925,
        projected: 57750,
        byCat: { alimentos: 15400 },
      },
      { ym: "2026-08", spent: 10000 },
      { alimentos: 100000 },
      500000,
      { usd: 1400, usdt: 1390 },
      [{ id: "alimentos", name: "Alimentos", kind: "expense", token: "cat-food", icon: "Utensils" }],
      [{ name: "Alquiler", day: 5, type: "expense", amount: 400000, currency: "ARS", active: true }],
    );
    assert.match(text, /GASTOS:/);
    assert.match(text, /CATEGORIAS:/);
    assert.match(text, /Alimentos/);
    assert.match(text, /FIJOS:/);
    assert.match(text, /Alquiler/);
    assert.match(text, /PRESUPUESTO GLOBAL/);
    assert.doesNotMatch(text, /Coto/);
    assert.doesNotMatch(text, /asado/);
    assert.doesNotMatch(text, /MOVIMIENTOS RECIENTES/);
    assert.doesNotMatch(text, /TOP COMERCIOS/);
    assert.doesNotMatch(text, /mercadopago/);
  });
});
