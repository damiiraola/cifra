/**
 * One sentence → a draft for Nuevo (the user always confirms there). Pure.
 *
 * - `cuotasFromText`: "tele 600 mil en 12 con la Visa" is read here, without
 *   the model (no AI call, works with the assistant off).
 * - `draftFromModel`: the model's JSON ("parse" mode) for everything else,
 *   cuotas and card included when it says so.
 */
import type { Card, Currency, PayMethod, Transaction, TxType } from "./types.ts";

export type MovementDraft = Partial<Transaction>;
type CardLike = Pick<Card, "id" | "name" | "network" | "accountArsId" | "accountUsdId">;

const METHODS = new Set<PayMethod>([
  "efectivo",
  "debito",
  "credito",
  "transferencia",
  "mercadopago",
  "crypto",
  "otro",
]);

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const NETWORK_WORDS: Record<string, string[]> = {
  visa: ["visa"],
  master: ["master", "mastercard"],
  amex: ["amex", "american"],
  cabal: ["cabal"],
  naranja: ["naranja"],
};

/** The card a sentence or the model names ("con la Visa", "la galicia"). */
export function matchCard<T extends CardLike>(cards: T[], text: unknown): T | undefined {
  const q = typeof text === "string" ? norm(text) : "";
  if (!q || !cards.length) return undefined;
  const words = new Set(q.split(/[^a-z0-9]+/).filter(Boolean));
  let best: { card: T; score: number } | undefined;
  for (const card of cards) {
    const name = norm(card.name);
    let score = q.includes(name) ? 10 : 0;
    for (const w of name.split(/[^a-z0-9]+/)) if (w.length >= 3 && words.has(w)) score += 2;
    for (const w of NETWORK_WORDS[card.network] ?? []) if (words.has(w)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { card, score };
  }
  return best?.card;
}

const AMOUNT =
  /(?:\$\s*)?(\d+(?:[.,]\d+)*)\s*(mil\b|k\b|lucas?\b|palos?\b|millones\b|mill[oó]n\b|m\b)?/gi;

function amountOf(n: string, word = "") {
  const w = norm(word);
  const decimal = /^\d+[.,]\d{1,2}$/.test(n);
  const base = decimal ? Number(n.replace(",", ".")) : Number(n.replace(/[.,]/g, ""));
  const mult = /^(mil|k|luca)/.test(w) ? 1_000 : /^(palo|millon|m$)/.test(w) ? 1_000_000 : 1;
  return Math.round(base * mult * 100) / 100;
}

const FILLER = new Set(
  "compre compré comprar compro me quiero una un unos unas la el los las de del en con cuotas cuota sin interes interés tarjeta y por a".split(
    " ",
  ),
);

/**
 * "tele 600 mil en 12 con la Visa" → a cuotas purchase for Nuevo: price,
 * cuotas, card. Null when it is not clearly a purchase in cuotas (then the
 * model reads it). "con interés" is left to Nuevo: the amount means something
 * else there.
 */
export function cuotasFromText(
  text: string,
  cards: CardLike[],
  today: string,
): MovementDraft | null {
  const t = text.trim();
  if (!t || /con\s+inter[eé]s|d[oó]lares|usd|usdt/i.test(t)) return null;
  const n = t.match(/\ben\s+(\d{1,2})(?:\s*cuotas?)?\b|\b(\d{1,2})\s*cuotas\b/i);
  const count = n ? Number(n[1] ?? n[2]) : 0;
  if (!(count >= 2 && count <= 72)) return null;
  const rest = t.replace(n![0], " ");
  let amount = 0;
  let amountText = "";
  for (const m of rest.matchAll(AMOUNT)) {
    const v = amountOf(m[1]!, m[2]);
    if (v >= 1_000) {
      amount = v;
      amountText = m[0];
      break;
    }
  }
  if (!amount) return null;
  const cardPart = rest.match(/\bcon\s+(?:la\s+|el\s+|mi\s+)?([\p{L}\d ]{2,30})$/iu);
  const card =
    matchCard(cards, cardPart?.[1] ?? rest) ?? (cards.length === 1 ? cards[0] : undefined);
  const what = rest
    .replace(amountText, " ")
    .replace(cardPart?.[0] ?? "", " ")
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w && !FILLER.has(norm(w)) && !(card && matchCard([card], w)))
    .join(" ")
    .slice(0, 40)
    .trim();
  return {
    type: "expense",
    amount,
    currency: "ARS",
    method: "credito",
    ...(card ? { accountId: card.accountArsId } : {}),
    merchant: what ? what[0]!.toUpperCase() + what.slice(1) : "",
    categoryId: "compras",
    note: "",
    date: today,
    installmentCount: count,
  };
}

/** The model's JSON ("parse" mode) → a draft; null when there is no usable amount. */
export function draftFromModel(
  raw: string,
  opts: {
    allowedCategories: Set<string>;
    knownCategory?: (id: string) => boolean;
    cards: CardLike[];
    today: string;
  },
): MovementDraft | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const amount = Number(j.amount);
  if (!(amount > 0)) return null;
  const type: TxType = j.type === "income" ? "income" : "expense";
  const cat = typeof j.categoryId === "string" ? j.categoryId : "";
  const categoryId =
    cat && (opts.allowedCategories.has(cat) || opts.knownCategory?.(cat))
      ? cat
      : type === "income"
        ? "otros-ing"
        : "otros";
  const currency: Currency = j.currency === "USDT" ? "USDT" : j.currency === "USD" ? "USD" : "ARS";
  const date =
    typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : opts.today;
  let method: PayMethod = METHODS.has(j.method as PayMethod) ? (j.method as PayMethod) : "otro";
  const count = Math.round(Number(j.installments) || 0);
  const cuotas = type === "expense" && count >= 2 && count <= 72;
  const card = type === "expense" ? matchCard(opts.cards, j.card) : undefined;
  if (cuotas || card) method = "credito";
  const accountId = card
    ? currency === "ARS"
      ? card.accountArsId
      : currency === "USD"
        ? card.accountUsdId
        : ""
    : "";
  return {
    type,
    amount,
    currency,
    categoryId,
    merchant: typeof j.merchant === "string" ? j.merchant : "",
    note: typeof j.note === "string" ? j.note : "",
    date,
    method,
    ...(accountId ? { accountId } : {}),
    ...(cuotas ? { installmentCount: count } : {}),
  };
}
