import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { DEFAULT_BUDGETS, DEFAULT_GLOBAL_BUDGET, BUILTIN_IDS, mergedCategories, nextCustomStyle } from "./categories";
import {
  loadLedger,
  patchTransaction,
  removeRecurring,
  removeTransaction,
  replaceTransactions,
  saveAccounts,
  saveRecurring,
  saveSettings,
  saveTransaction,
} from "./ledger-api";
import { fetchQuotes } from "./fx-api";
import {
  DEFAULT_USD_RATE,
  DEFAULT_USDT_RATE,
  DEFAULT_USD_SOURCE,
  applyQuotes,
  type Quote,
  type UsdSource,
} from "./fx";
import { inferAccount, stampRate } from "./books";
import { dueDate, isDue, isPosted, postedTxId } from "./recurring";
import { buildSeed } from "./seed";
import { monthISO, todayISO, uid } from "./utils";
import type { Account, Book, Category, CategoryKind, ChatMessage, Recurring, Transaction } from "./types";

const LOCAL_KEY = "cifra-ledger-v1";

type Draft = Partial<Transaction> & { id?: string };
type Status = "idle" | "loading" | "ready" | "error";

type LedgerState = {
  status: Status;
  transactions: Transaction[];
  books: Book[];
  accounts: Account[];
  activeBookId: string;
  onboarded: boolean;
  categoryNames: Record<string, string>;
  hiddenCategoryIds: string[];
  customCategories: Category[];
  recurrings: Recurring[];
  budgets: Record<string, number>;
  globalBudget: number;
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
  hydrate: () => Promise<void>;
  resetClient: () => void;
  refreshQuotes: (quiet?: boolean) => Promise<void>;
  setUsdSource: (source: UsdSource) => void;
  setActiveBook: (id: string) => void;
  setViewMonth: (ym: string) => void;
  setSelectedDay: (day: string | null) => void;
  openQuick: (draft?: Draft) => void;
  closeQuick: () => void;
  addTx: (tx: Omit<Transaction, "id" | "createdAt"> & { id?: string; createdAt?: string }) => void;
  updateTx: (id: string, patch: Partial<Transaction>) => void;
  deleteTx: (id: string) => void;
  setBudget: (categoryId: string, amount: number) => void;
  setGlobalBudget: (amount: number) => void;
  setCategoryName: (id: string, name: string) => void;
  setCategoryHidden: (id: string, hidden: boolean) => void;
  addCustomCategory: (input: { name: string; kind: CategoryKind }) => void;
  removeCustomCategory: (id: string) => void;
  setAccountOpening: (id: string, opening: number) => void;
  completeOnboarding: (input: { globalBudget: number; openings: { id: string; opening: number }[] }) => void;
  upsertRecurring: (row: Recurring) => void;
  deleteRecurring: (id: string) => void;
  postRecurring: (id: string, ym?: string) => boolean;
  postDueRecurrings: () => number;
  pushChat: (msg: ChatMessage) => void;
  clearChat: () => void;
  loadDemo: () => void;
  wipe: () => void;
};

function persistFail(err: unknown) {
  const msg = err instanceof Error ? err.message : "No pude guardar";
  if (msg === "Unauthorized") return;
  toast.error("No pude guardar en tu libro", { description: msg });
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

let hydrateLock: Promise<void> | null = null;

function pushSettings(get: () => LedgerState) {
  const { budgets, globalBudget, usdRate, usdtRate, usdSource, activeBookId, onboarded, categoryNames, hiddenCategoryIds, customCategories } = get();
  void saveSettings({
    data: { budgets, globalBudget, usdRate, usdtRate, usdSource, activeBookId, onboarded, categoryNames, hiddenCategoryIds, customCategories },
  }).catch(persistFail);
}

function fillTx(get: () => LedgerState, tx: Omit<Transaction, "id" | "createdAt"> & { id?: string; createdAt?: string }): Transaction {
  const { activeBookId, accounts, usdRate, usdtRate } = get();
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
  };
}

export const useLedger = create<LedgerState>()((set, get) => ({
  status: "idle",
  transactions: [],
  books: [],
  accounts: [],
  activeBookId: "",
  onboarded: false,
  categoryNames: {},
  hiddenCategoryIds: [],
  customCategories: [],
  recurrings: [],
  budgets: { ...DEFAULT_BUDGETS },
  globalBudget: DEFAULT_GLOBAL_BUDGET,
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
  hydrate: () => {
    if (get().status === "ready") return Promise.resolve();
    if (hydrateLock) return hydrateLock;
    set({ status: "loading" });
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
          const local = readLocalSnapshot();
          if (local) {
            const stamped = local.transactions.map((t) =>
              fillTx(
                () => ({ ...get(), accounts: remote.accounts, activeBookId: remote.activeBookId, usdRate: remote.usdRate, usdtRate: remote.usdtRate }) as LedgerState,
                t,
              ),
            );
            await replaceTransactions({ data: stamped });
            set({
              status: "ready",
              transactions: stamped,
              books: remote.books,
              accounts: remote.accounts,
              activeBookId: remote.activeBookId,
              onboarded: true,
              categoryNames: remote.categoryNames,
              hiddenCategoryIds: remote.hiddenCategoryIds,
              customCategories: remote.customCategories,
              recurrings: remote.recurrings,
              budgets: local.budgets,
              globalBudget: local.globalBudget,
              usdRate: remote.usdRate,
              usdtRate: remote.usdtRate,
              usdSource: remote.usdSource,
            });
            pushSettings(get);
            clearLocalSnapshot();
            void get().refreshQuotes();
            const posted = get().postDueRecurrings();
            if (posted > 0) toast.success(posted === 1 ? "Anoté 1 fijo de este mes" : `Anoté ${posted} fijos de este mes`);
            return;
          }
        } else {
          clearLocalSnapshot();
        }
        set({
          status: "ready",
          transactions: remote.transactions,
          books: remote.books,
          accounts: remote.accounts,
          activeBookId: remote.activeBookId,
          onboarded: remote.onboarded,
          categoryNames: remote.categoryNames,
          hiddenCategoryIds: remote.hiddenCategoryIds,
          customCategories: remote.customCategories,
          recurrings: remote.recurrings,
          budgets: remote.budgets,
          globalBudget: remote.globalBudget,
          usdRate: remote.usdRate,
          usdtRate: remote.usdtRate,
          usdSource: remote.usdSource,
        });
        void get().refreshQuotes();
        const posted = get().postDueRecurrings();
        if (posted > 0) toast.success(posted === 1 ? "Anoté 1 fijo de este mes" : `Anoté ${posted} fijos de este mes`);
      } catch (err) {
        persistFail(err);
        set({ status: "error" });
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
      transactions: [],
      books: [],
      accounts: [],
      recurrings: [],
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
      const rates = applyQuotes(quotes, get().usdSource);
      set({
        quotes,
        quotesAt: new Date().toISOString(),
        usdRate: rates.usd,
        usdtRate: rates.usdt,
        quotesBusy: false,
      });
      pushSettings(get);
    } catch {
      set({ quotesBusy: false });
      if (!quiet) toast.error("No pude actualizar las cotizaciones");
    }
  },
  setUsdSource: (source) => {
    const quotes = get().quotes;
    const rates = quotes.length ? applyQuotes(quotes, source) : null;
    set({
      usdSource: source,
      ...(rates ? { usdRate: rates.usd, usdtRate: rates.usdt } : {}),
    });
    pushSettings(get);
  },
  setActiveBook: (id) => {
    set({ activeBookId: id, selectedDay: null });
    pushSettings(get);
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
    set({ transactions: [row, ...get().transactions] });
    void saveTransaction({ data: row }).catch((err) => {
      set({ transactions: get().transactions.filter((t) => t.id !== row.id) });
      persistFail(err);
    });
  },
  updateTx: (id, patch) => {
    const prev = get().transactions;
    const current = prev.find((t) => t.id === id);
    if (!current) return;
    const next = fillTx(get, { ...current, ...patch, id });
    set({ transactions: prev.map((t) => (t.id === id ? next : t)) });
    void patchTransaction({ data: { id, patch: next } }).catch((err) => {
      set({ transactions: prev });
      persistFail(err);
    });
  },
  deleteTx: (id) => {
    const prev = get().transactions;
    set({ transactions: prev.filter((t) => t.id !== id) });
    void removeTransaction({ data: id }).catch((err) => {
      set({ transactions: prev });
      persistFail(err);
    });
  },
  setBudget: (categoryId, amount) => {
    set({ budgets: { ...get().budgets, [categoryId]: amount } });
    pushSettings(get);
  },
  setGlobalBudget: (amount) => {
    set({ globalBudget: amount });
    pushSettings(get);
  },
  setCategoryName: (id, name) => {
    set({ categoryNames: { ...get().categoryNames, [id]: name } });
    pushSettings(get);
  },
  setCategoryHidden: (id, hidden) => {
    const cur = new Set(get().hiddenCategoryIds);
    if (hidden) cur.add(id);
    else cur.delete(id);
    set({ hiddenCategoryIds: [...cur] });
    pushSettings(get);
  },
  addCustomCategory: ({ name, kind }) => {
    const trimmed = name.trim().slice(0, 40);
    if (trimmed.length < 2) return;
    const custom = get().customCategories;
    const style = nextCustomStyle(custom.length, kind);
    const row: Category = {
      id: `c_${uid().replaceAll("-", "").slice(0, 12)}`,
      name: trimmed,
      kind,
      token: style.token,
      icon: style.icon,
    };
    set({ customCategories: [...custom, row] });
    pushSettings(get);
  },
  removeCustomCategory: (id) => {
    if (BUILTIN_IDS.has(id)) {
      get().setCategoryHidden(id, true);
      return;
    }
    const used = get().transactions.some((t) => t.categoryId === id) || get().recurrings.some((r) => r.categoryId === id);
    if (used) {
      get().setCategoryHidden(id, true);
      return;
    }
    set({
      customCategories: get().customCategories.filter((c) => c.id !== id),
      hiddenCategoryIds: get().hiddenCategoryIds.filter((x) => x !== id),
    });
    pushSettings(get);
  },
  setAccountOpening: (id, opening) => {
    set({
      accounts: get().accounts.map((a) => (a.id === id ? { ...a, opening } : a)),
    });
    void saveAccounts({ data: { accounts: [{ id, opening }] } }).catch(persistFail);
  },
  completeOnboarding: ({ globalBudget, openings }) => {
    const accounts = get().accounts.map((a) => {
      const hit = openings.find((o) => o.id === a.id);
      return hit ? { ...a, opening: hit.opening } : a;
    });
    set({ accounts, globalBudget, onboarded: true });
    void saveAccounts({ data: { accounts: openings } }).catch(persistFail);
    pushSettings(get);
  },
  upsertRecurring: (row) => {
    const prev = get().recurrings;
    const next = prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row];
    set({ recurrings: next });
    void saveRecurring({ data: row }).catch((err) => {
      set({ recurrings: prev });
      persistFail(err);
    });
  },
  deleteRecurring: (id) => {
    const prev = get().recurrings;
    set({ recurrings: prev.filter((r) => r.id !== id) });
    void removeRecurring({ data: id }).catch((err) => {
      set({ recurrings: prev });
      persistFail(err);
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
  postDueRecurrings: () => {
    const ym = monthISO();
    const today = todayISO();
    let n = 0;
    for (const r of get().recurrings) {
      if (!isDue(r, ym, today)) continue;
      if (get().postRecurring(r.id, ym)) n += 1;
    }
    return n;
  },
  pushChat: (msg) => set({ chat: [...get().chat, msg].slice(-24) }),
  clearChat: () => set({ chat: [] }),
  loadDemo: () => {
    const { activeBookId, accounts, usdRate, usdtRate } = get();
    const transactions = buildSeed().map((t) =>
      fillTx(() => ({ ...get(), activeBookId, accounts, usdRate, usdtRate }) as LedgerState, t),
    );
    set({
      transactions,
      budgets: { ...DEFAULT_BUDGETS },
      globalBudget: DEFAULT_GLOBAL_BUDGET,
      chat: [],
      viewMonth: monthISO(),
      onboarded: true,
    });
    void replaceTransactions({ data: transactions }).catch(persistFail);
    pushSettings(get);
  },
  wipe: () => {
    const { activeBookId, transactions } = get();
    const kept = transactions.filter((t) => t.bookId && t.bookId !== activeBookId);
    set({ transactions: kept, chat: [] });
    void replaceTransactions({ data: kept }).catch(persistFail);
  },
}));

export function useBookTxs() {
  return useLedger(
    useShallow((s) => s.transactions.filter((t) => !s.activeBookId || t.bookId === s.activeBookId)),
  );
}

export function useBookAccounts() {
  return useLedger(
    useShallow((s) => s.accounts.filter((a) => a.bookId === s.activeBookId && !a.archived)),
  );
}

export function useAllCategories() {
  return useLedger(useShallow((s) => mergedCategories(s.customCategories, s.categoryNames)));
}

export function useVisibleCategories(kind?: CategoryKind) {
  return useLedger(
    useShallow((s) => {
      const hidden = new Set(s.hiddenCategoryIds);
      const all = mergedCategories(s.customCategories, s.categoryNames).filter((c) => !hidden.has(c.id));
      return kind ? all.filter((c) => c.kind === kind) : all;
    }),
  );
}
