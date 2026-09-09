import type { Category } from "./types";

export const CATEGORIES: Category[] = [
  { id: "alimentos", name: "Alimentación", kind: "expense", token: "cat-food", icon: "Utensils" },
  { id: "transporte", name: "Transporte", kind: "expense", token: "cat-transit", icon: "Bus" },
  { id: "vivienda", name: "Vivienda", kind: "expense", token: "cat-home", icon: "Home" },
  { id: "servicios", name: "Servicios", kind: "expense", token: "cat-util", icon: "Zap" },
  { id: "salud", name: "Salud", kind: "expense", token: "cat-health", icon: "HeartPulse" },
  { id: "educacion", name: "Educación", kind: "expense", token: "cat-edu", icon: "GraduationCap" },
  { id: "ocio", name: "Ocio", kind: "expense", token: "cat-fun", icon: "Clapperboard" },
  { id: "compras", name: "Compras", kind: "expense", token: "cat-shop", icon: "ShoppingBag" },
  { id: "suscripciones", name: "Suscripciones", kind: "expense", token: "cat-sub", icon: "Repeat" },
  { id: "impuestos", name: "Impuestos", kind: "expense", token: "cat-tax", icon: "FileText" },
  { id: "transferencias", name: "Transferencias", kind: "expense", token: "cat-xfer", icon: "ArrowLeftRight" },
  { id: "otros", name: "Otros", kind: "expense", token: "cat-other", icon: "Ellipsis" },
  { id: "sueldo", name: "Sueldo", kind: "income", token: "cat-income", icon: "Banknote" },
  { id: "ventas", name: "Ventas", kind: "income", token: "cat-income", icon: "Store" },
  { id: "freelance", name: "Freelance", kind: "income", token: "cat-income", icon: "Briefcase" },
  { id: "inversiones", name: "Inversiones", kind: "income", token: "cat-income", icon: "TrendingUp" },
  { id: "otros-ing", name: "Otros ingresos", kind: "income", token: "cat-income", icon: "Plus" },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const DEFAULT_BUDGETS: Record<string, number> = {
  alimentos: 220_000,
  transporte: 90_000,
  vivienda: 480_000,
  servicios: 95_000,
  salud: 40_000,
  educacion: 25_000,
  ocio: 60_000,
  compras: 80_000,
  suscripciones: 35_000,
  impuestos: 50_000,
  transferencias: 40_000,
  otros: 30_000,
};

export const DEFAULT_GLOBAL_BUDGET = 1_150_000;

export function catColorVar(token: string) {
  return `var(--color-${token})`;
}

export const COLOR_TOKENS = [
  "cat-food",
  "cat-transit",
  "cat-home",
  "cat-util",
  "cat-health",
  "cat-edu",
  "cat-fun",
  "cat-shop",
  "cat-sub",
  "cat-tax",
  "cat-xfer",
  "cat-other",
] as const;

export const BUILTIN_IDS = new Set(CATEGORIES.map((c) => c.id));

export function parseCustomCategories(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return [];
  const out: Category[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? "");
    const name = String(o.name ?? "").trim().slice(0, 40);
    if (!id.startsWith("c_") || name.length < 2) continue;
    const kind = o.kind === "income" ? "income" : "expense";
    const token = COLOR_TOKENS.includes(o.token as (typeof COLOR_TOKENS)[number])
      ? String(o.token)
      : kind === "income"
        ? "cat-income"
        : "cat-other";
    const icon = String(o.icon ?? (kind === "income" ? "Plus" : "Ellipsis")).slice(0, 40);
    out.push({ id, name, kind, token, icon });
  }
  return out;
}

export function parseHiddenIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))];
}

export function mergedCategories(custom: Category[], names: Record<string, string>): Category[] {
  if ((!custom || custom.length === 0) && (!names || Object.keys(names).length === 0)) {
    return CATEGORIES;
  }
  return [...CATEGORIES, ...custom].map((c) => ({
    ...c,
    name: names[c.id]?.trim() || c.name,
  }));
}

export function categoryMap(custom: Category[], names: Record<string, string>): Record<string, Category> {
  return Object.fromEntries(mergedCategories(custom, names).map((c) => [c.id, c]));
}

export function nextCustomStyle(customCount: number, kind: Category["kind"]): Pick<Category, "token" | "icon"> {
  if (kind === "income") return { token: "cat-income", icon: "Plus" };
  return {
    token: COLOR_TOKENS[customCount % COLOR_TOKENS.length],
    icon: "Ellipsis",
  };
}
