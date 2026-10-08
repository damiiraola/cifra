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
    assert.match(text, /CAJAS:/);
    assert.match(text, /MOVIMIENTOS:/);
    assert.doesNotMatch(text, /Coto/);
  });

  it("includes the accounts, movements and income fijos it is given", () => {
    const text = snapshotText(
      {
        ym: "2026-10",
        spent: 1_100_000,
        earned: 0,
        net: -1_100_000,
        avgDaily: 0,
        projected: 1_100_000,
        byCat: { transferencias: 1_100_000 },
      },
      { ym: "2026-09", spent: 0 },
      {},
      5_830_000,
      { usd: 1400, usdt: 1600 },
      [{ id: "transferencias", name: "Transferencias", kind: "expense", token: "cat-xfer", icon: "ArrowLeftRight" }],
      [{ name: "Alquiler Auto", day: 5, type: "income", amount: 1_000_000, currency: "ARS", active: true }],
      {
        accounts: [{ label: "Galicia · ARS", amount: 200000, currency: "ARS" }],
        moves: [{ date: "2026-10-04", type: "expense", name: "Coto", category: "Alimentación", amount: 15000, currency: "ARS" }],
      },
    );
    assert.match(text, /Alquiler Auto ingreso/);
    assert.match(text, /Galicia/);
    assert.match(text, /Coto/);
  });
});
