import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { legsMatch, otherLeg, rateFarFromMarket } from "./books.ts";

describe("cambio", () => {
  it("descuenta los USDT a partir de los pesos y la cotización", () => {
    assert.equal(otherLeg("USDT", "ARS", 1614, 1_100_000, "to"), 681.54);
  });

  it("calcula los pesos si el usuario cargó los USDT", () => {
    assert.equal(otherLeg("USDT", "ARS", 1614, 681.54, "from"), 1_100_006);
  });

  it("compra USDT con pesos", () => {
    assert.equal(otherLeg("ARS", "USDT", 1614, 1_100_000, "from"), 681.54);
  });

  it("rechaza una cotización con un cero de más o de menos", () => {
    assert.equal(rateFarFromMarket(161, 1614), true);
    assert.equal(rateFarFromMarket(16140, 1614), true);
    assert.equal(rateFarFromMarket(1500, 1614), false);
  });

  it("no deja pasar un monto que no cierra", () => {
    assert.equal(legsMatch(681.54, 1_100_000, "USDT", "ARS", 1614), true);
    assert.equal(legsMatch(1_100_000, 1_100_000, "USDT", "ARS", 1614), false);
  });
});
