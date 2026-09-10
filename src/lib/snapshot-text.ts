import type { Category } from "./types";

export type SnapshotFijo = {
  name: string;
  day: number;
  type: "expense" | "income";
  amount: number;
  currency: string;
  active: boolean;
};

export type SnapshotTotals = {
  ym: string;
  spent: number;
  earned: number;
  net: number;
  avgDaily: number;
  projected: number;
  byCat: Record<string, number>;
};

export function categoryRows(
  byCat: Record<string, number>,
  budgets: Record<string, number>,
  cats: Category[],
) {
  return cats
    .filter((c) => c.kind === "expense")
    .map((c) => ({
      ...c,
      spent: byCat[c.id] ?? 0,
      budget: budgets[c.id] ?? 0,
    }))
    .sort((a, b) => b.spent - a.spent);
}

export function snapshotText(
  current: SnapshotTotals,
  previous: Pick<SnapshotTotals, "ym" | "spent">,
  budgets: Record<string, number>,
  globalBudget: number,
  rates?: { usd: number; usdt: number },
  cats: Category[] = [],
  fijos: SnapshotFijo[] = [],
) {
  const catLines = categoryRows(current.byCat, budgets, cats)
    .filter((c) => c.spent > 0 || c.budget > 0)
    .map((c) => {
      const pct = c.budget ? Math.round((c.spent / c.budget) * 100) : 0;
      return `- ${c.name}: ${Math.round(c.spent)} / ${c.budget || "s/p"} (${pct}%)`;
    })
    .join("\n");

  const fijoLines = fijos
    .map((r) => {
      const kind = r.type === "income" ? "ingreso" : "gasto";
      const paused = r.active ? "" : " (pausado)";
      return `- ${r.name} ${kind} día ${r.day}: ${Math.round(r.amount)} ${r.currency}${paused}`;
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
${catLines || "-"}
FIJOS:
${fijoLines || "-"}`;
}
