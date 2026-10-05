/** Illustrative long-run figure for a broad index sleeve. Not a forecast. */
export const INDEX_RATE = 0.07;
const INDEX_SHARE = 0.8;

export function compoundMonthly(monthly: number, annualRate: number, years: number) {
  if (!(monthly > 0) || !(years > 0)) return 0;
  const r = (1 + annualRate) ** (1 / 12) - 1;
  const n = years * 12;
  if (!(r > 0)) return monthly * n;
  return (monthly * ((1 + r) ** n - 1)) / r;
}

export function wealthPlan(input: { incomeArs: number; capArs: number; usdtRate: number }) {
  const rate = input.usdtRate > 0 ? input.usdtRate : 0;
  const surplus = input.incomeArs - input.capArs;
  const mode: "invertir" | "reparar" | "sin-datos" =
    !(input.incomeArs > 0) ? "sin-datos" : surplus > rate * 20 ? "invertir" : "reparar";
  const microArs = mode === "invertir" ? surplus * 0.7 : input.incomeArs > 0 ? input.incomeArs * 0.05 : 0;
  const microUsd = Math.round(rate > 0 ? microArs / rate : 0);
  const indexUsd = Math.round(microUsd * INDEX_SHARE);
  const cryptoUsd = microUsd - indexUsd;
  const horizons = [10, 20, 30].map((years) => ({
    years,
    usd: Math.round(compoundMonthly(indexUsd, INDEX_RATE, years)),
  }));
  return {
    mode,
    surplusArs: Math.round(surplus),
    microUsd,
    indexUsd,
    cryptoUsd,
    horizons,
  };
}

export function wealthPlanText(input: { incomeArs: number; expenseArs: number; capArs: number; usdtRate: number }) {
  const plan = wealthPlan(input);
  if (plan.mode === "sin-datos") {
    return "PLAN:\nSin ingresos fijos cargados. No hay plan de inversión hasta saber qué entra.";
  }
  const horizons = plan.horizons.map((h) => `${h.years} años ≈ USD ${h.usd}`).join(" · ");
  const head =
    plan.mode === "invertir"
      ? `MODO: invertir. Sobra ${plan.surplusArs} ARS por encima del tope. El micro real es USD ${plan.microUsd}/mes (el 70% de ese sobrante; el 30% queda líquido en USDT).`
      : `MODO: reparar. El tope se come lo que entra (sobrante ${plan.surplusArs} ARS). No hay plata para invertir. El micro de abajo es un OBJETIVO: el 5% de los ingresos, si logra bajar el tope. No es plata que le sobre hoy.`;
  return `PLAN:
${head}
Entra fijo ${Math.round(input.incomeArs)} ARS. Sale fijo ${Math.round(input.expenseArs)} ARS. Tope ${Math.round(input.capArs)} ARS.
El día que entra el ingreso, apartar USD ${plan.microUsd}: USD ${plan.indexUsd} a un índice S&P 500 (comprar y no vender) y USD ${plan.cryptoUsd} a cripto en hold (manga chica, puede ir a cero, no se opera).
Interés compuesto SOLO de la manga S&P, supuesto ilustrativo del 7% anual en dólares, no es un pronóstico ni una promesa: ${horizons}.
La manga cripto no se proyecta. No recomendar un papel, un broker ni una altcoin.`;
}
