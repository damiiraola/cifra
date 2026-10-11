/**
 * Carga rápida escribiendo: "15 mil super débito", "usd 25 amazon tarjeta visa".
 * DETERMINISTIC: rules and word lists, no AI and no cost. The result is a
 * draft that Nuevo shows as an editable preview; nothing is saved here.
 */
import type { Account, Card, Currency, PayMethod, Transaction, TxType } from "./types.ts";
import { AMOUNT, amountOf, cuotasFromText, matchCard, norm } from "./movement-parse.ts";

type CardLike = Pick<Card, "id" | "name" | "network" | "accountArsId" | "accountUsdId">;
type AccountLike = Pick<Account, "id" | "name" | "kind" | "currency">;

export type QuickText = {
  draft: Partial<Transaction>;
  /** What was understood, in order, for the preview ("$ 15.000", "Débito"...). */
  bits: { kind: "amount" | "type" | "category" | "caja" | "card" | "date" | "cuotas" | "merchant"; label: string }[];
};

/** Word → category id. Common Argentine merchants and words. */
const CATEGORY_WORDS: [string, string[]][] = [
  ["alimentos", ["super", "supermercado", "coto", "carrefour", "dia", "jumbo", "disco", "chino", "verduleria", "carniceria", "panaderia", "almacen", "kiosco", "rappi", "pedidosya", "comida", "cafe", "resto", "restaurante", "birra", "delivery", "mcdonalds", "burger", "pizza", "helado"]],
  ["transporte", ["sube", "uber", "cabify", "didi", "taxi", "nafta", "ypf", "shell", "axion", "peaje", "estacionamiento", "colectivo", "subte", "tren"]],
  ["vivienda", ["alquiler", "expensas", "ferreteria"]],
  ["servicios", ["luz", "gas", "agua", "edenor", "edesur", "metrogas", "aysa", "internet", "fibertel", "telecentro", "celular", "personal", "claro", "movistar"]],
  ["salud", ["farmacia", "farmacity", "medico", "osde", "swiss", "prepaga", "dentista", "remedios"]],
  ["educacion", ["curso", "facultad", "colegio", "libros", "libreria"]],
  ["ocio", ["cine", "teatro", "recital", "bar", "boliche", "steam", "salida"]],
  ["compras", ["amazon", "mercadolibre", "meli", "ropa", "zapatillas", "shein", "temu", "fravega", "garbarino", "musimundo"]],
  ["suscripciones", ["netflix", "spotify", "disney", "hbo", "max", "youtube", "icloud", "chatgpt", "prime", "paramount", "gym", "gimnasio"]],
  ["impuestos", ["abl", "patente", "monotributo", "afip", "arca", "arba", "impuesto"]],
];
const INCOME_WORDS = /\b(cobre|cobro|sueldo|ingreso|me pagaron|me transfirieron|aguinaldo|honorarios|venta|vendi)\b/;
const INCOME_CATEGORY: [string, RegExp][] = [
  ["sueldo", /\b(sueldo|aguinaldo)\b/],
  ["freelance", /\b(honorarios|freelance|cliente)\b/],
  ["ventas", /\b(venta|vendi)\b/],
];
const STOP = new Set("en de del la el los las con un una por para y a mi me pague gaste gasto compre hoy ayer anteayer pesos peso ars".split(" "));
const CURRENCY_RE = /\b(usdt)\b|\b(usd|u\$s|us\$|dolares?|dolar|verdes?)\b/;

function fmt(n: number, c: Currency) {
  const s = n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return c === "ARS" ? `$ ${s}` : `${c === "USD" ? "US$" : "USDT"} ${s}`;
}

function shiftDay(iso: string, d: number) {
  const t = new Date(`${iso}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}

export function quickFromText(
  text: string,
  ctx: { accounts: AccountLike[]; cards: CardLike[]; today: string; categoryName?: (id: string) => string },
): QuickText | null {
  const raw = text.trim();
  if (!raw) return null;
  const q = ` ${norm(raw).replace(/u\$s/g, " usd ").replace(/us\$/g, " usd ")} `;
  const bits: QuickText["bits"] = [];
  const catName = ctx.categoryName ?? ((id: string) => id);

  // Cuotas in pesos: reuse the assistant's deterministic reader.
  const cuotas = cuotasFromText(raw, ctx.cards, ctx.today);

  // Currency.
  const cm = q.match(CURRENCY_RE);
  const currency: Currency = cm?.[1] ? "USDT" : cm?.[2] ? "USD" : "ARS";

  // Amount: first number (with mil/k/lucas/palo). Skip "en 12" cuotas and dates.
  let amount = cuotas?.amount ?? 0;
  let amountText = "";
  if (!amount) {
    const body = q.replace(/\ben\s+\d{1,2}\s*(cuotas?)?\b|\b\d{1,2}\s*cuotas\b/g, " ");
    for (const m of body.matchAll(AMOUNT)) {
      // "1.250,50": thousands with dots and decimals with a comma.
      const v = /^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(m[1]!)
        ? Number(m[1]!.replace(/\./g, "").replace(",", "."))
        : amountOf(m[1]!, m[2]);
      if (v > 0) {
        amount = v;
        amountText = m[0];
        break;
      }
    }
  }
  if (!(amount > 0)) return null;

  const type: TxType = INCOME_WORDS.test(q) ? "income" : "expense";
  bits.push({ kind: "type", label: type === "income" ? "Ingreso" : "Gasto" });
  bits.push({ kind: "amount", label: fmt(amount, currency) });

  // Date.
  let date = ctx.today;
  if (/\banteayer\b/.test(q)) date = shiftDay(ctx.today, -2);
  else if (/\bayer\b/.test(q)) date = shiftDay(ctx.today, -1);
  if (date !== ctx.today) bits.push({ kind: "date", label: /\banteayer\b/.test(q) ? "Anteayer" : "Ayer" });

  // Caja / card / method.
  const pick = (kind: Account["kind"], cur: Currency = currency) =>
    ctx.accounts.find((a) => a.kind === kind && a.currency === cur) ?? ctx.accounts.find((a) => a.kind === kind);
  let accountId = "";
  let method: PayMethod = "otro";
  let card: CardLike | undefined;
  const wantsCard = /\b(tarjeta|credito|visa|master|mastercard|amex|cabal|naranja)\b/.test(q) || !!cuotas;
  if (wantsCard && type === "expense") {
    card = matchCard(ctx.cards, raw) ?? (ctx.cards.length === 1 ? ctx.cards[0] : undefined);
    method = "credito";
    if (card) accountId = currency === "ARS" ? card.accountArsId : currency === "USD" ? card.accountUsdId : "";
    bits.push({ kind: "card", label: card ? card.name : "Tarjeta (elegila)" });
  } else if (/\b(debito|transferencia|transferi|banco)\b/.test(q)) {
    method = /\btransfer/.test(q) ? "transferencia" : "debito";
    accountId = pick("bank")?.id ?? "";
  } else if (/\b(mp|mercado ?pago|mercadopago)\b/.test(q)) {
    method = "mercadopago";
    accountId = pick("mp")?.id ?? "";
  } else if (/\b(efectivo|cash|billete)\b/.test(q)) {
    method = "efectivo";
    accountId = pick("cash")?.id ?? "";
  }
  // A caja named in the text wins ("galicia", "brubank"), if not a card.
  if (!card) {
    const named = ctx.accounts.find((a) => a.kind !== "card" && norm(a.name).length >= 3 && q.includes(` ${norm(a.name)} `));
    if (named) accountId = named.id;
  }
  if (!accountId && currency !== "ARS" && !card) accountId = ctx.accounts.find((a) => a.currency === currency && a.kind !== "card")?.id ?? "";
  if (accountId && !card) {
    const a = ctx.accounts.find((x) => x.id === accountId);
    if (a) bits.push({ kind: "caja", label: method === "debito" || method === "transferencia" ? `${a.name} (${method === "debito" ? "débito" : "transferencia"})` : a.name });
  }

  // Category.
  const words = q.split(/[^a-z0-9]+/).filter(Boolean);
  let categoryId = "";
  if (type === "income") {
    categoryId = INCOME_CATEGORY.find(([, re]) => re.test(q))?.[0] ?? "otros-ing";
  } else {
    for (const [id, list] of CATEGORY_WORDS) if (list.some((w) => words.includes(w))) { categoryId = id; break; }
    if (!categoryId) categoryId = cuotas ? "compras" : "otros";
  }
  bits.push({ kind: "category", label: catName(categoryId) });

  // Merchant: what is left, without the words already used.
  const used = new Set<string>([
    ...norm(amountText).split(/[^a-z0-9]+/),
    "usd", "usdt", "dolar", "dolares", "verde", "verdes", "tarjeta", "credito", "debito", "transferencia", "transferi", "banco",
    "mp", "mercado", "pago", "mercadopago", "efectivo", "cash", "billete", "cuotas", "cuota",
    "cobre", "cobro", "ingreso", "mil", "k", "lucas", "luca", "palo", "palos",
    ...(card ? norm(card.name).split(/[^a-z0-9]+/) : []),
    ...(card ? ["visa", "master", "mastercard", "amex", "cabal", "naranja"] : []),
    ...ctx.accounts.filter((a) => a.id === accountId).flatMap((a) => norm(a.name).split(/[^a-z0-9]+/)),
  ]);
  const original = raw.split(/\s+/);
  const merchantWords = original.filter((w) => {
    const n = norm(w).replace(/[^a-z0-9]/g, "");
    return n && !used.has(n) && !STOP.has(n) && !/^\$?\d+([.,]\d+)*$/.test(n) && !(cuotas && /^\d{1,2}$/.test(n));
  });
  let merchant = cuotas?.merchant || merchantWords.join(" ").slice(0, 40);
  if (merchant) merchant = merchant[0]!.toUpperCase() + merchant.slice(1);
  if (merchant) bits.push({ kind: "merchant", label: merchant });
  if (cuotas?.installmentCount) bits.push({ kind: "cuotas", label: `${cuotas.installmentCount} cuotas` });

  return {
    draft: {
      type,
      amount,
      currency,
      categoryId,
      merchant,
      note: "",
      date,
      // Only when it says something the caja does not (débito/transferencia on a bank, crédito).
      ...(method === "credito" || method === "debito" || method === "transferencia" ? { method } : {}),
      ...(accountId ? { accountId } : {}),
      ...(cuotas?.installmentCount ? { installmentCount: cuotas.installmentCount } : {}),
    },
    bits,
  };
}
