import { useMemo } from "react";
import { userMessage } from "@/lib/user-error";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import {
  applyOpenings,
  asVault,
  clearLocalVault,
  buildLocalVault,
  markAutoBackup,
  readLocalVault,
  remapVaultRecurrings,
  remapVaultTxs,
  writeLocalVault,
} from "./local-vault";
import { argentinaDay } from "./market-hours";
import { DEFAULT_BUDGETS, DEFAULT_GLOBAL_BUDGET, BUILTIN_IDS, mergedCategories, nextCustomStyle } from "./categories";
import {
  loadLedger,
  patchTransaction,
  removeRecurring,
  removeTransaction,
  replaceTransactions,
  saveAccounts,
  replaceRecurrings,
  saveCards,
  loadLatestBackup,
  saveDailyBackup,
  saveSettings,
  saveTransaction,
} from "./ledger-api";
import { fetchQuotes } from "./fx-api";
import {
  DEFAULT_USD_RATE,
  DEFAULT_USDT_RATE,
  DEFAULT_USD_SOURCE,
  applyQuotes,
  isUsdSource,
  type Quote,
  type UsdSource,
} from "./fx";
import { inferAccount, stampRate } from "./books";
import { cardAccountNames, cardPeriodFor, clampDay, missingVaultCards } from "./card-math";
import { dueDate, dueUnposted, isPosted, likelyDuplicate, postedTxId } from "./recurring";
import { buildSeed } from "./seed";
import { monthISO, uid } from "./utils";
import { applyOutbox, enqueue, OUTBOX_MAX_TRIES, pruneOutbox, resetTries, type OutboxOp } from "./outbox";
import { mergeRecurrings } from "./recurring-sync";
import { hydrateBookMoney, moneyForBook } from "./budget-math";
import type { Account, Book, Card, Category, CategoryKind, ChatMessage, Recurring, Transaction } from "./types";

const LOCAL_KEY = "cifra-ledger-v1";

type Draft = Partial<Transaction> & { id?: string };
export type CardInput = Omit<Card, "id" | "accountArsId" | "accountUsdId" | "archived" | "bookId"> & {
  id?: string;
  bookId?: string;
};
type Status = "idle" | "loading" | "ready" | "error";

type LedgerState = {
  status: Status;
  ownerId: string;
  ownerEmail: string;
  confirmed: Transaction[];
  outbox: OutboxOp[];
  transactions: Transaction[];
  books: Book[];
  accounts: Account[];
  activeBookId: string;
  onboarded: boolean;
  categoryNames: Record<string, string>;
  hiddenCategoryIds: string[];
  customCategories: Category[];
  recurrings: Recurring[];
  pendingRecurringIds: string[];
  cards: Card[];
  pendingCardIds: string[];
  budgets: Record<string, number>;
  globalBudget: number;
  bookBudgets: Record<string, Record<string, number>>;
  bookGlobals: Record<string, number>;
  usdRate: number;
  usdtRate: number;
  usdSource: UsdSource;
  quotes: Quote[];
  quotesAt: string | null;
  quotesBusy: boolean;
  viewMonth: string;
  selectedDay: string | null;
  quickOpen: boolean;
  editingId: string | null;
  draft: Draft;
  chat: ChatMessage[];
  hydrate: (identity?: { id: string; email?: string | null }) => Promise<void>;
  resetClient: () => void;
  refreshQuotes: (quiet?: boolean) => Promise<void>;
  setUsdSource: (source: UsdSource) => void;
  setActiveBook: (id: string) => void;
  setViewMonth: (ym: string) => void;
  setSelectedDay: (day: string | null) => void;
  openQuick: (draft?: Draft) => void;
  closeQuick: () => void;
  addTx: (tx: Omit<Transaction, "id" | "createdAt" | "cardPeriod"> & { id?: string; createdAt?: string; cardPeriod?: string }) => void;
  updateTx: (id: string, patch: Partial<Transaction>) => void;
  deleteTx: (id: string) => void;
  flushOutbox: (opts?: { force?: boolean }) => Promise<void>;
  setBudget: (categoryId: string, amount: number) => void;
  replaceBudgets: (patch: Record<string, number>) => void;
  setGlobalBudget: (amount: number) => void;
  setCategoryName: (id: string, name: string) => void;
  setCategoryHidden: (id: string, hidden: boolean) => void;
  addCustomCategory: (input: { name: string; kind: CategoryKind }) => boolean;
  removeCustomCategory: (id: string) => void;
  setAccountOpening: (id: string, opening: number) => void;
  completeOnboarding: (input: { globalBudget: number; openings: { id: string; opening: number }[] }) => void;
  upsertRecurring: (row: Recurring) => void;
  deleteRecurring: (id: string) => void;
  postRecurring: (id: string, ym?: string) => boolean;
  flushRecurrings: (opts?: { force?: boolean }) => Promise<void>;
  /** Create (no id) or edit a card; creates/renames its two cajas. Returns the card. */
  upsertCard: (input: CardInput) => Card | null;
  archiveCard: (id: string) => void;
  flushCards: () => Promise<void>;
  pushChat: (msg: ChatMessage) => void;
  clearChat: () => void;
  loadDemo: () => void;
  wipe: () => void;
};

function persistFail(err: unknown, retry?: () => void) {
  const msg = err instanceof Error ? err.message : "";
  const session = msg === "Unauthorized";
  const desc = session
    ? "Entrá de nuevo. El movimiento sigue acá."
    : retry
      ? "El movimiento sigue acá."
      : userMessage(err, "Probá de nuevo en un rato.");
  toast.error("No pude guardar en tu libro", {
    description: desc,
    action: retry
      ? {
          label: "Reintentar",
          onClick: retry,
        }
      : undefined,
  });
}

function vaultInput(get: () => LedgerState) {
  const s = get();
  return {
    email: s.ownerEmail,
    books: s.books,
    accounts: s.accounts,
    activeBookId: s.activeBookId,
    onboarded: s.onboarded,
    transactions: s.confirmed,
    outbox: s.outbox,
    recurrings: s.recurrings,
    pendingRecurringIds: s.pendingRecurringIds,
    cards: s.cards,
    pendingCardIds: s.pendingCardIds,
    budgets: s.budgets,
    globalBudget: s.globalBudget,
    bookBudgets: s.bookBudgets,
    bookGlobals: s.bookGlobals,
    categoryNames: s.categoryNames,
    hiddenCategoryIds: s.hiddenCategoryIds,
    customCategories: s.customCategories,
    usdRate: s.usdRate,
    usdtRate: s.usdtRate,
    usdSource: s.usdSource,
    chat: s.chat,
  };
}

function persistLocal(get: () => LedgerState) {
  writeLocalVault(vaultInput(get));
  queueDailyBackup(get);
}

function paint(
  set: (p: Partial<LedgerState>) => void,
  get: () => LedgerState,
  next: { confirmed?: Transaction[]; outbox?: OutboxOp[] },
) {
  const confirmed = next.confirmed ?? get().confirmed;
  const outbox = next.outbox ?? get().outbox;
  set({ confirmed, outbox, transactions: applyOutbox(confirmed, outbox) });
}

let backupTimer: number | null = null;
let backupBusy = false;

function queueDailyBackup(get: () => LedgerState) {
  if (typeof window === "undefined") return;
  if (backupTimer) window.clearTimeout(backupTimer);
  backupTimer = window.setTimeout(() => {
    backupTimer = null;
    void pushDailyBackup(get);
  }, 1200);
}

async function pushDailyBackup(get: () => LedgerState) {
  if (backupBusy) return;
  const payload = buildLocalVault(vaultInput(get));
  if (!payload) return;
  backupBusy = true;
  try {
    const day = argentinaDay();
    await saveDailyBackup({ data: { day, payloadJson: JSON.stringify(payload) } });
    markAutoBackup(payload.email, day);
  } catch {
    /* local vault already holds it */
  } finally {
    backupBusy = false;
  }
}

function readLocalSnapshot(): {
  transactions: Transaction[];
  budgets: Record<string, number>;
  globalBudget: number;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: Partial<LedgerState> };
    const state = parsed.state ?? (parsed as Partial<LedgerState>);
    const transactions = Array.isArray(state.transactions) ? state.transactions : [];
    if (transactions.length === 0) return null;
    return {
      transactions,
      budgets: { ...DEFAULT_BUDGETS, ...(state.budgets ?? {}) },
      globalBudget: Number(state.globalBudget) || DEFAULT_GLOBAL_BUDGET,
    };
  } catch {
    return null;
  }
}

function clearLocalSnapshot() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Forget every copy of the ledger kept in this browser (local vault, old
 * snapshot, auto-backup marker). Called after a confirmed sign-out so the next
 * person on a shared phone does not inherit the previous user's numbers.
 */
export function forgetLocalLedger() {
  clearLocalVault();
  clearLocalSnapshot();
}

function fijoNames(rs: Recurring[]) {
  const names = rs.slice(0, 3).map((r) => r.name);
  return rs.length > 3 ? `${names.join(", ")} y ${rs.length - 3} más` : names.join(", ");
}

/**
 * Fijos used to be posted on their own every time the app opened ("Anoté 1
 * fijo"), which surprised people and duplicated expenses they had already
 * loaded by hand. Now we only ASK: a toast lists what is due this month with
 * an "Anotar" button, and leaves out the ones that look already loaded.
 */
function offerDueRecurrings(get: () => LedgerState) {
  const ym = monthISO();
  const txs = get().transactions;
  const due = dueUnposted(get().recurrings, txs, ym);
  if (!due.length) return;
  const twins = due.filter((r) => likelyDuplicate(r, txs, ym));
  const clean = due.filter((r) => !twins.includes(r));
  const parts: string[] = [];
  if (clean.length) parts.push(fijoNames(clean));
  if (twins.length) parts.push(`Parece que ya cargaste a mano: ${fijoNames(twins)}. Esos no los anoto; revisalos en Fijos.`);
  toast(clean.length === 1 ? "Tenés 1 fijo para anotar este mes" : clean.length > 1 ? `Tenés ${clean.length} fijos para anotar este mes` : "Revisá tus fijos de este mes", {
    id: "fijos-due",
    duration: 20000,
    description: parts.join(" · "),
    action: clean.length
      ? {
          label: "Anotar",
          onClick: () => {
            let n = 0;
            for (const r of clean) if (get().postRecurring(r.id, ym)) n += 1;
            if (n) toast.success(n === 1 ? "Anoté 1 fijo" : `Anoté ${n} fijos`);
          },
        }
      : undefined,
  });
}

let hydrateLock: Promise<void> | null = null;
let flushBusy = false;
let flushAgain = false;
let recFlushBusy = false;
let recFlushAgain = false;
let cardFlushBusy = false;
let cardFlushAgain = false;

function pushSettings(get: () => LedgerState, revert?: Partial<LedgerState>, set?: (p: Partial<LedgerState>) => void) {
  persistLocal(get);
  const s = get();
  const bookBudgets = { ...s.bookBudgets, [s.activeBookId]: s.budgets };
  const bookGlobals = { ...s.bookGlobals, [s.activeBookId]: s.globalBudget };
  const personal = s.books.find((b) => b.kind === "personal")?.id;
  void saveSettings({
    data: {
      budgets: personal ? (bookBudgets[personal] ?? {}) : s.budgets,
      globalBudget: personal ? (bookGlobals[personal] ?? 0) : s.globalBudget,
      bookBudgets,
      bookGlobals,
      usdRate: s.usdRate,
      usdtRate: s.usdtRate,
      usdSource: s.usdSource,
      activeBookId: s.activeBookId,
      onboarded: s.onboarded,
      categoryNames: s.categoryNames,
      hiddenCategoryIds: s.hiddenCategoryIds,
      customCategories: s.customCategories,
    },
  }).catch((err) => {
    persistFail(err);
    if (revert && set) {
      set(revert);
      persistLocal(get);
    }
  });
}

type TxInput = Omit<Transaction, "id" | "createdAt" | "cardPeriod"> & { id?: string; createdAt?: string; cardPeriod?: string };

function fillTx(get: () => LedgerState, tx: TxInput, previous?: Transaction): Transaction {
  const { activeBookId, accounts, usdRate, usdtRate } = get();
  const cards = get().cards ?? [];
  const bookId = tx.bookId || activeBookId;
  const accountId = tx.accountId || inferAccount(accounts, bookId, tx.method, tx.currency);
  const rateArs = tx.rateLocked && tx.rateArs > 0 ? tx.rateArs : stampRate(tx.currency, usdRate, usdtRate, tx.rateArs > 0 ? tx.rateArs : undefined);
  return {
    id: tx.id ?? uid(),
    createdAt: tx.createdAt ?? new Date().toISOString(),
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    categoryId: tx.categoryId,
    note: tx.note,
    merchant: tx.merchant,
    date: tx.date,
    method: tx.method,
    bookId,
    accountId,
    counterpartyId: tx.counterpartyId ?? "",
    amountTo: tx.amountTo ?? 0,
    rateArs,
    rateLocked: Boolean(tx.rateLocked),
    recurringId: tx.recurringId ?? "",
    cardPeriod: cardPeriodFor(cards, { type: tx.type, accountId, date: tx.date, cardPeriod: tx.cardPeriod }, previous),
  };
}

/**
 * Cards from the server, plus local cards (and their cajas) that were created
 * or edited on this phone and did not reach the server yet.
 */
function withPendingCards(
  remoteCards: Card[],
  remoteAccounts: Account[],
  local: { cards: Card[]; accounts: Account[]; pendingCardIds: string[] },
) {
  const pending = new Set(local.pendingCardIds);
  if (!pending.size) return { cards: remoteCards, accounts: remoteAccounts };
  const mine = local.cards.filter((c) => pending.has(c.id));
  const cards = [...remoteCards.filter((c) => !pending.has(c.id)), ...mine];
  const cardAccIds = new Set(mine.flatMap((c) => [c.accountArsId, c.accountUsdId]));
  const accounts = [
    ...remoteAccounts.filter((a) => !cardAccIds.has(a.id)),
    ...local.accounts.filter((a) => cardAccIds.has(a.id)),
  ];
  return { cards, accounts };
}

function ackOp(set: (p: Partial<LedgerState>) => void, get: () => LedgerState, op: OutboxOp) {
  let confirmed = get().confirmed;
  if (op.action === "delete") {
    confirmed = confirmed.filter((t) => t.id !== op.id);
  } else if (op.row) {
    if (confirmed.some((t) => t.id === op.id)) confirmed = confirmed.map((t) => (t.id === op.id ? op.row! : t));
    else confirmed = [op.row, ...confirmed];
  }
  paint(set, get, { confirmed, outbox: get().outbox.filter((o) => o.id !== op.id) });
  persistLocal(get);
}

async function restoreVault(get: () => LedgerState, set: (p: Partial<LedgerState>) => void) {
  const state = get();
  let vault = readLocalVault(state.ownerEmail);
  let backup: ReturnType<typeof asVault> = null;
  try {
    const remote = await loadLatestBackup();
    backup = asVault(remote?.payloadJson ? JSON.parse(remote.payloadJson) : null);
  } catch {
    /* ignore */
  }
  const localEmpty =
    !vault || (!vault.openings.length && !vault.transactions.length && !vault.recurrings.length && !vault.outbox.length);
  if (localEmpty && backup) vault = backup;
  if (!vault && !backup) {
    persistLocal(get);
    return;
  }
  const notes: string[] = [];
  const lost = missingVaultCards(vault ?? backup!, state.books, state.cards, state.accounts);
  if (lost.cards.length) {
    set({
      cards: [...get().cards, ...lost.cards],
      accounts: [...get().accounts, ...lost.accounts],
      pendingCardIds: [...new Set([...get().pendingCardIds, ...lost.cards.map((c) => c.id)])],
    });
    notes.push("tarjetas");
    void get().flushCards();
  }
  const accounts = vault ? applyOpenings(state.books, get().accounts, vault.openings) : null;
  if (accounts) {
    set({ accounts });
    void saveAccounts({ data: { accounts: accounts.map((a) => ({ id: a.id, opening: a.opening })) } }).catch((err) =>
      persistFail(err),
    );
    notes.push("saldos");
  }
  if (vault && state.confirmed.length === 0 && vault.transactions.length) {
    const txs = remapVaultTxs(vault, state.books, accounts ?? state.accounts);
    const outbox = pruneOutbox(vault.outbox, txs);
    paint(set, get, { confirmed: txs, outbox });
    set({ onboarded: true });
    void replaceTransactions({ data: txs }).catch((err) => persistFail(err));
    notes.push("movimientos");
  } else if (vault?.outbox.length) {
    const outbox = pruneOutbox(
      vault.outbox.reduce((acc, op) => enqueue(acc, op), get().outbox),
      get().confirmed,
    );
    paint(set, get, { outbox });
  }
  const booksNow = get().books;
  const accsNow = accounts ?? get().accounts;
  const incoming = [
    ...(vault ? remapVaultRecurrings(vault, booksNow, accsNow) : []),
    ...(backup && backup !== vault ? remapVaultRecurrings(backup, booksNow, accsNow) : []),
  ];
  if (incoming.length) {
    const nameOf = (id: string) => booksNow.find((b) => b.id === id)?.name ?? id;
    const { merged, added } = mergeRecurrings(get().recurrings, incoming, nameOf);
    if (added.length) {
      const pending = [...new Set([...get().pendingRecurringIds, ...added.map((r) => r.id)])];
      set({ recurrings: merged, pendingRecurringIds: pending });
      notes.push("fijos");
    }
  }
  if (notes.length) toast.success(`Restauré ${notes.join(", ")} de este teléfono`);
  persistLocal(get);
  if (get().pendingRecurringIds.length) void get().flushRecurrings();
}

function paintVault(set: (p: Partial<LedgerState>) => void, get: () => LedgerState, vault: NonNullable<ReturnType<typeof readLocalVault>>) {
  const books = vault.books.length ? vault.books : get().books;
  const accounts = vault.accounts.length ? vault.accounts : get().accounts;
  if (!books.length) return false;
  const confirmed = remapVaultTxs(vault, books, accounts);
  const outbox = vault.outbox;
  const activeBookId = vault.activeBookId || get().activeBookId || books[0]?.id || "";
  const money = hydrateBookMoney({
    books,
    legacyBudgets: vault.budgets,
    legacyGlobal: vault.globalBudget,
    bookBudgets: vault.bookBudgets ?? {},
    bookGlobals: vault.bookGlobals ?? {},
  });
  const scoped = moneyForBook(activeBookId, money.bookBudgets, money.bookGlobals);
  set({
    books,
    accounts,
    cards: vault.cards?.length ? vault.cards : get().cards,
    pendingCardIds: vault.pendingCardIds?.length ? vault.pendingCardIds : get().pendingCardIds,
    activeBookId,
    onboarded: vault.onboarded || get().onboarded,
    recurrings: vault.recurrings.length ? remapVaultRecurrings(vault, books, accounts) : get().recurrings,
    budgets: scoped.budgets,
    globalBudget: scoped.globalBudget,
    bookBudgets: money.bookBudgets,
    bookGlobals: money.bookGlobals,
    categoryNames: vault.categoryNames,
    hiddenCategoryIds: vault.hiddenCategoryIds,
    customCategories: vault.customCategories,
    usdRate: vault.usdRate || get().usdRate,
    usdtRate: vault.usdtRate || get().usdtRate,
    usdSource: isUsdSource(vault.usdSource) ? vault.usdSource : get().usdSource,
    chat: vault.chat.length ? vault.chat : get().chat,
    pendingRecurringIds: vault.pendingRecurringIds.length ? vault.pendingRecurringIds : get().pendingRecurringIds,
  });
  paint(set, get, { confirmed, outbox });
  return true;
}

export const useLedger = create<LedgerState>()((set, get) => ({
  status: "idle",
  ownerId: "",
  ownerEmail: "",
  confirmed: [],
  outbox: [],
  transactions: [],
  books: [],
  accounts: [],
  activeBookId: "",
  onboarded: false,
  categoryNames: {},
  hiddenCategoryIds: [],
  customCategories: [],
  recurrings: [],
  pendingRecurringIds: [],
  cards: [],
  pendingCardIds: [],
  budgets: { ...DEFAULT_BUDGETS },
  globalBudget: DEFAULT_GLOBAL_BUDGET,
  bookBudgets: {},
  bookGlobals: {},
  usdRate: DEFAULT_USD_RATE,
  usdtRate: DEFAULT_USDT_RATE,
  usdSource: DEFAULT_USD_SOURCE,
  quotes: [],
  quotesAt: null,
  quotesBusy: false,
  viewMonth: monthISO(),
  selectedDay: null,
  quickOpen: false,
  editingId: null,
  draft: {},
  chat: [],
  hydrate: (identity) => {
    const ownerId = identity?.id ?? "";
    const ownerEmail = identity?.email ?? "";
    if (get().status === "ready" && get().ownerId && get().ownerId === ownerId && !hydrateLock) {
      return Promise.resolve();
    }
    if (hydrateLock) return hydrateLock;
    set({ status: "loading", ownerId, ownerEmail });
    const local = readLocalVault(ownerEmail);
    if (local?.books.length) {
      paintVault(set, get, local);
      set({ status: "ready" });
    }
    hydrateLock = (async () => {
      try {
        const remote = await Promise.race([
          loadLedger(),
          new Promise<never>((_, reject) => {
            window.setTimeout(
              () =>
                reject(
                  new Error("La base no responde. Pegá DATABASE_URL de Neon en Vercel y hacé Redeploy."),
                ),
              12000,
            );
          }),
        ]);
        if (remote.transactions.length === 0) {
          const legacy = readLocalSnapshot();
          if (legacy) {
            const stamped = legacy.transactions.map((t) =>
              fillTx(
                () =>
                  ({
                    ...get(),
                    accounts: remote.accounts,
                    activeBookId: remote.activeBookId,
                    usdRate: remote.usdRate,
                    usdtRate: remote.usdtRate,
                  }) as LedgerState,
                t,
              ),
            );
            await replaceTransactions({ data: stamped });
            const vaultNow = readLocalVault(ownerEmail);
            const outbox = pruneOutbox(resetTries(get().outbox.length ? get().outbox : (vaultNow?.outbox ?? [])), stamped);
            const legacyCards = withPendingCards(remote.cards ?? [], remote.accounts, {
              cards: get().cards,
              accounts: get().accounts,
              pendingCardIds: get().pendingCardIds,
            });
            set({
              status: "ready",
              books: remote.books,
              accounts: legacyCards.accounts,
              cards: legacyCards.cards,
              activeBookId: remote.activeBookId,
              onboarded: true,
              categoryNames: remote.categoryNames,
              hiddenCategoryIds: remote.hiddenCategoryIds,
              customCategories: remote.customCategories,
              recurrings: remote.recurrings,
              pendingRecurringIds: get().pendingRecurringIds,
              budgets: legacy.budgets,
              globalBudget: legacy.globalBudget,
              bookBudgets: {},
              bookGlobals: {},
              usdRate: remote.usdRate,
              usdtRate: remote.usdtRate,
              usdSource: remote.usdSource,
            });
            paint(set, get, { confirmed: stamped, outbox });
            pushSettings(get);
            clearLocalSnapshot();
            await restoreVault(get, set);
            void get().flushRecurrings({ force: true });
            void get().refreshQuotes();
            offerDueRecurrings(get);
            void get().flushOutbox({ force: true });
            return;
          }
        } else {
          clearLocalSnapshot();
        }
        const vaultNow = readLocalVault(ownerEmail);
        const seed = get().outbox.length ? get().outbox : (vaultNow?.outbox ?? []);
        const outbox = pruneOutbox(resetTries(seed), remote.transactions);
        const merged = withPendingCards(remote.cards ?? [], remote.accounts, {
          cards: get().cards,
          accounts: get().accounts,
          pendingCardIds: get().pendingCardIds,
        });
        set({
          status: "ready",
          books: remote.books,
          accounts: merged.accounts,
          cards: merged.cards,
          activeBookId: remote.activeBookId,
          onboarded: remote.onboarded,
          categoryNames: remote.categoryNames,
          hiddenCategoryIds: remote.hiddenCategoryIds,
          customCategories: remote.customCategories,
          recurrings: remote.recurrings,
          pendingRecurringIds: get().pendingRecurringIds,
          budgets: remote.budgets,
          globalBudget: remote.globalBudget,
          bookBudgets: remote.bookBudgets ?? {},
          bookGlobals: remote.bookGlobals ?? {},
          usdRate: remote.usdRate,
          usdtRate: remote.usdtRate,
          usdSource: remote.usdSource,
        });
        paint(set, get, { confirmed: remote.transactions, outbox });
        await restoreVault(get, set);
        void get().flushRecurrings({ force: true });
        void get().flushCards();
        void get().refreshQuotes();
        offerDueRecurrings(get);
        void get().flushOutbox({ force: true });
      } catch (err) {
        if (get().books.length || get().confirmed.length || get().outbox.length) {
          set({ status: "ready" });
          toast.error("Sin conexión. Estás viendo el último libro de este teléfono.");
        } else {
          persistFail(err);
          set({ status: "error" });
        }
      } finally {
        hydrateLock = null;
      }
    })();
    return hydrateLock;
  },
  resetClient: () => {
    hydrateLock = null;
    set({
      status: "idle",
      ownerId: "",
      ownerEmail: "",
      confirmed: [],
      outbox: [],
      transactions: [],
      books: [],
      accounts: [],
      recurrings: [],
      pendingRecurringIds: [],
      cards: [],
      pendingCardIds: [],
      chat: [],
      selectedDay: null,
      quickOpen: false,
      editingId: null,
      draft: {},
    });
  },
  refreshQuotes: async (quiet = false) => {
    if (get().quotesBusy) return;
    set({ quotesBusy: true });
    try {
      const { quotes } = await fetchQuotes();
      const prev = get();
      const rates = applyQuotes(quotes, prev.usdSource);
      const changed = rates.usd !== prev.usdRate || rates.usdt !== prev.usdtRate;
      set({
        quotes,
        quotesAt: new Date().toISOString(),
        usdRate: rates.usd,
        usdtRate: rates.usdt,
        quotesBusy: false,
      });
      if (changed) pushSettings(get);
    } catch {
      set({ quotesBusy: false });
      if (!quiet) toast.error("No pude actualizar las cotizaciones");
    }
  },
  setUsdSource: (source) => {
    const prev = get().usdSource;
    const prevUsd = get().usdRate;
    const prevUsdt = get().usdtRate;
    const quotes = get().quotes;
    const rates = quotes.length ? applyQuotes(quotes, source) : null;
    set({
      usdSource: source,
      ...(rates ? { usdRate: rates.usd, usdtRate: rates.usdt } : {}),
    });
    pushSettings(get, { usdSource: prev, usdRate: prevUsd, usdtRate: prevUsdt }, set);
  },
  setActiveBook: (id) => {
    const prevId = get().activeBookId;
    const prevBudgets = get().budgets;
    const prevGlobal = get().globalBudget;
    const prevBookBudgets = get().bookBudgets;
    const prevBookGlobals = get().bookGlobals;
    const bookBudgets = { ...prevBookBudgets, [prevId]: prevBudgets };
    const bookGlobals = { ...prevBookGlobals, [prevId]: prevGlobal };
    const scoped = moneyForBook(id, bookBudgets, bookGlobals);
    set({
      activeBookId: id,
      selectedDay: null,
      bookBudgets,
      bookGlobals,
      budgets: scoped.budgets,
      globalBudget: scoped.globalBudget,
    });
    pushSettings(get, {
      activeBookId: prevId,
      budgets: prevBudgets,
      globalBudget: prevGlobal,
      bookBudgets: prevBookBudgets,
      bookGlobals: prevBookGlobals,
    }, set);
  },
  setViewMonth: (ym) => set({ viewMonth: ym, selectedDay: null }),
  setSelectedDay: (day) => set({ selectedDay: day }),
  openQuick: (draft = {}) =>
    set({
      quickOpen: true,
      editingId: draft.id ?? null,
      draft,
    }),
  closeQuick: () => set({ quickOpen: false, editingId: null, draft: {} }),
  addTx: (tx) => {
    const row = fillTx(get, tx);
    paint(set, get, { outbox: enqueue(get().outbox, { id: row.id, action: "add", row, at: Date.now(), tries: 0 }) });
    persistLocal(get);
    void get().flushOutbox();
  },
  updateTx: (id, patch) => {
    const current = get().transactions.find((t) => t.id === id);
    if (!current) return;
    const next = fillTx(get, { ...current, ...patch, id }, current);
    paint(set, get, { outbox: enqueue(get().outbox, { id, action: "update", row: next, at: Date.now(), tries: 0 }) });
    persistLocal(get);
    void get().flushOutbox();
  },
  deleteTx: (id) => {
    paint(set, get, { outbox: enqueue(get().outbox, { id, action: "delete", at: Date.now(), tries: 0 }) });
    persistLocal(get);
    void get().flushOutbox();
  },
  flushOutbox: async (opts) => {
    if (flushBusy) {
      flushAgain = true;
      return;
    }
    flushBusy = true;
    try {
      do {
        flushAgain = false;
        let ops = get().outbox;
        if (opts?.force) {
          ops = resetTries(ops);
          paint(set, get, { outbox: ops });
        }
        let failed = false;
        for (const op of ops) {
          if (!get().outbox.some((o) => o.id === op.id && o.action === op.action)) continue;
          const live = get().outbox.find((o) => o.id === op.id);
          if (!live) continue;
          if (!opts?.force && live.tries >= OUTBOX_MAX_TRIES) continue;
          try {
            if (live.action === "add" && live.row) await saveTransaction({ data: live.row });
            else if (live.action === "update" && live.row) await patchTransaction({ data: { id: live.id, patch: live.row } });
            else if (live.action === "delete") await removeTransaction({ data: live.id });
            ackOp(set, get, live);
          } catch (err) {
            const tries = live.tries + 1;
            paint(set, get, {
              outbox: get().outbox.map((o) => (o.id === live.id ? { ...o, tries } : o)),
            });
            persistLocal(get);
            if (!failed) {
              failed = true;
              persistFail(err, () => void get().flushOutbox({ force: true }));
            }
          }
        }
      } while (flushAgain);
    } finally {
      flushBusy = false;
    }
  },
  setBudget: (categoryId, amount) => {
    const prev = get().budgets;
    const prevMaps = get().bookBudgets;
    const bookId = get().activeBookId;
    const budgets = { ...prev, [categoryId]: amount };
    set({ budgets, bookBudgets: { ...prevMaps, [bookId]: budgets } });
    pushSettings(get, { budgets: prev, bookBudgets: prevMaps }, set);
  },
  replaceBudgets: (patch) => {
    const prev = get().budgets;
    const prevMaps = get().bookBudgets;
    const bookId = get().activeBookId;
    const budgets = { ...prev, ...patch };
    set({ budgets, bookBudgets: { ...prevMaps, [bookId]: budgets } });
    pushSettings(get, { budgets: prev, bookBudgets: prevMaps }, set);
  },
  setGlobalBudget: (amount) => {
    const prev = get().globalBudget;
    const prevMaps = get().bookGlobals;
    const bookId = get().activeBookId;
    set({ globalBudget: amount, bookGlobals: { ...prevMaps, [bookId]: amount } });
    pushSettings(get, { globalBudget: prev, bookGlobals: prevMaps }, set);
  },
  setCategoryName: (id, name) => {
    const prev = get().categoryNames;
    set({ categoryNames: { ...prev, [id]: name } });
    pushSettings(get, { categoryNames: prev }, set);
  },
  setCategoryHidden: (id, hidden) => {
    const prev = get().hiddenCategoryIds;
    const cur = new Set(prev);
    if (hidden) cur.add(id);
    else cur.delete(id);
    set({ hiddenCategoryIds: [...cur] });
    pushSettings(get, { hiddenCategoryIds: prev }, set);
  },
  addCustomCategory: ({ name, kind }) => {
    const trimmed = name.trim().slice(0, 40);
    if (trimmed.length < 2) return false;
    const custom = get().customCategories;
    const names = get().categoryNames;
    const taken = mergedCategories(custom, names).some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (taken) {
      toast.error("Ya hay una categoría con ese nombre");
      return false;
    }
    const style = nextCustomStyle(custom.length, kind);
    const row: Category = {
      id: `c_${uid().replaceAll("-", "").slice(0, 12)}`,
      name: trimmed,
      kind,
      token: style.token,
      icon: style.icon,
    };
    set({ customCategories: [...custom, row] });
    pushSettings(get, { customCategories: custom }, set);
    return true;
  },
  removeCustomCategory: (id) => {
    if (BUILTIN_IDS.has(id)) {
      get().setCategoryHidden(id, true);
      return;
    }
    const used = get().transactions.some((t) => t.categoryId === id) || get().recurrings.some((r) => r.categoryId === id);
    if (used) {
      get().setCategoryHidden(id, true);
      toast.message("La oculté. Hay movimientos con esta categoría.");
      return;
    }
    const prevCustom = get().customCategories;
    const prevHidden = get().hiddenCategoryIds;
    set({
      customCategories: prevCustom.filter((c) => c.id !== id),
      hiddenCategoryIds: prevHidden.filter((x) => x !== id),
    });
    pushSettings(get, { customCategories: prevCustom, hiddenCategoryIds: prevHidden }, set);
  },
  setAccountOpening: (id, opening) => {
    const prev = get().accounts;
    const accounts = prev.map((a) => (a.id === id ? { ...a, opening } : a));
    set({ accounts });
    persistLocal(get);
    void saveAccounts({ data: { accounts: [{ id, opening }] } }).catch((err) => {
      persistFail(err);
      set({ accounts: prev });
      persistLocal(get);
    });
  },
  completeOnboarding: ({ globalBudget, openings }) => {
    const prevAccounts = get().accounts;
    const prevBudget = get().globalBudget;
    const prevOnboarded = get().onboarded;
    const prevGlobals = get().bookGlobals;
    const accounts = prevAccounts.map((a) => {
      const hit = openings.find((o) => o.id === a.id);
      return hit ? { ...a, opening: hit.opening } : a;
    });
    const personal = get().books.find((b) => b.kind === "personal")?.id ?? get().activeBookId;
    set({
      accounts,
      globalBudget,
      bookGlobals: { ...prevGlobals, [personal]: globalBudget },
      onboarded: true,
    });
    persistLocal(get);
    void saveAccounts({ data: { accounts: openings } }).catch((err) => {
      persistFail(err);
      set({ accounts: prevAccounts });
      persistLocal(get);
    });
    pushSettings(get, { globalBudget: prevBudget, onboarded: prevOnboarded }, set);
  },
  upsertRecurring: (row) => {
    const prev = get().recurrings;
    const next = prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row];
    const pending = [...new Set([...get().pendingRecurringIds, row.id])];
    set({ recurrings: next, pendingRecurringIds: pending });
    persistLocal(get);
    void get().flushRecurrings();
  },
  deleteRecurring: (id) => {
    const prev = get().recurrings;
    const prevPending = get().pendingRecurringIds;
    set({
      recurrings: prev.filter((r) => r.id !== id),
      pendingRecurringIds: prevPending.filter((x) => x !== id),
    });
    persistLocal(get);
    void removeRecurring({ data: id }).catch((err) => {
      persistFail(err);
      set({ recurrings: prev, pendingRecurringIds: prevPending });
      persistLocal(get);
    });
  },
  postRecurring: (id, ym = monthISO()) => {
    const r = get().recurrings.find((x) => x.id === id);
    if (!r) return false;
    if (isPosted(r, get().transactions, ym)) return false;
    const acc = get().accounts.find((a) => a.id === r.accountId);
    const currency = acc?.currency ?? r.currency;
    get().addTx({
      id: postedTxId(r.id, ym),
      type: r.type,
      amount: r.amount,
      currency,
      categoryId: r.categoryId,
      merchant: r.name,
      note: r.note || "Fijo mensual",
      date: dueDate(ym, r.day),
      method: r.method,
      bookId: r.bookId,
      accountId: r.accountId,
      counterpartyId: "",
      amountTo: 0,
      rateArs: 0,
      rateLocked: false,
      recurringId: r.id,
    });
    return true;
  },
  flushRecurrings: async () => {
    if (recFlushBusy) {
      recFlushAgain = true;
      return;
    }
    recFlushBusy = true;
    try {
      do {
        recFlushAgain = false;
        const ids = get().pendingRecurringIds;
        if (!ids.length) continue;
        const rows = get().recurrings.filter((r) => ids.includes(r.id));
        if (!rows.length) {
          set({ pendingRecurringIds: [] });
          persistLocal(get);
          continue;
        }
        try {
          await replaceRecurrings({ data: rows });
          const left = get().pendingRecurringIds.filter((id) => !ids.includes(id));
          set({ pendingRecurringIds: left });
          persistLocal(get);
        } catch (err) {
          persistFail(err, () => void get().flushRecurrings());
        }
      } while (recFlushAgain);
    } finally {
      recFlushBusy = false;
    }
  },
  upsertCard: (input) => {
    const s = get();
    const existing = input.id ? s.cards.find((c) => c.id === input.id) : undefined;
    const bookId = existing?.bookId || input.bookId || s.activeBookId;
    if (!bookId) return null;
    const name = input.name.trim().slice(0, 60);
    if (name.length < 2) {
      toast.error("Poné un nombre para la tarjeta");
      return null;
    }
    const card: Card = {
      id: existing?.id ?? uid(),
      bookId,
      name,
      bank: input.bank.trim().slice(0, 60),
      network: input.network,
      last4: input.last4,
      closingDay: clampDay(input.closingDay),
      dueDay: clampDay(input.dueDay),
      limitArs: input.limitArs > 0 ? input.limitArs : 0,
      accountArsId: existing?.accountArsId ?? uid(),
      accountUsdId: existing?.accountUsdId ?? uid(),
      payAccountId: input.payAccountId,
      usdPerceptionPct: input.usdPerceptionPct,
      archived: false,
    };
    const names = cardAccountNames(card.name);
    const cajas: Account[] = [
      { id: card.accountArsId, bookId, name: names.ars, kind: "card", currency: "ARS", opening: 0, archived: false },
      { id: card.accountUsdId, bookId, name: names.usd, kind: "card", currency: "USD", opening: 0, archived: false },
    ];
    const ids = new Set([card.accountArsId, card.accountUsdId]);
    set({
      cards: existing ? s.cards.map((c) => (c.id === card.id ? card : c)) : [...s.cards, card],
      accounts: [
        ...s.accounts.filter((a) => !ids.has(a.id)),
        ...cajas.map((a) => ({ ...a, opening: s.accounts.find((x) => x.id === a.id)?.opening ?? 0 })),
      ],
      pendingCardIds: [...new Set([...s.pendingCardIds, card.id])],
    });
    persistLocal(get);
    void get().flushCards();
    return card;
  },
  archiveCard: (id) => {
    const s = get();
    const card = s.cards.find((c) => c.id === id);
    if (!card) return;
    const ids = new Set([card.accountArsId, card.accountUsdId]);
    set({
      cards: s.cards.map((c) => (c.id === id ? { ...c, archived: true } : c)),
      accounts: s.accounts.map((a) => (ids.has(a.id) ? { ...a, archived: true } : a)),
      pendingCardIds: [...new Set([...s.pendingCardIds, id])],
    });
    persistLocal(get);
    void get().flushCards();
  },
  flushCards: async () => {
    if (cardFlushBusy) {
      cardFlushAgain = true;
      return;
    }
    cardFlushBusy = true;
    try {
      do {
        cardFlushAgain = false;
        const ids = get().pendingCardIds;
        if (!ids.length) continue;
        const rows = get().cards.filter((c) => ids.includes(c.id));
        if (!rows.length) {
          set({ pendingCardIds: [] });
          persistLocal(get);
          continue;
        }
        try {
          await saveCards({ data: rows });
          set({ pendingCardIds: get().pendingCardIds.filter((id) => !ids.includes(id)) });
          persistLocal(get);
        } catch (err) {
          persistFail(err, () => void get().flushCards());
        }
      } while (cardFlushAgain);
    } finally {
      cardFlushBusy = false;
    }
  },
  pushChat: (msg) => {
    set({ chat: [...get().chat, msg].slice(-24) });
    persistLocal(get);
  },
  clearChat: () => {
    set({ chat: [] });
    persistLocal(get);
  },
  loadDemo: () => {
    const { activeBookId, accounts, usdRate, usdtRate } = get();
    const transactions = buildSeed().map((t) =>
      fillTx(() => ({ ...get(), activeBookId, accounts, usdRate, usdtRate }) as LedgerState, t),
    );
    paint(set, get, { confirmed: transactions, outbox: [] });
    set({
      budgets: { ...DEFAULT_BUDGETS },
      globalBudget: DEFAULT_GLOBAL_BUDGET,
      bookBudgets: {},
      bookGlobals: {},
      chat: [],
      viewMonth: monthISO(),
      onboarded: true,
    });
    persistLocal(get);
    void replaceTransactions({ data: transactions }).catch((err) => persistFail(err));
    pushSettings(get);
  },
  wipe: () => {
    const { activeBookId, confirmed, outbox, transactions } = get();
    const kept = confirmed.filter((t) => t.bookId && t.bookId !== activeBookId);
    const nextOutbox = outbox.filter((o) => {
      const row = o.row ?? transactions.find((t) => t.id === o.id);
      return row?.bookId && row.bookId !== activeBookId;
    });
    paint(set, get, { confirmed: kept, outbox: nextOutbox });
    set({ chat: [] });
    persistLocal(get);
    void replaceTransactions({ data: kept }).catch((err) => {
      persistFail(err);
      paint(set, get, { confirmed, outbox });
      persistLocal(get);
    });
  },
}));

export function useBookTxs() {
  return useLedger(
    useShallow((s) => s.transactions.filter((t) => !s.activeBookId || t.bookId === s.activeBookId)),
  );
}

export function useBookCards() {
  return useLedger(useShallow((s) => s.cards.filter((c) => c.bookId === s.activeBookId && !c.archived)));
}

export function useBookAccounts() {
  return useLedger(
    useShallow((s) => s.accounts.filter((a) => a.bookId === s.activeBookId && !a.archived)),
  );
}

export function useAllCategories() {
  const custom = useLedger((s) => s.customCategories);
  const names = useLedger((s) => s.categoryNames);
  return useMemo(() => mergedCategories(custom, names), [custom, names]);
}

export function useVisibleCategories(kind?: CategoryKind) {
  const all = useAllCategories();
  const hidden = useLedger((s) => s.hiddenCategoryIds);
  return useMemo(() => {
    const hide = new Set(hidden);
    const vis = all.filter((c) => !hide.has(c.id));
    return kind ? vis.filter((c) => c.kind === kind) : vis;
  }, [all, hidden, kind]);
}
