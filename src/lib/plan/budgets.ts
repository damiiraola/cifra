/**
 * Topes sugeridos por categoría (§2.2 `suggestBudgets`). Pure, sin IA.
 * Tope = lo comprometido del mes (fijos + cuotas, never trimmed) + lo que
 * gastás normalmente en el día a día (mediana de 3 meses), minus a cut where
 * it is needed to cover the goals.
 */
import { isPosted } from "../recurring.ts";
import { round0, txArs, type PlanData } from "./cashflow.ts";

/** Share of the usual day-to-day spending of a category that can be trimmed. */
export const MAX_CUT: Record<string, number> = {
  ocio: 0.35,
  compras: 0.3,
  otros: 0.25,
  suscripciones: 0.25,
  transporte: 0.1,
  alimentos: 0.1,
  educacion: 0.1,
  salud: 0,
  vivienda: 0,
  servicios: 0,
  impuestos: 0,
  intereses: 0,
  transferencias: 0,
};
/** Categories the user created. */
const DEFAULT_CUT = 0.15;

export function maxCut(id: string) {
  return MAX_CUT[id] ?? DEFAULT_CUT;
}

/**
 * Already committed per category for `ym`: active fijo expenses of the book
 * (loaded or not, any caja) and the cuotas dated that month. ARS.
 */
export function committedByCategory(data: PlanData, ym: string): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string, v: number) => {
    if (id && v > 0) out[id] = (out[id] ?? 0) + v;
  };
  for (const r of data.recurrings) {
    if (r.bookId !== data.bookId || !r.active || r.type !== "expense" || !(r.amount > 0)) continue;
    const posted = data.txs.find((t) => t.recurringId === r.id && t.date.startsWith(ym));
    if (posted && isPosted(r, data.txs, ym))
      add(posted.categoryId || r.categoryId, txArs(posted, data.rates));
    else
      add(
        r.categoryId,
        r.currency === "ARS"
          ? r.amount
          : r.amount * (r.currency === "USD" ? data.rates.usd : data.rates.usdt),
      );
  }
  for (const t of data.txs) {
    if (t.type === "expense" && t.purchaseId && t.date.startsWith(ym))
      add(t.categoryId, txArs(t, data.rates));
  }
  for (const id of Object.keys(out)) out[id] = round0(out[id]!);
  return out;
}

export type BudgetRow = {
  id: string;
  name: string;
  /** Usual day-to-day spending (median). */
  usual: number;
  /** Fijos + cuotas of the month. */
  committed: number;
  cut: number;
  tope: number;
};

export type BudgetSuggestion = {
  rows: BudgetRow[];
  /** What the topes free up per month vs the usual. */
  freed: number;
  /** What could not be freed (the cut asked was bigger than what can be trimmed). */
  short: number;
};

/** Round to $1.000 (or $100 under $20.000); down when there is a cut, so it frees at least that. */
function niceTope(n: number, down: boolean) {
  if (n <= 0) return 0;
  const step = n >= 20_000 ? 1000 : 100;
  return (down ? Math.floor(n / step) : Math.round(n / step)) * step;
}

export function suggestBudgets(input: {
  usual: Record<string, number>;
  committed: Record<string, number>;
  /** ARS per month to free up (0 = topes at the usual). */
  cut: number;
  names: Record<string, string>;
}): BudgetSuggestion {
  const ids = [...new Set([...Object.keys(input.usual), ...Object.keys(input.committed)])].filter(
    (id) => (input.usual[id] ?? 0) > 0 || (input.committed[id] ?? 0) > 0,
  );
  const capacity = new Map(ids.map((id) => [id, Math.max(0, (input.usual[id] ?? 0) * maxCut(id))]));
  const total = [...capacity.values()].reduce((s, v) => s + v, 0);
  const want = Math.max(0, input.cut);
  const ratio = total > 0 ? Math.min(1, want / total) : 0;
  const rows = ids.map((id) => {
    const usual = round0(input.usual[id] ?? 0);
    const committed = round0(input.committed[id] ?? 0);
    const rawCut = (capacity.get(id) ?? 0) * ratio;
    const cut = Math.min(round0(capacity.get(id) ?? 0), Math.ceil(rawCut / 100) * 100);
    const tope = niceTope(committed + usual - cut, cut > 0);
    return {
      id,
      name: input.names[id] ?? id,
      usual,
      committed,
      cut: Math.max(0, committed + usual - tope),
      tope,
    };
  });
  rows.sort((a, b) => b.tope - a.tope);
  const freed = rows.reduce((s, r) => s + r.cut, 0);
  return { rows, freed, short: Math.max(0, round0(want - freed)) };
}
