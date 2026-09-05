export type UsdSource =
  | "oficial"
  | "blue"
  | "bolsa"
  | "contadoconliqui"
  | "tarjeta"
  | "cripto";

export type Quote = {
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion: string;
};

export type FxRates = {
  usd: number;
  usdt: number;
};

export const USD_SOURCES: { id: UsdSource; label: string; hint: string }[] = [
  { id: "blue", label: "Blue", hint: "Efectivo / informal" },
  { id: "oficial", label: "Oficial", hint: "BNA" },
  { id: "bolsa", label: "MEP", hint: "Bolsa" },
  { id: "contadoconliqui", label: "CCL", hint: "Contado con liqui" },
  { id: "tarjeta", label: "Tarjeta", hint: "Consumo con plástico" },
  { id: "cripto", label: "Cripto", hint: "USDT / USDC" },
];

export const DEFAULT_USD_RATE = 1540;
export const DEFAULT_USDT_RATE = 1574;
export const DEFAULT_USD_SOURCE: UsdSource = "blue";

export function isUsdSource(v: string): v is UsdSource {
  return USD_SOURCES.some((s) => s.id === v);
}

export function quoteVenta(quotes: Quote[], casa: string): number | null {
  const q = quotes.find((x) => x.casa === casa);
  const n = Number(q?.venta);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function applyQuotes(quotes: Quote[], usdSource: UsdSource): FxRates {
  return {
    usd: quoteVenta(quotes, usdSource) ?? quoteVenta(quotes, "blue") ?? DEFAULT_USD_RATE,
    usdt: quoteVenta(quotes, "cripto") ?? DEFAULT_USDT_RATE,
  };
}

export function formatRate(n: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
}
