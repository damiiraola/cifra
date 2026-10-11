import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { quickFromText } from "./quick-text.ts";
import type { Account, Card } from "./types.ts";

const acc = (id: string, name: string, kind: Account["kind"], currency: Account["currency"] = "ARS") => ({ id, name, kind, currency });
const accounts = [acc("cash", "Efectivo", "cash"), acc("mp", "Mercado Pago", "mp"), acc("bank", "Banco", "bank"), acc("usd", "Dólares", "cash", "USD"), acc("visa-ars", "Visa Galicia", "card"), acc("visa-usd", "Visa Galicia USD", "card", "USD")];
const cards = [{ id: "visa", name: "Visa Galicia", network: "visa", accountArsId: "visa-ars", accountUsdId: "visa-usd" } as Card, { id: "mc", name: "Mastercard Santander", network: "master", accountArsId: "mc-ars", accountUsdId: "mc-usd" } as Card];
const ctx = { accounts, cards, today: "2026-10-11" };
const q = (t: string) => quickFromText(t, ctx)!.draft;

describe("carga rápida escribiendo (determinística)", () => {
  it("15 mil super débito", () => {
    const d = q("15 mil super débito");
    assert.deepEqual([d.type, d.amount, d.currency, d.categoryId, d.accountId, d.method], ["expense", 15000, "ARS", "alimentos", "bank", "debito"]);
    assert.equal(d.merchant, "Super");
  });
  it("usd 25 amazon tarjeta visa", () => {
    const d = q("usd 25 amazon tarjeta visa");
    assert.deepEqual([d.amount, d.currency, d.categoryId, d.accountId, d.method, d.merchant], [25, "USD", "compras", "visa-usd", "credito", "Amazon"]);
  });
  it("u$s and dólares, without a card: the USD caja", () => {
    assert.equal(q("u$s 40 regalo").accountId, "usd");
    assert.equal(q("40 dolares regalo").currency, "USD");
  });
  it("lucas, k, palo, decimals, thousands", () => {
    assert.equal(q("3 lucas kiosco").amount, 3000);
    assert.equal(q("2,5k nafta").amount, 2500);
    assert.equal(q("1 palo heladera").amount, 1_000_000);
    assert.equal(q("1.250,50 farmacia").amount, 1250.5);
    assert.equal(q("$ 12.000 sube").categoryId, "transporte");
  });
  it("efectivo, mp, named card", () => {
    assert.equal(q("2000 cafe efectivo").accountId, "cash");
    assert.equal(q("8500 rappi mp").accountId, "mp");
    assert.equal(q("30 mil cena con la master").accountId, "mc-ars");
  });
  it("income: cobré el sueldo", () => {
    const d = q("cobré sueldo 1.200.000 banco");
    assert.deepEqual([d.type, d.amount, d.categoryId, d.accountId], ["income", 1_200_000, "sueldo", "bank"]);
  });
  it("cuotas: heladera 600 mil en 6 con la visa", () => {
    const d = q("heladera 600 mil en 6 con la visa");
    assert.deepEqual([d.amount, d.installmentCount, d.accountId, d.method], [600_000, 6, "visa-ars", "credito"]);
  });
  it("ayer / anteayer", () => {
    assert.equal(q("ayer 5000 pizza").date, "2026-10-10");
    assert.equal(q("anteayer 5000 pizza").date, "2026-10-09");
  });
  it("no amount: nothing; same text, same result (deterministic)", () => {
    assert.equal(quickFromText("super", ctx), null);
    assert.equal(quickFromText("", ctx), null);
    assert.deepEqual(quickFromText("15 mil super débito", ctx), quickFromText("15 mil super débito", ctx));
  });
  it("unknown words: Otros, merchant kept", () => {
    const d = q("7000 regalo tia");
    assert.deepEqual([d.categoryId, d.merchant], ["otros", "Regalo tia"]);
  });
});
