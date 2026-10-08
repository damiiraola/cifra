/**
 * What the assistant reads (§2.7): the user's ledger from the server (never a
 * snapshot built in the browser), plus up to 20 movements still waiting in the
 * phone's outbox, merged in memory only for this answer. Pure.
 */
import type { Goal } from "../goals.ts";
import type { Category, Currency, PayMethod, Transaction, TxType } from "../types.ts";
import { applyOutbox, parseOutbox, type OutboxOp } from "../outbox.ts";
import { mergedCategories } from "../categories.ts";
import type { AssistantData } from "./tools.ts";

export const MAX_PENDING = 20;

export type LedgerForAssistant = {
  books: { id: string }[];
  activeBookId: string;
  transactions: Transaction[];
  accounts: AssistantData["plan"]["accounts"];
  cards: AssistantData["plan"]["cards"];
  statements: AssistantData["plan"]["statements"];
  recurrings: AssistantData["plan"]["recurrings"];
  goals: Goal[];
  usdRate: number;
  usdtRate: number;
  customCategories: Category[];
  categoryNames: Record<string, string>;
  bookBudgets: Record<string, Record<string, number>>;
  bookBudgetLocks: Record<string, Record<string, boolean>>;
};

const TYPES = new Set(["expense", "income", "transfer"]);
const CURRENCIES = new Set(["ARS", "USD", "USDT"]);

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** A movement from the browser, every field typed (it only lives in this answer). */
export function cleanTx(raw: unknown): Transaction | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const id = str(t.id, 80);
  const amount = num(t.amount);
  const date = str(t.date, 10);
  if (!id || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !TYPES.has(String(t.type)))
    return null;
  return {
    id,
    type: t.type as TxType,
    amount,
    currency: (CURRENCIES.has(String(t.currency)) ? t.currency : "ARS") as Currency,
    categoryId: str(t.categoryId, 60) || "otros",
    note: "",
    merchant: "",
    date,
    method: (str(t.method, 20) || "otro") as PayMethod,
    createdAt: str(t.createdAt, 40),
    bookId: str(t.bookId, 60),
    accountId: str(t.accountId, 60),
    counterpartyId: str(t.counterpartyId, 60),
    amountTo: num(t.amountTo),
    rateArs: num(t.rateArs),
    rateLocked: Boolean(t.rateLocked),
    recurringId: str(t.recurringId, 80),
    cardPeriod: str(t.cardPeriod, 7),
    purchaseId: str(t.purchaseId, 80),
    installmentNo: Math.round(num(t.installmentNo)),
    installmentCount: Math.round(num(t.installmentCount)),
  };
}

/** Outbox ops from the browser: at most MAX_PENDING, rows cleaned. */
export function cleanPending(raw: unknown): OutboxOp[] {
  const ops = parseOutbox(Array.isArray(raw) ? raw.slice(-MAX_PENDING) : []);
  const out: OutboxOp[] = [];
  for (const op of ops) {
    if (op.action === "delete") {
      out.push({ ...op, row: undefined });
      continue;
    }
    const row = cleanTx(op.row);
    if (row && row.id === op.id) out.push({ ...op, row });
  }
  return out;
}

export function assistantData(
  ledger: LedgerForAssistant,
  wantedBookId: string,
  today: string,
  pending: OutboxOp[] = [],
): AssistantData {
  const bookId = ledger.books.some((b) => b.id === wantedBookId)
    ? wantedBookId
    : ledger.activeBookId;
  const txs = applyOutbox(ledger.transactions, pending).filter((t) => t.bookId === bookId);
  const locks = ledger.bookBudgetLocks[bookId] ?? {};
  const budgets = ledger.bookBudgets[bookId] ?? {};
  const topes: Record<string, number> = {};
  for (const [id, v] of Object.entries(budgets))
    if (locks[id] && Number(v) > 0) topes[id] = Number(v);
  return {
    plan: {
      today,
      bookId,
      txs,
      accounts: ledger.accounts.filter((a) => a.bookId === bookId),
      cards: ledger.cards.filter((c) => c.bookId === bookId && !c.archived),
      statements: ledger.statements.filter((s) => s.bookId === bookId),
      recurrings: ledger.recurrings,
      rates: { usd: ledger.usdRate, usdt: ledger.usdtRate },
    },
    goals: ledger.goals.filter((g) => g.bookId === bookId && g.active),
    categories: mergedCategories(ledger.customCategories, ledger.categoryNames).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
    })),
    topes,
  };
}
