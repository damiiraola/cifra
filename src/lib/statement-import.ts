/**
 * Card statement PDF importer, pure parts (no I/O, no IA): rebuild text lines
 * from the PDF, keep only movements and totals (no name, address, CUIT or card
 * number) before anything goes to the model, check the model's answer against
 * the bank's own totals and against the PDF text, match it with what is
 * already loaded, and turn the lines the user approves into movements.
 * See cifra-design/tarjetas-y-asesor.md §1.8.
 */
import { closingOf, dueOf, shiftPeriod } from "./card-math.ts";
import type { BankStatement, Card, Transaction } from "./types";

/** 6 assistant units per statement (chat = 1) and at most 3 statements per day. */
export const PDF_AI_UNITS = 6;
export const PDF_DAILY_LIMIT = 3;
/** Bytes. Vercel takes ~4.5 MB per request and base64 adds a third. */
export const PDF_MAX_BYTES = 3 * 1024 * 1024;
export const PDF_MAX_PAGES = 15;
/** What goes to the model at most (~8k tokens). */
export const MAX_MODEL_CHARS = 24_000;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// -------------------------------------------------------------- text lines

export type PdfTextItem = { str: string; x: number; y: number; w: number; page: number };

/** "1.234,56", "-2.000,00", "45300,50", "2.000,00-". */
const AMOUNT = /-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}-?/;
const AMOUNT_ALL = new RegExp(AMOUNT.source, "g");
const AMOUNT_ONLY = new RegExp(`^\\$?\\s?${AMOUNT.source}$`);
const ARS_HEAD = /^(pesos|\$|importe \$|en pesos)$/i;
const USD_HEAD = /^(d[oó]lares|u\$s|us\$|usd|en d[oó]lares|importe u\$s)$/i;

/**
 * Lines of text in reading order, page by page. Items on the same baseline
 * (±2.5 pt) form a line; wide gaps become two spaces. When a page has a
 * "PESOS … DÓLARES" header, amounts sitting under the dollars column get a
 * "U$S " prefix, so the model (and the checks) can tell the currencies apart.
 */
export function itemsToLines(items: PdfTextItem[]): string[] {
  const out: string[] = [];
  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  let cols: { ars: number; usd: number } | null = null;
  for (const page of pages) {
    const rows: { y: number; items: PdfTextItem[] }[] = [];
    for (const it of items.filter((i) => i.page === page && i.str.trim())) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= 2.5);
      if (row) row.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      const ars = row.items.find((i) => ARS_HEAD.test(i.str.trim()));
      const usd = row.items.find((i) => USD_HEAD.test(i.str.trim()));
      if (ars && usd) cols = { ars: ars.x + ars.w, usd: usd.x + usd.w };
      let line = "";
      let end = -Infinity;
      for (const it of row.items) {
        let str = it.str.trim();
        if (cols && !(ars && usd) && AMOUNT_ONLY.test(str)) {
          const right = it.x + it.w;
          if (Math.abs(right - cols.usd) < Math.abs(right - cols.ars)) str = `U$S ${str}`;
        }
        const gap = it.x - end;
        line += line ? (gap > 12 ? "  " : gap > 0.5 ? " " : "") : "";
        line += str;
        end = it.x + it.w;
      }
      out.push(line.replace(/\s{3,}/g, "  ").trim());
    }
  }
  return out.filter(Boolean);
}

// ------------------------------------------------- what goes to the model

const KEEP =
  /(cierre|venc|m[ií]nimo|saldo|total|pago|cuota|consumo|fecha|detalle|pesos|d[oó]lares|u\$s|usd|tna|tea|cft|inter[eé]s|impuesto|iva|sellos|percep|comisi|cargo|bonif|devoluc|cotiz)/i;
const DROP =
  /(domicilio|direcci[oó]n|titular\s*:|\bsr\.?\s|\bsra\.?\s|c[oó]digo postal|\bpiso\b|\bdto\b|e-?mail|mail\s*:|\bcbu\b|\balias\b)/i;
const ID_LINE = /\b(cuit|cuil|dni|cdi)\b/i;

/** Words of the holder's name, from the PDF itself (next to the CUIT, "Titular:") and the account name. */
export function holderNameTokens(lines: string[], accountName = ""): string[] {
  const words = new Set<string>();
  const add = (text: string) => {
    for (const w of text.split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/)) {
      if (w.length >= 3 && !/^(cuit|cuil|dni|cdi|titular|sr|sra|tarjeta|banco|visa|master|amex|total|consumos)$/i.test(w)) {
        words.add(w.toUpperCase());
      }
    }
  };
  for (const l of lines) {
    const id = l.search(ID_LINE);
    if (id > 0) {
      const before = l.slice(0, id).trim();
      if (/^[A-ZÁÉÍÓÚÜÑ ,.'-]{5,}$/.test(before)) add(before);
    }
    const tit = l.match(/titular\s*:?\s*([A-ZÁÉÍÓÚÜÑ ,.'-]{5,}?)(?:\s+-|\s{2}|$)/i);
    if (tit) add(tit[1]!);
  }
  if (accountName.trim()) add(accountName);
  return [...words];
}

/** Remove personal data from one kept line. */
export function redactLine(line: string, nameTokens: string[]): string {
  let s = line
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[mail]")
    .replace(/\b\d{2}-?\d{8}-?\d\b/g, "[cuit]")
    .replace(/\b\d{4}[ -]?(?:[\dXx*•]{2,6}[ -]?){1,3}[\dXx*•]{1,5}\b/g, (m) =>
      /[Xx*•]/.test(m) || m.replace(/\D/g, "").length >= 12 ? "[tarjeta]" : m,
    )
    .replace(/\b\d{1,2}\.\d{3}\.\d{3}\b(?!,\d)/g, "[nro]")
    .replace(/\b\d{7,}\b/g, "[nro]");
  for (const w of nameTokens) {
    s = s.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[titular]");
  }
  return s.replace(/(\[titular\]\s*)+/g, "[titular] ").replace(/\s+$/, "");
}

/**
 * Text sent to the model: only lines with an amount or a statement keyword,
 * never header lines with name/address/IDs, and personal data scrubbed from
 * the rest. Also says how many lines carry amounts (0–2 = scanned PDF).
 */
export function textForModel(lines: string[], accountName = "") {
  const names = holderNameTokens(lines, accountName);
  const kept: string[] = [];
  let amountLines = 0;
  for (const l of lines) {
    const hasAmount = AMOUNT.test(l);
    if (DROP.test(l)) continue;
    if (ID_LINE.test(l) && !hasAmount) continue;
    if (!hasAmount && !KEEP.test(l)) continue;
    if (hasAmount) amountLines += 1;
    kept.push(redactLine(l, names));
  }
  let text = kept.join("\n");
  if (text.length > MAX_MODEL_CHARS) text = text.slice(0, MAX_MODEL_CHARS);
  return { text, amountLines, keptLines: kept.length, droppedLines: lines.length - kept.length };
}

// ------------------------------------------------------- model contract

export type StatementLineKind = "purchase" | "refund" | "charge";

export type StatementLine = {
  date: string | null;
  description: string;
  installmentNo: number | null;
  installmentCount: number | null;
  currency: "ARS" | "USD";
  amount: number;
  kind: StatementLineKind;
  categoryId: string;
};

export type ParsedStatement = {
  closingDate: string | null;
  dueDate: string | null;
  nextClosingDate: string | null;
  nextDueDate: string | null;
  totalArs: number | null;
  totalUsd: number | null;
  minimumArs: number | null;
  previousArs: number | null;
  previousUsd: number | null;
  paymentsArs: number | null;
  paymentsUsd: number | null;
  lines: StatementLine[];
};

const nullable = (type: string) => ({ type: [type, "null"] });

/** JSON schema for the model (strict: every field required, nulls when the PDF does not say). */
export function statementSchema(categoryIds: string[]) {
  const ids = [...new Set(categoryIds.filter(Boolean))];
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "closingDate",
      "dueDate",
      "nextClosingDate",
      "nextDueDate",
      "totalArs",
      "totalUsd",
      "minimumArs",
      "previousArs",
      "previousUsd",
      "paymentsArs",
      "paymentsUsd",
      "lines",
    ],
    properties: {
      closingDate: nullable("string"),
      dueDate: nullable("string"),
      nextClosingDate: nullable("string"),
      nextDueDate: nullable("string"),
      totalArs: nullable("number"),
      totalUsd: nullable("number"),
      minimumArs: nullable("number"),
      previousArs: nullable("number"),
      previousUsd: nullable("number"),
      paymentsArs: nullable("number"),
      paymentsUsd: nullable("number"),
      lines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["date", "description", "installmentNo", "installmentCount", "currency", "amount", "kind", "categoryId"],
          properties: {
            date: nullable("string"),
            description: { type: "string" },
            installmentNo: nullable("integer"),
            installmentCount: nullable("integer"),
            currency: { type: "string", enum: ["ARS", "USD"] },
            amount: { type: "number" },
            kind: { type: "string", enum: ["purchase", "refund", "charge"] },
            categoryId: ids.length ? { type: "string", enum: ids } : { type: "string" },
          },
        },
      },
    },
  };
}

export type CatHint = { id: string; name: string; kind: string };

export function statementPrompt(cats: CatHint[]) {
  const expense = cats.filter((c) => c.kind !== "income");
  const list = expense.length
    ? expense.map((c) => `${c.id} (${c.name})`).join(", ")
    : "alimentos, transporte, vivienda, servicios, salud, educacion, ocio, compras, suscripciones, impuestos, otros";
  return `Leés el texto de un resumen de tarjeta de crédito argentino (Visa, Mastercard, American Express, Cabal, de cualquier banco) y devolvés SOLO el JSON pedido.
Reglas:
- Fechas en YYYY-MM-DD. El año sale del cierre. En resúmenes Visa/Prisma la fecha suele venir como "AA Mes DD" (26 Setiem 02 = 2026-09-02). "dd/mm/aa" y "dd MES" también existen.
- Montos en formato argentino (1.234,56 = 1234.56). En el JSON van siempre positivos.
- "U$S", "USD" o "DÓLARES" = currency USD. Si no, ARS.
- closingDate = cierre actual, dueDate = vencimiento actual, nextClosingDate / nextDueDate = próximo cierre / vencimiento.
- totalArs / totalUsd = SALDO ACTUAL (o total a pagar) en cada moneda. minimumArs = pago mínimo.
- previousArs / previousUsd = SALDO ANTERIOR. paymentsArs / paymentsUsd = suma de "SU PAGO" / pagos recibidos (positivo).
- lines = cada consumo, devolución o cargo del período. NO incluyas saldo anterior, pagos, subtotales ni totales.
- kind: "purchase" consumo; "refund" devolución, bonificación o crédito a favor; "charge" impuestos, sellos, IVA, percepciones, comisiones, intereses o cargos del banco.
- Cuotas: "C.03/12", "CUOTA 03 DE 12", "3/12" = installmentNo 3, installmentCount 12. Sin cuotas = null y null.
- description = el comercio, sin la cuota, sin el número de comprobante y sin el monto en dólares repetido.
- categoryId de los cargos: "intereses" para intereses (financiación, punitorios), IVA sobre intereses, comisiones y cargos por mantenimiento o renovación; "impuestos" para sellos, IVA de servicios digitales, percepciones e Ingresos Brutos. Para el resto elegí de: ${list}.
- Si algo no figura, null. No inventes líneas ni montos. Lo que diga [titular], [tarjeta], [cuit] o [nro] es dato tapado: ignoralo.`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const FEE_WORDS = /inter[eé]s|financ|punitor|comisi[oó]n|mantenim|renovaci[oó]n|cargo por|seguro de vida|administraci[oó]n/i;

/**
 * Category of a bank charge: interest and fees go to "Intereses y comisiones",
 * taxes (sellos, IVA de servicios digitales, percepciones) to "Impuestos".
 * The words in the line win over the model, so the split is stable.
 */
export function chargeCategory(description: string, modelCat: string, ids: Set<string>): string {
  const has = (id: string) => !ids.size || ids.has(id);
  if (FEE_WORDS.test(description) && has("intereses")) return "intereses";
  if (modelCat && has(modelCat) && modelCat !== "intereses") return modelCat;
  if (modelCat === "intereses" && has("intereses") && !/sellos|percep|iibb|ingresos brutos|servicios? digital|rg ?\d/i.test(description)) {
    return "intereses";
  }
  return has("impuestos") ? "impuestos" : "otros";
}

function day(v: unknown): string | null {
  if (typeof v !== "string" || !DAY.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

function amount(v: unknown): number | null {
  // null stays null ("not in the PDF"), not 0: the PDF's own labels may fill it.
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e11 ? round2(Math.abs(n)) : null;
}

function count(v: unknown): number | null {
  const n = Math.round(Number(v));
  return v != null && Number.isFinite(n) && n >= 1 && n <= 72 ? n : null;
}

/** Validate and normalize what the model answered. null = unusable. */
export function parseModelStatement(raw: unknown, categoryIds: string[] = []): ParsedStatement | null {
  let o = raw;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object" || !Array.isArray((o as { lines?: unknown }).lines)) return null;
  const r = o as Record<string, unknown> & { lines: unknown[] };
  const ids = new Set(categoryIds);
  const lines: StatementLine[] = [];
  for (const item of r.lines.slice(0, 400)) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    const a = amount(l.amount);
    if (!a) continue;
    const kind: StatementLineKind = l.kind === "refund" ? "refund" : l.kind === "charge" ? "charge" : "purchase";
    let no = count(l.installmentNo);
    let of = count(l.installmentCount);
    if (!no || !of || no > of || of < 2) {
      no = null;
      of = null;
    }
    const cat = typeof l.categoryId === "string" ? l.categoryId : "";
    const description = String(l.description ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Consumo";
    lines.push({
      date: day(l.date),
      description,
      installmentNo: no,
      installmentCount: of,
      currency: l.currency === "USD" ? "USD" : "ARS",
      amount: a,
      kind,
      categoryId: kind === "charge" ? chargeCategory(description, cat, ids) : ids.size && !ids.has(cat) ? "otros" : cat || "otros",
    });
  }
  return {
    closingDate: day(r.closingDate),
    dueDate: day(r.dueDate),
    nextClosingDate: day(r.nextClosingDate),
    nextDueDate: day(r.nextDueDate),
    totalArs: amount(r.totalArs),
    totalUsd: amount(r.totalUsd),
    minimumArs: amount(r.minimumArs),
    previousArs: amount(r.previousArs),
    previousUsd: amount(r.previousUsd),
    paymentsArs: amount(r.paymentsArs),
    paymentsUsd: amount(r.paymentsUsd),
    lines,
  };
}

// ---------------------------------------------------------------- checks

/** Argentine format: 1234.5 → "1.234,50". */
export function arAmount(n: number): string {
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

/** Is this amount printed in the PDF text? Catches amounts the model made up. */
export function amountInText(n: number, text: string): boolean {
  const a = arAmount(n);
  const plain = a.replace(/\./g, "");
  const found = text.match(AMOUNT_ALL) ?? [];
  return found.some((f) => {
    const v = f.replace(/^-|-$/g, "");
    return v === a || v === plain;
  });
}

export type TotalCheck = {
  status: "ok" | "mismatch" | "unknown";
  /** previous − payments + purchases + charges − refunds */
  expected: number;
  bank: number | null;
  diff: number;
};

function checkOne(st: ParsedStatement, cur: "ARS" | "USD"): TotalCheck {
  const usd = cur === "USD";
  let sum = 0;
  for (const l of st.lines) if (l.currency === cur) sum += l.kind === "refund" ? -l.amount : l.amount;
  const prev = (usd ? st.previousUsd : st.previousArs) ?? 0;
  const paid = (usd ? st.paymentsUsd : st.paymentsArs) ?? 0;
  const expected = round2(prev - paid + sum);
  const bank = usd ? st.totalUsd : st.totalArs;
  if (bank == null) return { status: expected === 0 ? "ok" : "unknown", expected, bank, diff: 0 };
  const diff = round2(expected - bank);
  // ±1 % of the total (the design's rule), never stricter than $1 / US$0,05.
  const tol = Math.max(usd ? 0.05 : 1, Math.abs(bank) * 0.01);
  return { status: Math.abs(diff) <= tol ? "ok" : "mismatch", expected, bank, diff };
}

/** Do the lines add up to the bank's own totals, per currency? (no IA) */
export function checkTotals(st: ParsedStatement) {
  const ars = checkOne(st, "ARS");
  const usd = checkOne(st, "USD");
  return { ars, usd, ok: ars.status !== "mismatch" && usd.status !== "mismatch" };
}

// -------------------------------------------------------------- matching

export type ReviewStatus = "new" | "same" | "diff";

export type ReviewLine = {
  key: string;
  line: StatementLine;
  status: ReviewStatus;
  /** Existing movement it matches ("same" / "diff"). */
  matchId: string;
  matchAmount: number;
  /** The match is a cuota of a purchase (fix it from the purchase). */
  matchIsCuota: boolean;
  /** The amount appears in the PDF text. */
  inText: boolean;
};

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
}

function words(s: string) {
  return new Set(
    s
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^A-Z0-9]+/)
      .filter((w) => w.length >= 4),
  );
}

function similar(a: string, b: string) {
  const wa = words(a);
  for (const w of words(b)) if (wa.has(w)) return true;
  return false;
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.01);
const exactly = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Compare each statement line with the movements already on the card. A
 * match is the same cuota k/N, or date ±3 days with amount ±1 % (or a similar
 * merchant on those dates). "same" if the amount is identical to the cent,
 * "diff" if it is a match with another amount, "new" if nothing matches.
 */
export function reviewLines(st: ParsedStatement, card: Card, txs: Transaction[], pdfText = ""): ReviewLine[] {
  const used = new Set<string>();
  const out: ReviewLine[] = [];
  st.lines.forEach((line, i) => {
    const accountId = line.currency === "USD" ? card.accountUsdId : card.accountArsId;
    const type = line.kind === "refund" ? "income" : "expense";
    const pool = txs.filter((t) => t.accountId === accountId && t.type === type && !used.has(t.id));
    let match: Transaction | undefined;
    let status: ReviewStatus = "new";
    if (line.installmentNo && line.installmentCount) {
      const cuotas = pool.filter(
        (t) => t.purchaseId && t.installmentNo === line.installmentNo && t.installmentCount === line.installmentCount,
      );
      const close = cuotas
        .filter((t) => near(t.amount, line.amount))
        .sort((a, b) => Math.abs(a.amount - line.amount) - Math.abs(b.amount - line.amount))[0];
      match = close ?? cuotas.find((t) => similar(t.merchant, line.description));
      if (match) status = exactly(match.amount, line.amount) ? "same" : "diff";
    }
    if (!match) {
      const dated = line.date ? pool.filter((t) => daysBetween(t.date, line.date!) <= 3) : [];
      const close = dated
        .filter((t) => near(t.amount, line.amount))
        .sort(
          (a, b) =>
            Math.abs(a.amount - line.amount) - Math.abs(b.amount - line.amount) ||
            daysBetween(a.date, line.date!) - daysBetween(b.date, line.date!),
        )[0];
      match = close ?? dated.find((t) => !t.purchaseId && t.merchant && similar(t.merchant, line.description));
      if (match) status = exactly(match.amount, line.amount) ? "same" : "diff";
    }
    if (match) used.add(match.id);
    out.push({
      key: `l${i}`,
      line,
      status,
      matchId: match?.id ?? "",
      matchAmount: match?.amount ?? 0,
      matchIsCuota: Boolean(match?.purchaseId),
      inText: pdfText ? amountInText(line.amount, pdfText) : true,
    });
  });
  return out;
}

// ----------------------------------------------------------- the import

export type ImportPurchase = {
  cardId: string;
  date: string;
  merchant: string;
  categoryId: string;
  currency: "ARS" | "USD";
  installments: number;
  installmentAmount: number;
  total: number;
  interestFree: boolean;
  cashPrice: number;
  paidBefore: number;
  note: string;
};

export type ImportTx = {
  type: "expense" | "income";
  amount: number;
  currency: "ARS" | "USD";
  categoryId: string;
  note: string;
  merchant: string;
  date: string;
  method: "credito";
  bookId: string;
  accountId: string;
  counterpartyId: string;
  amountTo: number;
  rateArs: number;
  rateLocked: boolean;
  recurringId: string;
  cardPeriod: string;
};

export type ImportChoice = { include: boolean; categoryId?: string };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function dmy(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

/**
 * Dates of the statement: the PDF's, or (if the model did not find them)
 * the card's usual ones for the period that closed last.
 */
export function statementDates(st: ParsedStatement, card: Card, statements: BankStatement[], today: string) {
  const fallbackPeriod = shiftPeriod(today.slice(0, 7), Number(today.slice(8, 10)) > card.closingDay ? 0 : -1);
  const closing = st.closingDate ?? closingOf(card, fallbackPeriod, statements);
  const period = closing.slice(0, 7);
  return {
    period,
    closing,
    due: st.dueDate ?? dueOf(card, period, statements),
    nextClosing: st.nextClosingDate ?? "",
    nextDue: st.nextDueDate ?? "",
    guessed: !st.closingDate,
  };
}

/**
 * What approving the review does: the statement record, purchases in cuotas
 * for new cuotas ("ya venía": loads from cuota k), plain movements for the
 * rest, amount fixes for "diff" lines the user accepts, and moving matched
 * movements to this statement when Cifra had them in another one.
 */
export function buildImport(opts: {
  st: ParsedStatement;
  review: ReviewLine[];
  choices: Record<string, ImportChoice>;
  card: Card;
  txs: Transaction[];
  dates: { period: string; closing: string; due: string; nextClosing: string; nextDue: string };
  statementId: string;
}) {
  const { st, review, choices, card, txs, dates } = opts;
  const statement: BankStatement = {
    id: opts.statementId,
    bookId: card.bookId,
    cardId: card.id,
    period: dates.period,
    closingDate: dates.closing,
    dueDate: dates.due,
    nextClosingDate: dates.nextClosing,
    nextDueDate: dates.nextDue,
    totalArs: st.totalArs ?? 0,
    totalUsd: st.totalUsd ?? 0,
    minimumArs: st.minimumArs ?? 0,
    chargesArs: round2(st.lines.filter((l) => l.kind === "charge" && l.currency === "ARS").reduce((s, l) => s + l.amount, 0)),
    importedAt: "",
  };
  const monthName = MONTHS[Number(dates.period.slice(5, 7)) - 1] ?? "";
  const purchases: ImportPurchase[] = [];
  const adds: ImportTx[] = [];
  const fixes: { id: string; amount: number }[] = [];
  const moves: { id: string; cardPeriod: string }[] = [];
  for (const r of review) {
    const c = choices[r.key];
    const l = r.line;
    const categoryId = c?.categoryId || l.categoryId;
    if (r.status === "new") {
      if (!c?.include) continue;
      if (l.installmentNo && l.installmentCount) {
        purchases.push({
          cardId: card.id,
          date: dates.closing,
          merchant: l.description,
          categoryId,
          currency: l.currency,
          installments: l.installmentCount,
          installmentAmount: l.amount,
          total: round2(l.amount * l.installmentCount),
          interestFree: true,
          cashPrice: 0,
          paidBefore: l.installmentNo - 1,
          note: ["Del resumen", l.date ? `compra del ${dmy(l.date)}` : ""].filter(Boolean).join(" · "),
        });
        continue;
      }
      const date = l.date && l.date <= dates.closing ? l.date : dates.closing;
      adds.push({
        type: l.kind === "refund" ? "income" : "expense",
        amount: l.amount,
        currency: l.currency,
        categoryId: l.kind === "refund" ? c?.categoryId || "otros-ing" : categoryId,
        note: `Del resumen de ${monthName}${l.kind === "refund" ? " · devolución" : ""}`,
        merchant: l.description,
        date,
        method: "credito",
        bookId: card.bookId,
        accountId: l.currency === "USD" ? card.accountUsdId : card.accountArsId,
        counterpartyId: "",
        amountTo: 0,
        rateArs: 0,
        rateLocked: false,
        recurringId: "",
        cardPeriod: dates.period,
      });
      continue;
    }
    const tx = txs.find((t) => t.id === r.matchId);
    if (!tx) continue;
    if (r.status === "diff" && c?.include && !r.matchIsCuota) fixes.push({ id: tx.id, amount: l.amount });
    if (!tx.purchaseId && tx.cardPeriod !== dates.period) moves.push({ id: tx.id, cardPeriod: dates.period });
  }
  return { statement, purchases, adds, fixes, moves };
}

// --------------------------------------------------------- server input

/** cardId "" = no card yet: Cifra reads which card it is from the PDF. */
export type ReadPdfInput = { cardId: string; pdf: string; password: string; categories: CatHint[] };

/** Validate what the browser sends to the PDF reader. */
export function cleanPdfInput(input: unknown): ReadPdfInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const cardId = typeof i.cardId === "string" ? i.cardId.slice(0, 80) : "";
  const pdf = typeof i.pdf === "string" ? i.pdf : "";
  if (!pdf) throw new Error("Subí el PDF del resumen");
  if (pdf.length > Math.ceil((PDF_MAX_BYTES * 4) / 3) + 8) throw new Error("El PDF es muy grande (máximo 3 MB)");
  if (!/^[A-Za-z0-9+/]+=*$/.test(pdf)) throw new Error("El archivo llegó dañado. Probá de nuevo.");
  const password = typeof i.password === "string" ? i.password.slice(0, 64) : "";
  const categories = Array.isArray(i.categories)
    ? i.categories
        .filter((c): c is CatHint => !!c && typeof c === "object" && typeof (c as CatHint).id === "string")
        .slice(0, 80)
        .map((c) => ({ id: String(c.id).slice(0, 60), name: String(c.name ?? "").slice(0, 60), kind: String(c.kind ?? "").slice(0, 20) }))
    : [];
  return { cardId, pdf, password, categories };
}

export function isPdf(bytes: Uint8Array) {
  return bytes.length > 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}
