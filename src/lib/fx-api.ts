import { createServerFn } from "@tanstack/react-start";
import type { Quote } from "./fx";

const URL = "https://dolarapi.com/v1/dolares";
const TTL_MS = 3 * 60 * 1000;

type Cache = { at: number; quotes: Quote[] };
const g = globalThis as typeof globalThis & { __cifraFxCache__?: Cache };

function asQuotes(raw: unknown): Quote[] {
  if (!Array.isArray(raw)) throw new Error("Cotizaciones inválidas");
  const out: Quote[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const venta = Number(r.venta);
    const compra = Number(r.compra);
    if (!Number.isFinite(venta) || venta <= 0) continue;
    out.push({
      casa: String(r.casa ?? ""),
      nombre: String(r.nombre ?? r.casa ?? ""),
      compra: Number.isFinite(compra) ? compra : venta,
      venta,
      fechaActualizacion: String(r.fechaActualizacion ?? ""),
    });
  }
  if (out.length === 0) throw new Error("No llegaron cotizaciones");
  return out;
}

export const fetchQuotes = createServerFn({ method: "GET" }).handler(async () => {
  const now = Date.now();
  if (g.__cifraFxCache__ && now - g.__cifraFxCache__.at < TTL_MS) {
    return { quotes: g.__cifraFxCache__.quotes, cached: true as const };
  }
  const res = await fetch(URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`DolarApi ${res.status}`);
  const quotes = asQuotes(await res.json());
  g.__cifraFxCache__ = { at: now, quotes };
  return { quotes, cached: false as const };
});
