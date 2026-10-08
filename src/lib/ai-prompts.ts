import { aiUsageDay } from "./ai-limit.ts";

/**
 * System prompt to read one movement from a sentence (pure, so tests can read
 * it). The assistant's prompt lives in assistant/llm.ts.
 */

export type CatHint = { id: string; name: string; kind: string };

const BASE_PARSE = `Convertí el texto del usuario en UN movimiento JSON. Español rioplatense, montos argentinos (15 mil = 15000, 15.000 = 15000).
Devolvé SOLO JSON válido, sin markdown (todos los campos, siempre):
{"type":"expense"|"income","amount":number,"currency":"ARS"|"USD"|"USDT","categoryId":string,"merchant":string,"note":string,"date":"YYYY-MM-DD"|null,"method":"efectivo"|"debito"|"credito"|"transferencia"|"mercadopago"|"crypto"|"otro","installments":number|null,"card":string|null}
Si dice USDT, tether o cripto, currency=USDT y method=crypto. Si dice dólares o USD, currency=USD. Si no hay fecha, date=null. Si no hay método, "otro". amount siempre positivo.
Compra en cuotas ("en 12", "en 6 cuotas"): installments=cantidad, method=credito y amount=el precio total. Si no es en cuotas, installments=null. Si nombra una tarjeta ("con la Visa"), card=ese nombre; si no, null.`;

function catBlock(cats: CatHint[] | undefined) {
  if (!cats?.length) {
    return "categoryId debe ser uno de: alimentos, transporte, vivienda, servicios, salud, educacion, ocio, compras, suscripciones, impuestos, transferencias, otros, sueldo, ventas, freelance, inversiones, otros-ing.";
  }
  const lines = cats.map((c) => `${c.id} (${c.name}, ${c.kind === "income" ? "ingreso" : "gasto"})`).join(", ");
  return `Categorías del usuario (usá estos categoryId): ${lines}.`;
}

/** System prompt to turn one sentence into a movement ("parse"). */
export function systemFor(cats?: CatHint[]) {
  // The model does not know today's date: "ayer" / "el lunes" need it.
  return `${BASE_PARSE}\nHoy es ${aiUsageDay()} (Buenos Aires).\n${catBlock(cats)}`;
}
