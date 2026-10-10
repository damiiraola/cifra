/**
 * The card a statement PDF belongs to (pure, no IA): issuer, network, last 4
 * digits, limit, TNA, dates and totals, read straight from the PDF's own
 * lines on the server. The card number never goes to the model (it is
 * redacted before); only its last 4 digits come back to the browser, to
 * recognise the card. Plus: which loaded card it is, the new card to propose,
 * what changed on an existing one, and the debt that came from before.
 */
import type { BankStatement, Card, CardNetwork } from "./types";
import type { ParsedStatement } from "./statement-import.ts";

export type StatementCardInfo = {
  network: CardNetwork | null;
  bank: string | null;
  last4: string | null;
  limitArs: number | null;
  tna: number | null;
  closingDate: string | null;
  dueDate: string | null;
  nextClosingDate: string | null;
  nextDueDate: string | null;
  totalArs: number | null;
  totalUsd: number | null;
  minimumArs: number | null;
};

export const EMPTY_CARD_INFO: StatementCardInfo = {
  network: null,
  bank: null,
  last4: null,
  limitArs: null,
  tna: null,
  closingDate: null,
  dueDate: null,
  nextClosingDate: null,
  nextDueDate: null,
  totalArs: null,
  totalUsd: null,
  minimumArs: null,
};

/** Lowercase, no accents. */
export function foldText(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------ issuer & network

const NETWORKS: { id: CardNetwork; re: RegExp }[] = [
  { id: "amex", re: /american express|\bamex\b/ },
  { id: "master", re: /master ?card|\bmaster\b/ },
  { id: "visa", re: /\bvisa\b/ },
  { id: "cabal", re: /\bcabal\b/ },
  { id: "naranja", re: /\bnaranja\b/ },
];

export const NETWORK_SHORT: Record<CardNetwork, string> = {
  visa: "Visa",
  master: "Mastercard",
  amex: "Amex",
  cabal: "Cabal",
  naranja: "Naranja X",
  otra: "Tarjeta",
};

/** Argentine issuers, by how they print their name. Order: the more specific first. */
export const BANKS: { name: string; re: RegExp }[] = [
  { name: "Galicia Más", re: /galicia mas\b/ },
  { name: "Galicia", re: /\bgalicia\b/ },
  { name: "Santander", re: /\bsantander\b/ },
  { name: "BBVA", re: /\bbbva\b|\bfrances\b/ },
  { name: "Nación", re: /\bnacion\b|\bbna\b/ },
  { name: "Macro", re: /\bmacro\b/ },
  { name: "Provincia", re: /banco provincia\b(?! del)|\bbapro\b|provincia de buenos aires/ },
  { name: "Ciudad", re: /banco ciudad|ciudad de buenos aires/ },
  { name: "ICBC", re: /\bicbc\b/ },
  { name: "HSBC", re: /\bhsbc\b/ },
  { name: "Credicoop", re: /credicoop/ },
  { name: "Patagonia", re: /\bpatagonia\b/ },
  { name: "Supervielle", re: /supervielle/ },
  { name: "Comafi", re: /\bcomafi\b/ },
  { name: "Hipotecario", re: /hipotecario/ },
  { name: "Itaú", re: /\bitau\b/ },
  { name: "Brubank", re: /brubank/ },
  { name: "Naranja X", re: /naranja x\b|tarjeta naranja/ },
  { name: "Ualá", re: /\buala\b/ },
  { name: "Mercado Pago", re: /mercado ?pago/ },
  { name: "Bancor", re: /bancor|banco de (la provincia de )?cordoba/ },
  { name: "BIND", re: /\bbind\b|banco industrial/ },
  { name: "Santa Fe", re: /banco (de )?santa fe/ },
  { name: "Entre Ríos", re: /banco (de )?entre rios/ },
  { name: "San Juan", re: /banco (de )?san juan/ },
  { name: "Chubut", re: /banco (del )?chubut/ },
  { name: "BPN", re: /\bbpn\b|provincia del neuquen/ },
  { name: "Banco del Sol", re: /banco del sol/ },
  { name: "Columbia", re: /banco columbia/ },
  { name: "Openbank", re: /openbank/ },
  { name: "Reba", re: /\breba\b/ },
];

/** Lines before the movements: where the issuer, network and card number are printed. */
function headerOf(lines: string[]) {
  const i = lines.findIndex((l) =>
    /\b(fecha|detalle)\b.*\b(detalle|importe|pesos|comprobante)\b/i.test(l),
  );
  return lines.slice(0, i > 0 ? Math.min(i, 30) : 15);
}

function networkOf(header: string): CardNetwork | null {
  let best: { id: CardNetwork; at: number } | null = null;
  for (const n of NETWORKS) {
    const at = header.search(n.re);
    if (at >= 0 && (!best || at < best.at)) best = { id: n.id, at };
  }
  return best?.id ?? null;
}

function bankOf(header: string): string | null {
  for (const b of BANKS) if (b.re.test(header)) return b.name;
  const m = header.match(/\bbanco ([a-z]{3,}(?: [a-z]{3,})?)/);
  if (m && !/^(de|del|la)$/.test(m[1]!)) return m[1]!.replace(/\b\w/g, (c) => c.toUpperCase());
  return null;
}

/** "4509 XXXX XXXX 6789", "5412 **** **** 4321", "3777 XXXXXX X1005", "terminada en 1234" → last 4. */
export function last4Of(lines: string[]): string | null {
  for (const l of lines) {
    const end =
      l.match(/termina(?:da)? en\s*:?\s*(\d{4})\b/i) ?? l.match(/finalizada en\s*:?\s*(\d{4})\b/i);
    if (end) return end[1]!;
    for (const m of l.matchAll(
      /(?<![\d,.])(?:\d{4}|[Xx*•]{4})(?:[ -]?[\dXx*•]{2,6}){1,3}(?![\d,])/g,
    )) {
      const s = m[0].replace(/[ -]/g, "");
      if (/[Xx*•]/.test(s) && /\d{4}$/.test(s) && s.length >= 12) return s.slice(-4);
    }
  }
  return null;
}

// --------------------------------------------------------- labels and values

const MONTHS: Record<string, string> = {
  ene: "01",
  feb: "02",
  mar: "03",
  abr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  sep: "09",
  set: "09",
  oct: "10",
  nov: "11",
  dic: "12",
};

const DATE =
  /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b|(\d{1,2})[ -]?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?[ -]?(\d{2,4})\b/;

function validDay(y: number, m: number, d: number) {
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}

/** First date in a folded text: "24 sep 26", "24/09/26", "24-09-2026", "24 setiem 2026". */
export function firstDate(s: string): string | null {
  const m = s.match(DATE);
  if (!m) return null;
  const yy = Number(m[3] ?? m[6]);
  const y = yy < 100 ? 2000 + yy : yy;
  if (m[1]) return validDay(y, Number(m[2]), Number(m[1]));
  return validDay(y, Number(MONTHS[m[5]!]), Number(m[4]));
}

const AMOUNT = /-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}/;

function firstAmount(s: string): number | null {
  const m = s.match(AMOUNT);
  if (!m) return null;
  return round2(Math.abs(Number(m[0].replace(/\./g, "").replace(",", "."))));
}

type Field = keyof Omit<StatementCardInfo, "network" | "bank" | "last4" | "tna">;

const LABELS: { field: Field; re: RegExp; value: "date" | "amount" }[] = [
  { field: "nextClosingDate", re: /pr[o]?x(?:imo|\.)? cierre/g, value: "date" },
  { field: "nextDueDate", re: /pr[o]?x(?:imo|\.)? (?:vencimiento|vto)/g, value: "date" },
  {
    field: "closingDate",
    re: /(?<!prox(?:imo|\.)? )(?:fecha de )?cierre(?! anterior)(?: actual)?/g,
    value: "date",
  },
  {
    field: "dueDate",
    re: /(?<!prox(?:imo|\.)? )(?:fecha de )?(?:vencimiento|vto\.?)(?! anterior)(?: actual)?/g,
    value: "date",
  },
  {
    field: "totalUsd",
    re: /(?:saldo actual|total a pagar) (?:en )?(?:u\$s|usd|us\$|dolares)/g,
    value: "amount",
  },
  {
    field: "totalArs",
    re: /(?:saldo actual|total a pagar)(?: en pesos| \$)?(?! (?:en )?(?:u\$s|usd|us\$|dolares))/g,
    value: "amount",
  },
  { field: "minimumArs", re: /pago minimo(?: \$)?/g, value: "amount" },
  {
    field: "limitArs",
    re: /limite (?:de )?(?:compras?|credito|unico|unificado|de compra)(?: en pesos| \$)?/g,
    value: "amount",
  },
];

/**
 * Read the card and the statement's header from the PDF's own lines (as
 * itemsToLines builds them). Fields that are not printed come back null.
 */
export function extractCardInfo(lines: string[]): StatementCardInfo {
  const header = headerOf(lines);
  const headerText = foldText(header.join("\n"));
  const out: StatementCardInfo = {
    ...EMPTY_CARD_INFO,
    network: networkOf(headerText),
    bank: bankOf(headerText),
    last4: last4Of(header) ?? last4Of(lines.slice(0, 60)),
  };
  for (const raw of lines.slice(0, 80)) {
    const line = foldText(raw);
    const hits: { field: Field; value: "date" | "amount"; at: number; end: number }[] = [];
    for (const l of LABELS) {
      for (const m of line.matchAll(l.re)) {
        const at = m.index ?? 0;
        if (hits.some((h) => at < h.end && at + m[0].length > h.at)) continue;
        hits.push({ field: l.field, value: l.value, at, end: at + m[0].length });
      }
    }
    hits.sort((a, b) => a.at - b.at);
    hits.forEach((h, i) => {
      if (out[h.field] != null) return;
      const seg = line.slice(h.end, hits[i + 1]?.at ?? line.length);
      const v = h.value === "date" ? firstDate(seg) : firstAmount(seg);
      if (v != null) (out as Record<Field, string | number | null>)[h.field] = v;
    });
    if (out.tna == null) {
      const t = line.match(/\btna\b[^0-9%]{0,16}(\d{1,3}(?:,\d{1,2})?)\s*%/);
      if (t) out.tna = Number(t[1]!.replace(",", "."));
    }
  }
  return out;
}

/** The model's reading, with what it missed filled from the PDF's labels. */
export function withCardInfo(st: ParsedStatement, info: StatementCardInfo): ParsedStatement {
  return {
    ...st,
    closingDate: st.closingDate ?? info.closingDate,
    dueDate: st.dueDate ?? info.dueDate,
    nextClosingDate: st.nextClosingDate ?? info.nextClosingDate,
    nextDueDate: st.nextDueDate ?? info.nextDueDate,
    totalArs: st.totalArs ?? info.totalArs,
    totalUsd: st.totalUsd ?? info.totalUsd,
    minimumArs: st.minimumArs ?? info.minimumArs,
  };
}

// -------------------------------------------------------------- which card

function sameBank(bank: string, card: Card) {
  const entry = BANKS.find((b) => b.name === bank);
  const text = foldText(`${card.bank} ${card.name}`);
  if (entry) return entry.re.test(text) || text.includes(foldText(bank));
  return text.includes(foldText(bank));
}

export type CardMatch = { card: Card; how: "exacta" | "probable" };

/**
 * The loaded card this statement is from. Same last 4 (and network, if both
 * say) = that card. Without last 4 on one side: same network and issuer, and
 * only one such card. Different last 4 = never the same card.
 */
export function matchCard(info: StatementCardInfo, cards: Card[]): CardMatch | null {
  const live = cards.filter((c) => !c.archived);
  const netOk = (c: Card) => !info.network || c.network === info.network || c.network === "otra";
  if (info.last4) {
    const exact = live.filter((c) => c.last4 === info.last4 && netOk(c));
    if (exact.length === 1) return { card: exact[0]!, how: "exacta" };
    if (exact.length > 1) {
      const byBank = info.bank ? exact.filter((c) => sameBank(info.bank!, c)) : [];
      if (byBank.length === 1) return { card: byBank[0]!, how: "exacta" };
    }
  }
  if (!info.network) return null;
  const maybe = live.filter(
    (c) =>
      (!c.last4 || !info.last4) &&
      c.network === info.network &&
      (!info.bank || sameBank(info.bank, c) || (!c.bank && !foldText(c.name).includes(" "))),
  );
  return maybe.length === 1 ? { card: maybe[0]!, how: "probable" } : null;
}

// ---------------------------------------------------------- the new card

export type CardDraft = {
  name: string;
  bank: string;
  network: CardNetwork;
  last4: string;
  closingDay: number | null;
  dueDay: number | null;
  limitArs: number;
  tna: number;
  usdPerceptionPct: number;
};

export type DraftField =
  "network" | "bank" | "last4" | "closingDay" | "dueDay" | "limitArs" | "tna";

/** What the PDF did not say: the review marks these to complete. */
export function missingFields(info: StatementCardInfo, st: ParsedStatement): DraftField[] {
  const out: DraftField[] = [];
  if (!info.network) out.push("network");
  if (!info.bank) out.push("bank");
  if (!info.last4) out.push("last4");
  if (!(st.closingDate ?? info.closingDate)) out.push("closingDay");
  if (!(st.dueDate ?? info.dueDate)) out.push("dueDay");
  if (!info.limitArs) out.push("limitArs");
  if (!info.tna) out.push("tna");
  return out;
}

/** The card to create, prefilled from the statement ("Visa Galicia", cierre 24, vence 6…). */
export function cardDraftFrom(
  info: StatementCardInfo,
  st: ParsedStatement,
  cards: Card[] = [],
): CardDraft {
  const network = info.network ?? "otra";
  let name = [NETWORK_SHORT[network], info.bank ?? ""].filter(Boolean).join(" ").trim();
  if (cards.some((c) => !c.archived && foldText(c.name) === foldText(name)) && info.last4)
    name = `${name} ${info.last4}`;
  const closing = st.closingDate ?? info.closingDate;
  const due = st.dueDate ?? info.dueDate;
  return {
    name,
    bank: info.bank ?? "",
    network,
    last4: info.last4 ?? "",
    closingDay: closing ? Number(closing.slice(8, 10)) : null,
    dueDay: due ? Number(due.slice(8, 10)) : null,
    limitArs: info.limitArs ?? 0,
    tna: info.tna ?? 0,
    usdPerceptionPct: 30,
  };
}

export type CardChange = {
  field: "limitArs" | "closingDay" | "dueDay" | "last4" | "bank" | "tna";
  label: string;
};

/** What the statement says differently about a card already loaded (to offer updating it). */
export function cardChanges(card: Card, draft: CardDraft): CardChange[] {
  const out: CardChange[] = [];
  if (draft.limitArs > 0 && Math.abs(draft.limitArs - card.limitArs) >= 1)
    out.push({ field: "limitArs", label: "límite" });
  if (draft.closingDay && draft.closingDay !== card.closingDay)
    out.push({ field: "closingDay", label: "día de cierre" });
  if (draft.dueDay && draft.dueDay !== card.dueDay)
    out.push({ field: "dueDay", label: "día de vencimiento" });
  if (draft.last4 && !card.last4) out.push({ field: "last4", label: "últimos 4" });
  if (draft.bank && !card.bank) out.push({ field: "bank", label: "banco" });
  if (draft.tna > 0 && Math.abs(draft.tna - card.tna) >= 0.01)
    out.push({ field: "tna", label: "TNA" });
  return out;
}

/** Card with the statement's data applied (only the fields that changed). */
export function applyCardChanges(card: Card, draft: CardDraft, changes: CardChange[]): Card {
  const next = { ...card };
  for (const c of changes) {
    if (c.field === "closingDay" || c.field === "dueDay")
      next[c.field] = draft[c.field] ?? card[c.field];
    else if (c.field === "limitArs" || c.field === "tna") next[c.field] = draft[c.field];
    else next[c.field] = draft[c.field];
  }
  return next;
}

/**
 * What was owed before this statement and not paid ("saldo anterior" minus
 * "su pago"): a new card starts with that debt, not as a spending of this month.
 */
export function debtFromBefore(st: ParsedStatement) {
  return {
    ars: round2(Math.max(0, (st.previousArs ?? 0) - (st.paymentsArs ?? 0))),
    usd: round2(Math.max(0, (st.previousUsd ?? 0) - (st.paymentsUsd ?? 0))),
  };
}

/** This card's statement for that month, if it was already imported (same PDF twice). */
export function importedBefore(statements: BankStatement[], cardId: string, period: string) {
  return statements.find((s) => s.cardId === cardId && s.period === period) ?? null;
}
