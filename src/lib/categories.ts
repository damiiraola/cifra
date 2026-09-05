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
