import { CATEGORIES, CATEGORY_MAP } from "./categories";
import type { Category } from "./types";
import { daysInMonth, monthBounds, prevMonth, todayISO } from "./utils";
import type { FxRates } from "./fx";
import type { Currency, Transaction } from "./types";

export function toARS(tx: Transaction, rates: FxRates) {
  if (tx.currency === "ARS") return tx.amount;
  if (tx.rateArs > 0) return tx.amount * tx.rateArs;
  if (tx.currency === "USD") return tx.amount * rates.usd;
  if (tx.currency === "USDT") return tx.amount * rates.usdt;
  return tx.amount;
}

export function inMonth(tx: Transaction, ym: string) {
  return tx.date.startsWith(ym);
}

export function signedARS(tx: Transaction, rates: FxRates) {
  if (tx.type === "transfer") return 0;
  const v = toARS(tx, rates);
  return tx.type === "expense" ? -v : v;
}

export type MonthStats = ReturnType<typeof computeMonth>;

export function computeMonth(txs: Transaction[], ym: string, rates: FxRates) {
  const { start, end, last } = monthBounds(ym);
  const mine = txs.filter((t) => t.date >= start && t.date <= end);
  const expenses = mine.filter((t) => t.type === "expense");
  const income = mine.filter((t) => t.type === "income");
  const spent = expenses.reduce((s, t) => s + toARS(t, rates), 0);
  const earned = income.reduce((s, t) => s + toARS(t, rates), 0);

  const byCat: Record<string, number> = {};
  for (const t of expenses) {
    byCat[t.categoryId] = (byCat[t.categoryId] ?? 0) + toARS(t, rates);
  }

  const byDay: { date: string; spent: number; earned: number; count: number }[] = [];
  for (let d = 1; d <= last; d++) {
    const date = `${ym}-${String(d).padStart(2, "0")}`;
    const dayTx = mine.filter((t) => t.date === date);
    byDay.push({
      date,
      spent: dayTx.filter((t) => t.type === "expense").reduce((s, t) => s + toARS(t, rates), 0),
      earned: dayTx.filter((t) => t.type === "income").reduce((s, t) => s + toARS(t, rates), 0),
      count: dayTx.length,
    });
  }

  const today = todayISO();
  const elapsed = ym === today.slice(0, 7) ? Number(today.slice(8)) : last;
  const avgDaily = elapsed > 0 ? spent / elapsed : 0;
  const projected = avgDaily * last;

  const byMethod: Record<string, number> = {};
  for (const t of expenses) {
    byMethod[t.method] = (byMethod[t.method] ?? 0) + toARS(t, rates);
  }

  const merchants: Record<string, number> = {};
  for (const t of expenses) {
    const key = t.merchant.trim() || t.note.trim() || "Sin detalle";
    merchants[key] = (merchants[key] ?? 0) + toARS(t, rates);
  }
  const topMerchants = Object.entries(merchants)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amount]) => ({ name, amount }));

  const weekday = [0, 0, 0, 0, 0, 0, 0];
  const weekdayCount = [0, 0, 0, 0, 0, 0, 0];
  for (const d of byDay) {
    if (d.date > today) continue;
    const wd = new Date(`${d.date}T12:00:00`).getDay();
    weekday[wd] += d.spent;
    weekdayCount[wd] += 1;
  }
  const weekdayAvg = weekday.map((v, i) => (weekdayCount[i] ? v / weekdayCount[i] : 0));

  return {
    ym,
    start,
    end,
    last,
    elapsed,
    spent,
    earned,
    net: earned - spent,
    count: mine.length,
    expenseCount: expenses.length,
    byCat,
    byDay,
    byMethod,
    topMerchants,
    avgDaily,
    projected,
    weekdayAvg,
    txs: mine,
  };
}

export function categoryRows(
  byCat: Record<string, number>,
  budgets: Record<string, number>,
  cats: Category[] = CATEGORIES.filter((c) => c.kind === "expense"),
) {
  return cats.filter((c) => c.kind === "expense")
    .map((c) => ({
      ...c,
      spent: byCat[c.id] ?? 0,
      budget: budgets[c.id] ?? 0,
    }))
    .sort((a, b) => b.spent - a.spent);
}

export function heatmapMax(byDay: { spent: number }[]) {
  return Math.max(1, ...byDay.map((d) => d.spent));
}

export function snapshotText(
  current: MonthStats,
  previous: MonthStats,
  budgets: Record<string, number>,
  globalBudget: number,
  rates?: FxRates,
) {
  const catLines = categoryRows(current.byCat, budgets)
    .filter((c) => c.spent > 0 || c.budget > 0)
    .map((c) => {
      const pct = c.budget ? Math.round((c.spent / c.budget) * 100) : 0;
      return `- ${c.name}: ${Math.round(c.spent)} / ${c.budget || "s/p"} (${pct}%)`;
    })
    .join("\n");

  const recent = [...current.txs]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 40)
    .map((t) => {
      const sign = t.type === "expense" ? "-" : t.type === "income" ? "+" : "~";
      const cat = CATEGORY_MAP[t.categoryId]?.name ?? t.categoryId;
      const detail = t.merchant || t.note || "";
      return `${t.date} ${sign}${t.amount} ${t.currency} ${cat} ${detail} [${t.method}]`;
    })
    .join("\n");

  const deltaSpent = previous.spent ? ((current.spent - previous.spent) / previous.spent) * 100 : 0;
  const fxLine = rates
    ? `FX USD: ${Math.round(rates.usd)} ARS · USDT: ${Math.round(rates.usdt)} ARS\n`
    : "";

  return `MES ${current.ym}
${fxLine}GASTOS: ${Math.round(current.spent)} ARS
INGRESOS: ${Math.round(current.earned)} ARS
NETO: ${Math.round(current.net)} ARS
PRESUPUESTO GLOBAL: ${Math.round(current.spent)} / ${globalBudget} (${globalBudget ? Math.round((current.spent / globalBudget) * 100) : 0}%)
PROMEDIO DIARIO: ${Math.round(current.avgDaily)}
PROYECCION CIERRE: ${Math.round(current.projected)}
VS MES ANTERIOR (${previous.ym}): ${deltaSpent.toFixed(1)}%
CATEGORIAS:
${catLines}
TOP COMERCIOS:
${current.topMerchants.map((m) => `- ${m.name}: ${Math.round(m.amount)}`).join("\n")}
MOVIMIENTOS RECIENTES:
${recent}`;
}

export function compareDelta(current: number, previous: number) {
  if (!previous) return { pct: 0, dir: "flat" as const };
  const pct = ((current - previous) / previous) * 100;
  return { pct, dir: pct > 1 ? ("up" as const) : pct < -1 ? ("down" as const) : ("flat" as const) };
}

export function currencyBadge(c: Currency) {
  return c;
}

export { prevMonth };
