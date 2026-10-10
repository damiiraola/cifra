/**
 * Onboarding rules (UX audit 2026-10-10, P4). Pure, with tests.
 *
 * Before: the first screen asked for a "tope de gasto" prefilled with an
 * invented $ 1.150.000, and the fijos screen showed 10 empty fields at once.
 * Now: first what comes in, a tope suggested from it (nothing invented when
 * it is empty), and the fijos a few at a time.
 */
import { FIJO_TEMPLATES } from "./recurring.ts";

/** Share of the income suggested as the month's spending tope; the rest is for savings and goals. */
export const TOPE_SHARE = 0.8;

/** Suggested tope from the monthly income, rounded down to $ 10.000. 0 when there is no income. */
export function suggestTope(income: number | null | undefined): number {
  if (!income || !(income > 0)) return 0;
  return Math.floor((income * TOPE_SHARE) / 10_000) * 10_000;
}

/** The fijos shown first: the most common ones. The rest are behind "Agregar otro". */
export const COMMON_FIJOS = ["Alquiler", "Expensas", "Internet", "Prepaga"] as const;

export function moreFijos(): string[] {
  const common = new Set<string>(COMMON_FIJOS);
  return FIJO_TEMPLATES.filter((t) => t.type === "expense" && !common.has(t.name)).map((t) => t.name);
}

export type OnboardingFijo = { name: string; amount: number };

/** Rows with an amount, the income first as "Sueldo". Names trimmed, duplicates dropped. */
export function onboardingFijos(income: number | null, rows: { name: string; amount: number | null }[]): OnboardingFijo[] {
  const out: OnboardingFijo[] = [];
  const seen = new Set<string>();
  if (income && income > 0) {
    out.push({ name: "Sueldo", amount: income });
    seen.add("sueldo");
  }
  for (const r of rows) {
    const name = r.name.trim();
    const key = name.toLowerCase();
    if (!name || !r.amount || !(r.amount > 0) || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, amount: r.amount });
  }
  return out;
}

/** Template for a fijo name (day, category, method), or a generic expense for a custom one. */
export function templateFor(name: string) {
  const t = FIJO_TEMPLATES.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  return t ?? { name: name.trim(), categoryId: "servicios", day: 10, method: "debito" as const, type: "expense" as const };
}
