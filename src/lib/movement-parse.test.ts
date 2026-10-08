import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cuotasFromText, draftFromModel, matchCard } from "./movement-parse.ts";

const today = "2026-10-08";
const visa = {
  id: "visa",
  name: "Visa Galicia",
  network: "visa" as const,
  accountArsId: "visa-ars",
  accountUsdId: "visa-usd",
};
const master = {
  id: "master",
  name: "Master BBVA",
  network: "master" as const,
  accountArsId: "master-ars",
  accountUsdId: "master-usd",
};
const cards = [visa, master];

describe("cuotasFromText (no model)", () => {
  it("'tele 600 mil en 12 con la Visa' → cuotas purchase prefilled", () => {
    assert.deepEqual(cuotasFromText("tele 600 mil en 12 con la Visa", cards, today), {
      type: "expense",
      amount: 600_000,
      currency: "ARS",
      method: "credito",
      accountId: "visa-ars",
      merchant: "Tele",
      categoryId: "compras",
      note: "",
      date: today,
      installmentCount: 12,
    });
  });

  it("other ways to say it", () => {
    const a = cuotasFromText(
      "Compré una heladera de $960.000 en 6 cuotas sin interés con la master",
      cards,
      today,
    );
    assert.equal(a?.amount, 960_000);
    assert.equal(a?.installmentCount, 6);
    assert.equal(a?.accountId, "master-ars");
    assert.equal(a?.merchant, "Heladera");
    const b = cuotasFromText("celular 1,5 palos 18 cuotas galicia", cards, today);
    assert.equal(b?.amount, 1_500_000);
    assert.equal(b?.installmentCount, 18);
    assert.equal(b?.accountId, "visa-ars");
  });

  it("one card: it is that one; several and none named: Nuevo picks", () => {
    assert.equal(cuotasFromText("tele 600 mil en 12", [visa], today)?.accountId, "visa-ars");
    const r = cuotasFromText("tele 600 mil en 12", cards, today);
    assert.equal(r?.accountId, undefined);
    assert.equal(r?.method, "credito");
  });

  it("not a cuotas purchase, or unclear: null (the model reads it)", () => {
    assert.equal(cuotasFromText("15 mil en el super ayer con débito", cards, today), null);
    assert.equal(cuotasFromText("tele en 12 cuotas", cards, today), null, "no amount");
    assert.equal(cuotasFromText("tele 600 mil en 1", cards, today), null);
    assert.equal(cuotasFromText("tele 60 cuotas de 20 mil con interés", cards, today), null);
    assert.equal(cuotasFromText("notebook 900 dólares en 6", cards, today), null);
  });
});

describe("draftFromModel", () => {
  const opts = { allowedCategories: new Set(["compras", "alimentos"]), cards, today };
  it("a plain movement, as before", () => {
    const d = draftFromModel(
      '{"type":"expense","amount":15000,"currency":"ARS","categoryId":"alimentos","merchant":"Coto","note":"","date":null,"method":"debito","installments":null,"card":null}',
      opts,
    );
    assert.deepEqual(d, {
      type: "expense",
      amount: 15_000,
      currency: "ARS",
      categoryId: "alimentos",
      merchant: "Coto",
      note: "",
      date: today,
      method: "debito",
    });
  });

  it("cuotas and a card from the model → crédito on that card", () => {
    const d = draftFromModel(
      '{"type":"expense","amount":600000,"currency":"ARS","categoryId":"compras","merchant":"Tele","note":"","date":null,"method":"otro","installments":12,"card":"visa"}',
      opts,
    );
    assert.equal(d?.installmentCount, 12);
    assert.equal(d?.method, "credito");
    assert.equal(d?.accountId, "visa-ars");
  });

  it("bad JSON, no amount or unknown category", () => {
    assert.equal(draftFromModel("nope", opts), null);
    assert.equal(draftFromModel('{"amount":0}', opts), null);
    assert.equal(
      draftFromModel('{"amount":10,"categoryId":"inventada"}', opts)?.categoryId,
      "otros",
    );
    assert.equal(
      draftFromModel('{"amount":10,"type":"income","installments":3}', opts)?.installmentCount,
      undefined,
      "income has no cuotas",
    );
  });
});

describe("matchCard", () => {
  it("by name, by a word of the name, by network", () => {
    assert.equal(matchCard(cards, "Visa Galicia")?.id, "visa");
    assert.equal(matchCard(cards, "la bbva")?.id, "master");
    assert.equal(matchCard(cards, "mastercard")?.id, "master");
    assert.equal(matchCard(cards, "naranja"), undefined);
    assert.equal(matchCard(cards, null), undefined);
  });
});
