import { DEFAULT_BUDGETS } from "./categories";
import { emptyTxFields } from "./books";
import { uid, todayISO } from "./utils";
import type { PayMethod, Transaction } from "./types";

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function between(rng: () => number, min: number, max: number) {
  return Math.round(min + rng() * (max - min));
}

const CATALOG: {
  categoryId: string;
  merchants: string[];
  min: number;
  max: number;
  methods: PayMethod[];
  notes: string[];
  weight: number;
}[] = [
  {
    categoryId: "alimentos",
    merchants: ["Coto", "Día", "Carrefour", "Verdulería del barrio", "Panadería", "PedidosYa"],
    min: 8_500,
    max: 72_000,
    methods: ["debito", "mercadopago", "efectivo"],
    notes: ["Super semanal", "Fruta y verdura", "Pan", "Delivery"],
    weight: 8,
  },
  {
    categoryId: "transporte",
    merchants: ["SUBE", "YPF", "Shell", "Uber", "Cabify"],
    min: 1_200,
    max: 48_000,
    methods: ["debito", "mercadopago", "efectivo"],
    notes: ["Carga SUBE", "Nafta", "Viaje"],
    weight: 5,
  },
  {
    categoryId: "ocio",
    merchants: ["Café Martínez", "Starbucks", "Cine Hoyts", "Bar de la esquina", "Spotify bar"],
    min: 4_000,
    max: 32_000,
    methods: ["mercadopago", "credito", "efectivo"],
    notes: ["Café", "Salida", "Cine"],
    weight: 3,
  },
  {
    categoryId: "salud",
    merchants: ["Farmacity", "Farmacia del pueblo", "OSDE copago"],
    min: 6_000,
    max: 38_000,
    methods: ["debito", "credito"],
    notes: ["Farmacia", "Consulta"],
    weight: 1,
  },
  {
    categoryId: "compras",
    merchants: ["Mercado Libre", "Zara", "Easy", "Local de ropa"],
    min: 12_000,
    max: 95_000,
    methods: ["credito", "mercadopago"],
    notes: ["Compra", "Reposición"],
    weight: 2,
  },
  {
    categoryId: "otros",
    merchants: ["Kiosco", "Regalo", "Varios"],
    min: 2_000,
    max: 18_000,
    methods: ["efectivo", "mercadopago"],
    notes: ["Varios"],
    weight: 2,
  },
];

const FIXED: Omit<Transaction, "id" | "createdAt" | "bookId" | "accountId" | "counterpartyId" | "amountTo" | "rateArs" | "rateLocked" | "recurringId">[] = [
  {
    type: "expense",
    amount: 450_000,
    currency: "ARS",
    categoryId: "vivienda",
    note: "Alquiler",
    merchant: "Alquiler",
    date: "",
    method: "transferencia",
  },
  {
    type: "expense",
    amount: 42_000,
    currency: "ARS",
    categoryId: "servicios",
    note: "Luz",
    merchant: "Edenor",
    date: "",
    method: "debito",
  },
  {
    type: "expense",
    amount: 28_500,
    currency: "ARS",
    categoryId: "servicios",
    note: "Internet",
    merchant: "Fibertel / Personal",
    date: "",
    method: "debito",
  },
  {
    type: "expense",
    amount: 12_900,
    currency: "ARS",
    categoryId: "suscripciones",
    note: "Streaming",
    merchant: "Netflix",
    date: "",
    method: "credito",
  },
  {
    type: "expense",
    amount: 8_500,
    currency: "ARS",
    categoryId: "suscripciones",
    note: "Música",
    merchant: "Spotify",
    date: "",
    method: "credito",
  },
  {
    type: "expense",
    amount: 19,
    currency: "USD",
    categoryId: "suscripciones",
    note: "Claude / tools",
    merchant: "Software",
    date: "",
    method: "credito",
  },
];

export function buildSeed(now = new Date()): Transaction[] {
  const rng = mulberry32(20260903);
  const txs: Transaction[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let back = 0; back < 92; back++) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    const iso = todayISO(d);
    const day = d.getDate();
    const wd = d.getDay();

    if (day === 1) {
      txs.push(makeTx({
        type: "income",
        amount: 1_850_000,
        currency: "ARS",
        categoryId: "sueldo",
        note: "Sueldo",
        merchant: "Sueldo",
        date: iso,
        method: "transferencia",
      }, rng));
      const rent = FIXED[0]!;
      txs.push(makeTx({ ...rent, date: iso }, rng));
    }
    if (day === 5) {
      txs.push(makeTx({ ...FIXED[1]!, date: iso, amount: between(rng, 38_000, 52_000) }, rng));
    }
    if (day === 8) {
      txs.push(makeTx({ ...FIXED[2]!, date: iso }, rng));
    }
    if (day === 12) {
      txs.push(makeTx({ ...FIXED[3]!, date: iso }, rng));
      txs.push(makeTx({ ...FIXED[4]!, date: iso }, rng));
    }
    if (day === 15) {
      txs.push(makeTx({
        type: "income",
        amount: between(rng, 280_000, 620_000),
        currency: "ARS",
        categoryId: "freelance",
        note: "Proyecto",
        merchant: "Freelance",
        date: iso,
        method: "transferencia",
      }, rng));
    }
    if (day === 18) {
      txs.push(makeTx({ ...FIXED[5]!, date: iso }, rng));
    }
    if (day === 22) {
      txs.push(makeTx({
        type: "expense",
        amount: 80,
        currency: "USDT",
        categoryId: "transferencias",
        note: "P2P",
        merchant: "Binance",
        date: iso,
        method: "crypto",
      }, rng));
    }
    if (day === 20 && rng() > 0.4) {
      txs.push(makeTx({
        type: "expense",
        amount: between(rng, 35_000, 78_000),
        currency: "ARS",
        categoryId: "impuestos",
        note: "Monotributo / IIBB",
        merchant: "AFIP",
        date: iso,
        method: "transferencia",
      }, rng));
    }

    const rolls = wd === 0 || wd === 6 ? 1 + (rng() > 0.3 ? 1 : 0) : rng() > 0.25 ? 1 : 0;
    for (let i = 0; i < rolls; i++) {
      const pool = CATALOG.flatMap((c) => Array.from({ length: c.weight }, () => c));
      const item = pick(rng, pool);
      const merchant = pick(rng, item.merchants);
      txs.push(makeTx({
        type: "expense",
        amount: between(rng, item.min, item.max),
        currency: "ARS",
        categoryId: item.categoryId,
        note: pick(rng, item.notes),
        merchant,
        date: iso,
        method: pick(rng, item.methods),
      }, rng));
    }
  }

  return txs.sort((a, b) => a.date.localeCompare(b.date));
}

function makeTx(
  partial: Omit<Transaction, "id" | "createdAt" | "bookId" | "accountId" | "counterpartyId" | "amountTo" | "rateArs" | "rateLocked" | "recurringId">,
  rng: () => number,
): Transaction {
  const hour = 8 + Math.floor(rng() * 12);
  const min = Math.floor(rng() * 60);
  return {
    ...emptyTxFields(),
    ...partial,
    id: uid(),
    createdAt: `${partial.date}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`,
  };
}

export { DEFAULT_BUDGETS };
