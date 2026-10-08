import { createServerFn } from "@tanstack/react-start";
import { getSql, withTransaction } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { DEFAULT_BUDGETS, DEFAULT_GLOBAL_BUDGET, parseCustomCategories, parseHiddenIds } from "@/lib/categories";
import { hydrateBookMoney, locksForBook, moneyForBook, parseBookBudgets, parseBookGlobals, parseBookLocks } from "@/lib/budget-math";
import {
  ACCOUNT_TEMPLATES,
  BOOK_SPECS,
  inferAccount,
} from "@/lib/books";
import { DEFAULT_USD_RATE, DEFAULT_USDT_RATE, DEFAULT_USD_SOURCE, isUsdSource, type UsdSource } from "@/lib/fx";
import type { Account, BankStatement, Book, BookKind, Card, CardNetwork, CardPurchase, Category, Currency, PayMethod, Recurring, Transaction, TxType } from "@/lib/types";
import { cardAccountNames, clampDay, MAX_INSTALLMENTS, validLast4 } from "@/lib/card-math";
import { parseChatThreads, type ChatThread } from "@/lib/chat-threads";
import { parseGoals, type Goal } from "@/lib/goals";
import { uid } from "@/lib/utils";
import { MAIL, sendMailQuiet } from "@/lib/mail";

export type LedgerSnapshot = {
  transactions: Transaction[];
  books: Book[];
  accounts: Account[];
  budgets: Record<string, number>;
  globalBudget: number;
  bookBudgets: Record<string, Record<string, number>>;
  bookGlobals: Record<string, number>;
  bookBudgetLocks: Record<string, Record<string, boolean>>;
  budgetLocks: Record<string, boolean>;
  usdRate: number;
  usdtRate: number;
  usdSource: UsdSource;
  activeBookId: string;
  onboarded: boolean;
  categoryNames: Record<string, string>;
  hiddenCategoryIds: string[];
  customCategories: Category[];
  chatThreads: ChatThread[];
  goals: Goal[];
  recurrings: Recurring[];
  cards: Card[];
  purchases: CardPurchase[];
  statements: BankStatement[];
};

const TYPES = new Set<TxType>(["expense", "income", "transfer"]);
const CURRENCIES = new Set<Currency>(["ARS", "USD", "USDT"]);
const METHODS = new Set<PayMethod>([
  "efectivo",
  "debito",
  "credito",
  "transferencia",
  "mercadopago",
  "crypto",
  "otro",
]);

type TxRow = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  category_id: string;
  note: string;
  merchant: string;
  date: string;
  method: string;
  created_at: string;
  book_id: string | null;
  account_id: string | null;
  counterparty_id: string | null;
  amount_to: number | null;
  rate_ars: number | null;
  rate_locked: boolean | number | null;
  recurring_id: string | null;
  card_period: string | null;
  purchase_id: string | null;
  installment_no: number | null;
  installment_count: number | null;
};

function asTx(input: Transaction): Transaction {
  if (!input?.id || typeof input.id !== "string") throw new Error("Movimiento inválido");
  if (!TYPES.has(input.type)) throw new Error("Tipo inválido");
  if (!CURRENCIES.has(input.currency)) throw new Error("Moneda inválida");
  if (!METHODS.has(input.method)) throw new Error("Medio inválido");
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Fecha inválida");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Monto inválido");
  const amountTo = Number(input.amountTo ?? 0);
  const rateArs = Number(input.rateArs ?? 0);
  return {
    id: input.id,
    type: input.type,
    amount,
    currency: input.currency,
    categoryId: String(input.categoryId ?? "otros"),
    note: String(input.note ?? "").slice(0, 400),
    merchant: String(input.merchant ?? "").slice(0, 120),
    date: input.date,
    method: input.method,
    createdAt: input.createdAt || new Date().toISOString(),
    bookId: String(input.bookId ?? ""),
    accountId: String(input.accountId ?? ""),
    counterpartyId: String(input.counterpartyId ?? ""),
    amountTo: Number.isFinite(amountTo) && amountTo >= 0 ? amountTo : 0,
    rateArs: Number.isFinite(rateArs) && rateArs > 0 ? rateArs : 1,
    rateLocked: Boolean(input.rateLocked),
    recurringId: String(input.recurringId ?? ""),
    cardPeriod: /^\d{4}-\d{2}$/.test(String(input.cardPeriod ?? "")) ? String(input.cardPeriod) : "",
    ...installmentOf(input),
  };
}

/** Installment fields: only together, 1 ≤ no ≤ count ≤ 72, with a purchase id. */
function installmentOf(input: Partial<Transaction>) {
  const purchaseId = String(input.purchaseId ?? "").slice(0, 80);
  const no = Math.round(Number(input.installmentNo ?? 0));
  const count = Math.round(Number(input.installmentCount ?? 0));
  if (!purchaseId || !(no >= 1 && count >= 1 && no <= count && count <= 72)) {
    return { purchaseId: "", installmentNo: 0, installmentCount: 0 };
  }
  return { purchaseId, installmentNo: no, installmentCount: count };
}

function rowToTx(row: TxRow): Transaction {
  return {
    id: row.id,
    type: row.type as TxType,
    amount: Number(row.amount),
    currency: row.currency as Currency,
    categoryId: row.category_id,
    note: row.note ?? "",
    merchant: row.merchant ?? "",
    date: String(row.date).slice(0, 10),
    method: row.method as PayMethod,
    createdAt: row.created_at,
    bookId: row.book_id ?? "",
    accountId: row.account_id ?? "",
    counterpartyId: row.counterparty_id ?? "",
    amountTo: Number(row.amount_to ?? 0),
    rateArs: Number(row.rate_ars ?? 0),
    rateLocked: Boolean(row.rate_locked),
    recurringId: row.recurring_id ?? "",
    cardPeriod: row.card_period ?? "",
    purchaseId: row.purchase_id ?? "",
    installmentNo: Number(row.installment_no ?? 0),
    installmentCount: Number(row.installment_count ?? 0),
  };
}

async function ensureSettings(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const existing = await sql<{
    budgets: Record<string, number> | string;
    global_budget: number;
    usd_rate: number;
    usdt_rate: number;
    usd_source: string;
    active_book_id: string | null;
    onboarded: boolean | number | null;
    category_names: Record<string, string> | string | null;
    hidden_category_ids: unknown;
    custom_categories: unknown;
    book_budgets: unknown;
    book_globals: unknown;
    book_budget_locks: unknown;
    chat_threads: unknown;
    goals: unknown;
  }>`select budgets, global_budget, usd_rate, usdt_rate, usd_source, active_book_id, onboarded, category_names,
             coalesce(hidden_category_ids, '[]'::jsonb) as hidden_category_ids,
             coalesce(custom_categories, '[]'::jsonb) as custom_categories,
             coalesce(book_budgets, '{}'::jsonb) as book_budgets,
             coalesce(book_globals, '{}'::jsonb) as book_globals,
             coalesce(book_budget_locks, '{}'::jsonb) as book_budget_locks,
             coalesce(chat_threads, '[]'::jsonb) as chat_threads,
             coalesce(goals, '[]'::jsonb) as goals
      from ledger_settings where user_id = ${userId} limit 1`;
  if (existing[0]) {
    const budgets =
      typeof existing[0].budgets === "string"
        ? (JSON.parse(existing[0].budgets) as Record<string, number>)
        : existing[0].budgets;
    const namesRaw = existing[0].category_names;
    const categoryNames =
      typeof namesRaw === "string" ? (JSON.parse(namesRaw) as Record<string, string>) : (namesRaw ?? {});
    return {
      budgets: { ...DEFAULT_BUDGETS, ...budgets },
      globalBudget: Number(existing[0].global_budget) || DEFAULT_GLOBAL_BUDGET,
      bookBudgets: parseBookBudgets(existing[0].book_budgets),
      bookGlobals: parseBookGlobals(existing[0].book_globals),
      bookBudgetLocks: parseBookLocks(existing[0].book_budget_locks),
      usdRate: Number(existing[0].usd_rate) || DEFAULT_USD_RATE,
      usdtRate: Number(existing[0].usdt_rate) || DEFAULT_USDT_RATE,
      usdSource: isUsdSource(existing[0].usd_source) ? existing[0].usd_source : DEFAULT_USD_SOURCE,
      activeBookId: existing[0].active_book_id ?? "",
      onboarded: Boolean(existing[0].onboarded),
      categoryNames,
      hiddenCategoryIds: parseHiddenIds(existing[0].hidden_category_ids),
      customCategories: parseCustomCategories(existing[0].custom_categories),
      chatThreads: parseChatThreads(existing[0].chat_threads),
      goals: parseGoals(existing[0].goals),
    };
  }
  await sql`
    insert into ledger_settings (user_id, budgets, global_budget, usd_rate, usdt_rate, usd_source, onboarded, category_names, hidden_category_ids, custom_categories)
    values (${userId}, ${JSON.stringify(DEFAULT_BUDGETS)}::jsonb, ${DEFAULT_GLOBAL_BUDGET}, ${DEFAULT_USD_RATE}, ${DEFAULT_USDT_RATE}, ${DEFAULT_USD_SOURCE}, false, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)
    on conflict (user_id) do nothing
  `;
  return {
    budgets: { ...DEFAULT_BUDGETS },
    globalBudget: DEFAULT_GLOBAL_BUDGET,
    bookBudgets: {},
    bookGlobals: {},
    bookBudgetLocks: {},
    usdRate: DEFAULT_USD_RATE,
    usdtRate: DEFAULT_USDT_RATE,
    usdSource: DEFAULT_USD_SOURCE,
    activeBookId: "",
    onboarded: false,
    categoryNames: {} as Record<string, string>,
    hiddenCategoryIds: [] as string[],
    customCategories: [] as Category[],
    chatThreads: [] as ChatThread[],
    goals: [] as Goal[],
  };
}

async function ensureBooks(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  txs: Transaction[],
  settings: Awaited<ReturnType<typeof ensureSettings>>,
): Promise<{ books: Book[]; accounts: Account[]; activeBookId: string; onboarded: boolean }> {
  let books = await sql<{ id: string; name: string; kind: string }>`
    select id, name, kind from ledger_books where user_id = ${userId} order by created_at
  `;
  let accounts = await sql<{
    id: string;
    book_id: string;
    name: string;
    kind: string;
    currency: string;
    opening: number;
    archived: boolean;
  }>`
    select id, book_id, name, kind, currency, opening, archived from ledger_accounts where user_id = ${userId}
  `;

  if (books.length === 0) {
    const created: Book[] = BOOK_SPECS.map((spec) => ({
      id: uid(),
      name: spec.name,
      kind: spec.kind,
    }));
    for (const b of created) {
      await sql`
        insert into ledger_books (id, user_id, name, kind)
        values (${b.id}, ${userId}, ${b.name}, ${b.kind})
      `;
    }
    books = created;
    const accs: Account[] = [];
    for (const b of created) {
      for (const t of ACCOUNT_TEMPLATES) {
        accs.push({
          id: uid(),
          bookId: b.id,
          name: t.name,
          kind: t.kind,
          currency: t.currency,
          opening: 0,
          archived: false,
        });
      }
    }
    for (const a of accs) {
      await sql`
        insert into ledger_accounts (id, user_id, book_id, name, kind, currency, opening, archived)
        values (${a.id}, ${userId}, ${a.bookId}, ${a.name}, ${a.kind}, ${a.currency}, ${a.opening}, ${a.archived})
      `;
    }
    accounts = accs.map((a) => ({
      id: a.id,
      book_id: a.bookId,
      name: a.name,
      kind: a.kind,
      currency: a.currency,
      opening: a.opening,
      archived: a.archived,
    }));
  }

  const mappedBooks: Book[] = books.map((b) => ({
    id: b.id,
    name: b.name,
    kind: b.kind as BookKind,
  }));
  const mappedAccs: Account[] = accounts.map((a) => ({
    id: a.id,
    bookId: "book_id" in a ? (a as { book_id: string }).book_id : (a as Account).bookId,
    name: a.name,
    kind: a.kind as Account["kind"],
    currency: a.currency as Currency,
    opening: Number(a.opening),
    archived: Boolean(a.archived),
  }));

  const personal = mappedBooks.find((b) => b.kind === "personal") ?? mappedBooks[0]!;
  const activeBookId =
    mappedBooks.some((b) => b.id === settings.activeBookId) ? settings.activeBookId : personal.id;

  const missing = txs.filter((t) => !t.bookId || !t.accountId);
  if (missing.length) {
    for (const t of missing) {
      const bookId = t.bookId || personal.id;
      const accountId = t.accountId || inferAccount(mappedAccs, bookId, t.method, t.currency);
      const rateArs =
        t.rateArs > 0 ? t.rateArs : t.currency === "ARS" ? 1 : t.currency === "USDT" ? settings.usdtRate : settings.usdRate;
      await sql`
        update ledger_transactions set
          book_id = ${bookId},
          account_id = ${accountId},
          rate_ars = ${rateArs}
        where id = ${t.id} and user_id = ${userId}
      `;
      t.bookId = bookId;
      t.accountId = accountId;
      t.rateArs = rateArs;
    }
  }

  const onboarded = settings.onboarded || txs.length > 0;
  if (onboarded !== settings.onboarded || activeBookId !== settings.activeBookId) {
    await sql`
      update ledger_settings set active_book_id = ${activeBookId}, onboarded = ${onboarded}, updated_at = now()
      where user_id = ${userId}
    `;
  }

  return { books: mappedBooks, accounts: mappedAccs, activeBookId, onboarded };
}

async function insertTx(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  tx: Transaction,
) {
  await sql`
    insert into ledger_transactions (
      id, user_id, type, amount, currency, category_id, note, merchant, date, method, created_at,
      book_id, account_id, counterparty_id, amount_to, rate_ars, rate_locked, recurring_id, card_period,
      purchase_id, installment_no, installment_count
    ) values (
      ${tx.id}, ${userId}, ${tx.type}, ${tx.amount}, ${tx.currency}, ${tx.categoryId},
      ${tx.note}, ${tx.merchant}, ${tx.date}, ${tx.method}, ${tx.createdAt},
      ${tx.bookId}, ${tx.accountId}, ${tx.counterpartyId}, ${tx.amountTo}, ${tx.rateArs}, ${tx.rateLocked}, ${tx.recurringId}, ${tx.cardPeriod || null},
      ${tx.purchaseId || null}, ${tx.purchaseId ? tx.installmentNo : null}, ${tx.purchaseId ? tx.installmentCount : null}
    )
    on conflict (id) do update set
      type = excluded.type,
      amount = excluded.amount,
      currency = excluded.currency,
      category_id = excluded.category_id,
      note = excluded.note,
      merchant = excluded.merchant,
      date = excluded.date,
      method = excluded.method,
      book_id = excluded.book_id,
      account_id = excluded.account_id,
      counterparty_id = excluded.counterparty_id,
      amount_to = excluded.amount_to,
      rate_ars = excluded.rate_ars,
      rate_locked = excluded.rate_locked,
      recurring_id = excluded.recurring_id,
      card_period = excluded.card_period,
      purchase_id = excluded.purchase_id,
      installment_no = excluded.installment_no,
      installment_count = excluded.installment_count
    where ledger_transactions.user_id = ${userId}
  `;
}

export const loadLedger = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LedgerSnapshot> => readLedger(await getSql(), context.userId));

/** The whole ledger of a user, as the app loads it. Also used by the alert mails cron. */
export async function readLedger(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<LedgerSnapshot> {
    const context = { userId };
    const settings = await ensureSettings(sql, context.userId);
    const rows = await sql<TxRow>`
      select id, type, amount, currency, category_id, note, merchant,
             date::text as date, method, created_at::text as created_at,
             coalesce(book_id, '') as book_id, coalesce(account_id, '') as account_id,
             coalesce(counterparty_id, '') as counterparty_id,
             coalesce(amount_to, 0) as amount_to, coalesce(rate_ars, 0) as rate_ars,
             coalesce(rate_locked, false) as rate_locked,
             coalesce(recurring_id, '') as recurring_id,
             coalesce(card_period, '') as card_period,
             coalesce(purchase_id, '') as purchase_id,
             coalesce(installment_no, 0) as installment_no,
             coalesce(installment_count, 0) as installment_count
      from ledger_transactions
      where user_id = ${context.userId}
      order by date desc, created_at desc
    `;
    const transactions = rows.map(rowToTx);
    const books = await ensureBooks(sql, context.userId, transactions, settings);
    const recRows = await sql<{
      id: string;
      book_id: string;
      type: string;
      name: string;
      amount: number;
      currency: string;
      category_id: string;
      account_id: string;
      method: string;
      day: number;
      note: string;
      active: boolean | number;
    }>`
      select id, book_id, type, name, amount, currency, category_id, account_id, method, day, note, active
      from ledger_recurring
      where user_id = ${context.userId}
      order by day, name
    `;
    const recurrings: Recurring[] = recRows.map((r) => ({
      id: r.id,
      bookId: r.book_id,
      type: r.type === "income" ? "income" : "expense",
      name: r.name,
      amount: Number(r.amount),
      currency: r.currency as Currency,
      categoryId: r.category_id,
      accountId: r.account_id,
      method: r.method as PayMethod,
      day: Number(r.day),
      note: r.note ?? "",
      active: Boolean(r.active),
    }));
    const cards = await loadCards(sql, context.userId);
    const purchases = await loadPurchases(sql, context.userId);
    const statements = await loadStatements(sql, context.userId);
    const money = hydrateBookMoney({
      books: books.books,
      legacyBudgets: settings.budgets,
      legacyGlobal: settings.globalBudget,
      bookBudgets: settings.bookBudgets,
      bookGlobals: settings.bookGlobals,
    });
    const scoped = moneyForBook(books.activeBookId, money.bookBudgets, money.bookGlobals);
    const budgetLocks = locksForBook(books.activeBookId, settings.bookBudgetLocks);
    return {
      transactions,
      ...settings,
      ...books,
      ...money,
      ...scoped,
      budgetLocks,
      recurrings,
      cards,
      purchases,
      statements,
    };
}

export const saveTransaction = createServerFn({ method: "POST" })
  .validator((input: Transaction) => asTx(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await insertTx(sql, context.userId, data);
    return { ok: true as const };
  });

export const patchTransaction = createServerFn({ method: "POST" })
  .validator((input: { id: string; patch: Partial<Transaction> }) => {
    if (!input?.id) throw new Error("Movimiento inválido");
    return input;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<TxRow>`
      select id, type, amount, currency, category_id, note, merchant,
             date::text as date, method, created_at::text as created_at,
             coalesce(book_id, '') as book_id, coalesce(account_id, '') as account_id,
             coalesce(counterparty_id, '') as counterparty_id,
             coalesce(amount_to, 0) as amount_to, coalesce(rate_ars, 0) as rate_ars,
             coalesce(rate_locked, false) as rate_locked,
             coalesce(recurring_id, '') as recurring_id,
             coalesce(card_period, '') as card_period,
             coalesce(purchase_id, '') as purchase_id,
             coalesce(installment_no, 0) as installment_no,
             coalesce(installment_count, 0) as installment_count
      from ledger_transactions
      where id = ${data.id} and user_id = ${context.userId}
      limit 1
    `;
    if (!rows[0]) throw new Error("No encontré el movimiento");
    const next = asTx({ ...rowToTx(rows[0]), ...data.patch, id: data.id });
    await insertTx(sql, context.userId, next);
    return { ok: true as const };
  });

export const removeTransaction = createServerFn({ method: "POST" })
  .validator((id: string) => {
    if (!id) throw new Error("Movimiento inválido");
    return id;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`delete from ledger_transactions where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .validator((input: {
    budgets: Record<string, number>;
    globalBudget: number;
    usdRate: number;
    usdtRate: number;
    usdSource: UsdSource;
    activeBookId?: string;
    onboarded?: boolean;
    categoryNames?: Record<string, string>;
    hiddenCategoryIds?: string[];
    customCategories?: Category[];
    bookBudgets?: Record<string, Record<string, number>>;
    bookGlobals?: Record<string, number>;
    bookBudgetLocks?: Record<string, Record<string, boolean>>;
    chatThreads?: ChatThread[];
    goals?: Goal[];
  }) => {
    const globalBudget = Number(input.globalBudget);
    const usdRate = Number(input.usdRate);
    const usdtRate = Number(input.usdtRate);
    if (!Number.isFinite(globalBudget) || globalBudget < 0) throw new Error("Presupuesto inválido");
    if (!Number.isFinite(usdRate) || usdRate <= 0) throw new Error("Tipo de cambio inválido");
    if (!Number.isFinite(usdtRate) || usdtRate <= 0) throw new Error("Cotización USDT inválida");
    const usdSource = isUsdSource(input.usdSource) ? input.usdSource : DEFAULT_USD_SOURCE;
    const budgets: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.budgets ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) budgets[k] = n;
    }
    const categoryNames: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.categoryNames ?? {})) {
      if (k && typeof v === "string") categoryNames[k] = v.slice(0, 40);
    }
    return {
      budgets,
      globalBudget,
      usdRate,
      usdtRate,
      usdSource,
      activeBookId: String(input.activeBookId ?? ""),
      onboarded: Boolean(input.onboarded),
      categoryNames,
      hiddenCategoryIds: parseHiddenIds(input.hiddenCategoryIds),
      customCategories: parseCustomCategories(input.customCategories),
      bookBudgets: parseBookBudgets(input.bookBudgets),
      bookGlobals: parseBookGlobals(input.bookGlobals),
      bookBudgetLocks: parseBookLocks(input.bookBudgetLocks),
      chatThreads: parseChatThreads(input.chatThreads),
      goals: parseGoals(input.goals),
    };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into ledger_settings (user_id, budgets, global_budget, usd_rate, usdt_rate, usd_source, active_book_id, onboarded, category_names, hidden_category_ids, custom_categories, book_budgets, book_globals, book_budget_locks, chat_threads, goals)
      values (${context.userId}, ${JSON.stringify(data.budgets)}::jsonb, ${data.globalBudget}, ${data.usdRate}, ${data.usdtRate}, ${data.usdSource}, ${data.activeBookId}, ${data.onboarded}, ${JSON.stringify(data.categoryNames)}::jsonb, ${JSON.stringify(data.hiddenCategoryIds)}::jsonb, ${JSON.stringify(data.customCategories)}::jsonb, ${JSON.stringify(data.bookBudgets)}::jsonb, ${JSON.stringify(data.bookGlobals)}::jsonb, ${JSON.stringify(data.bookBudgetLocks)}::jsonb, ${JSON.stringify(data.chatThreads)}::jsonb, ${JSON.stringify(data.goals)}::jsonb)
      on conflict (user_id) do update set
        budgets = excluded.budgets,
        global_budget = excluded.global_budget,
        usd_rate = excluded.usd_rate,
        usdt_rate = excluded.usdt_rate,
        usd_source = excluded.usd_source,
        active_book_id = excluded.active_book_id,
        onboarded = excluded.onboarded,
        category_names = excluded.category_names,
        hidden_category_ids = excluded.hidden_category_ids,
        custom_categories = excluded.custom_categories,
        book_budgets = excluded.book_budgets,
        book_globals = excluded.book_globals,
        book_budget_locks = excluded.book_budget_locks,
        chat_threads = excluded.chat_threads,
        goals = excluded.goals,
        updated_at = now()
    `;
    return { ok: true as const };
  });

export const saveAccounts = createServerFn({ method: "POST" })
  .validator((input: { accounts: { id: string; opening: number }[] }) => {
    if (!input?.accounts) throw new Error("Cajas inválidas");
    return {
      accounts: input.accounts.map((a) => ({
        id: String(a.id),
        opening: Number.isFinite(Number(a.opening)) ? Number(a.opening) : 0,
      })),
    };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    for (const a of data.accounts) {
      await sql`
        update ledger_accounts set opening = ${a.opening}
        where id = ${a.id} and user_id = ${context.userId}
      `;
    }
    return { ok: true as const };
  });

export const replaceTransactions = createServerFn({ method: "POST" })
  .validator((input: Transaction[]) => (Array.isArray(input) ? input.map(asTx) : []))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    // One transaction: a restore that fails halfway must not leave the
    // ledger empty or half-loaded.
    await withTransaction(async (sql) => {
      await sql`delete from ledger_transactions where user_id = ${context.userId}`;
      for (const tx of data) {
        await insertTx(sql, context.userId, tx);
      }
    });
    return { ok: true as const, count: data.length };
  });

function asRecurring(input: Recurring): Recurring {
  if (!input?.id) throw new Error("Fijo inválido");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Monto inválido");
  // 29–31 are fine: months that are shorter use their last day (dueDate).
  const day = Math.min(31, Math.max(1, Math.round(Number(input.day) || 1)));
  if (!CURRENCIES.has(input.currency)) throw new Error("Moneda inválida");
  if (!METHODS.has(input.method)) throw new Error("Medio inválido");
  return {
    id: input.id,
    bookId: String(input.bookId ?? ""),
    type: input.type === "income" ? "income" : "expense",
    name: String(input.name ?? "").slice(0, 80) || "Fijo",
    amount,
    currency: input.currency,
    categoryId: String(input.categoryId ?? "otros"),
    accountId: String(input.accountId ?? ""),
    method: input.method,
    day,
    note: String(input.note ?? "").slice(0, 200),
    active: input.active !== false,
  };
}

async function upsertRecurringRow(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  data: Recurring,
) {
  await sql`
    insert into ledger_recurring (
      id, user_id, book_id, type, name, amount, currency, category_id, account_id, method, day, note, active
    ) values (
      ${data.id}, ${userId}, ${data.bookId}, ${data.type}, ${data.name}, ${data.amount},
      ${data.currency}, ${data.categoryId}, ${data.accountId}, ${data.method}, ${data.day}, ${data.note}, ${data.active}
    )
    on conflict (id) do update set
      book_id = excluded.book_id,
      type = excluded.type,
      name = excluded.name,
      amount = excluded.amount,
      currency = excluded.currency,
      category_id = excluded.category_id,
      account_id = excluded.account_id,
      method = excluded.method,
      day = excluded.day,
      note = excluded.note,
      active = excluded.active
    where ledger_recurring.user_id = ${userId}
  `;
}

export const saveRecurring = createServerFn({ method: "POST" })
  .validator((input: Recurring) => asRecurring(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await upsertRecurringRow(sql, context.userId, data);
    return { ok: true as const };
  });

export const replaceRecurrings = createServerFn({ method: "POST" })
  .validator((input: Recurring[]) => (Array.isArray(input) ? input.map(asRecurring) : []))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await withTransaction(async (sql) => {
      for (const row of data) {
        await upsertRecurringRow(sql, context.userId, row);
      }
    });
    return { ok: true as const, count: data.length };
  });

export const removeRecurring = createServerFn({ method: "POST" })
  .validator((id: string) => {
    if (!id) throw new Error("Fijo inválido");
    return id;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`delete from ledger_recurring where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

const NETWORKS = new Set<CardNetwork>(["visa", "master", "amex", "cabal", "naranja", "otra"]);

function money0(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function asCard(input: Card): Card {
  if (!input?.id || typeof input.id !== "string") throw new Error("Tarjeta inválida");
  if (!input.bookId) throw new Error("Tarjeta sin libro");
  if (!input.accountArsId || !input.accountUsdId || input.accountArsId === input.accountUsdId) {
    throw new Error("Tarjeta sin cajas");
  }
  const name = String(input.name ?? "").trim().slice(0, 60);
  if (name.length < 2) throw new Error("Poné un nombre para la tarjeta");
  const pct = Number(input.usdPerceptionPct);
  const tna = Number(input.tna);
  return {
    id: input.id,
    bookId: String(input.bookId),
    name,
    bank: String(input.bank ?? "").trim().slice(0, 60),
    network: NETWORKS.has(input.network) ? input.network : "otra",
    last4: validLast4(input.last4),
    closingDay: clampDay(input.closingDay),
    dueDay: clampDay(input.dueDay),
    limitArs: money0(input.limitArs),
    accountArsId: String(input.accountArsId),
    accountUsdId: String(input.accountUsdId),
    payAccountId: String(input.payAccountId ?? ""),
    usdPerceptionPct: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 30,
    tna: Number.isFinite(tna) && tna > 0 && tna <= 1000 ? Math.round(tna * 100) / 100 : 0,
    archived: Boolean(input.archived),
  };
}

type CardRow = {
  id: string;
  book_id: string;
  name: string;
  bank: string;
  network: string;
  last4: string;
  closing_day: number;
  due_day: number;
  limit_ars: number;
  account_ars_id: string;
  account_usd_id: string;
  pay_account_id: string;
  usd_perception_pct: number;
  tna: number | null;
  archived: boolean | number;
};

async function loadCards(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<Card[]> {
  const rows = await sql<CardRow>`
    select id, book_id, name, bank, network, last4, closing_day, due_day, limit_ars,
           account_ars_id, account_usd_id, pay_account_id, usd_perception_pct, tna, archived
    from ledger_cards
    where user_id = ${userId}
    order by created_at
  `;
  return rows.map((r) => ({
    id: r.id,
    bookId: r.book_id,
    name: r.name,
    bank: r.bank ?? "",
    network: NETWORKS.has(r.network as CardNetwork) ? (r.network as CardNetwork) : "otra",
    last4: r.last4 ?? "",
    closingDay: Number(r.closing_day),
    dueDay: Number(r.due_day),
    limitArs: Number(r.limit_ars) || 0,
    accountArsId: r.account_ars_id,
    accountUsdId: r.account_usd_id,
    payAccountId: r.pay_account_id ?? "",
    usdPerceptionPct: Number(r.usd_perception_pct),
    tna: Number(r.tna) || 0,
    archived: Boolean(r.archived),
  }));
}

/**
 * Create or update cards with their two cajas, in one transaction. The cajas
 * are always kind 'card' (an existing caja of another kind is never turned
 * into a card), and the book must be the user's.
 */
export const saveCards = createServerFn({ method: "POST" })
  .validator((input: Card[]) => (Array.isArray(input) ? input.slice(0, 50).map(asCard) : []))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await withTransaction(async (sql) => {
      for (const c of data) {
        const book = await sql<{ id: string }>`
          select id from ledger_books where id = ${c.bookId} and user_id = ${context.userId} limit 1
        `;
        if (!book[0]) throw new Error("Libro inválido");
        const names = cardAccountNames(c.name);
        for (const [id, currency, name] of [
          [c.accountArsId, "ARS", names.ars],
          [c.accountUsdId, "USD", names.usd],
        ] as const) {
          const taken = await sql<{ kind: string; user_id: string }>`
            select kind, user_id from ledger_accounts where id = ${id} limit 1
          `;
          if (taken[0] && (taken[0].kind !== "card" || taken[0].user_id !== context.userId)) {
            throw new Error("Caja inválida");
          }
          await sql`
            insert into ledger_accounts (id, user_id, book_id, name, kind, currency, opening, archived)
            values (${id}, ${context.userId}, ${c.bookId}, ${name}, 'card', ${currency}, 0, ${c.archived})
            on conflict (id) do update set
              name = excluded.name,
              archived = excluded.archived
            where ledger_accounts.user_id = ${context.userId} and ledger_accounts.kind = 'card'
          `;
        }
        await sql`
          insert into ledger_cards (
            id, user_id, book_id, name, bank, network, last4, closing_day, due_day, limit_ars,
            account_ars_id, account_usd_id, pay_account_id, usd_perception_pct, tna, archived
          ) values (
            ${c.id}, ${context.userId}, ${c.bookId}, ${c.name}, ${c.bank}, ${c.network}, ${c.last4},
            ${c.closingDay}, ${c.dueDay}, ${c.limitArs}, ${c.accountArsId}, ${c.accountUsdId},
            ${c.payAccountId}, ${c.usdPerceptionPct}, ${c.tna}, ${c.archived}
          )
          on conflict (id) do update set
            name = excluded.name,
            bank = excluded.bank,
            network = excluded.network,
            last4 = excluded.last4,
            closing_day = excluded.closing_day,
            due_day = excluded.due_day,
            limit_ars = excluded.limit_ars,
            pay_account_id = excluded.pay_account_id,
            usd_perception_pct = excluded.usd_perception_pct,
            tna = excluded.tna,
            archived = excluded.archived
          where ledger_cards.user_id = ${context.userId}
        `;
      }
    });
    return { ok: true as const, count: data.length };
  });

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BACKUP_KEEP_DAYS = 30;

function asPurchase(input: CardPurchase): CardPurchase {
  if (!input?.id || typeof input.id !== "string" || input.id.length > 80) throw new Error("Compra inválida");
  if (!input.cardId) throw new Error("Compra sin tarjeta");
  if (!DAY_RE.test(String(input.date ?? ""))) throw new Error("Fecha inválida");
  const installments = Math.round(Number(input.installments));
  if (!(installments >= 1 && installments <= MAX_INSTALLMENTS)) throw new Error("Cuotas inválidas");
  const paidBefore = Math.round(Number(input.paidBefore ?? 0));
  if (!(paidBefore >= 0 && paidBefore < installments)) throw new Error("Cuotas pagas inválidas");
  const interestFree = input.interestFree !== false;
  const total = Number(input.total);
  const each = Number(input.installmentAmount);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(each) || each <= 0) throw new Error("Monto inválido");
  return {
    id: input.id,
    bookId: String(input.bookId ?? ""),
    cardId: String(input.cardId),
    date: input.date,
    merchant: String(input.merchant ?? "").slice(0, 120),
    categoryId: String(input.categoryId ?? "otros").slice(0, 60),
    currency: input.currency === "USD" ? "USD" : "ARS",
    installments,
    installmentAmount: Math.round(each * 100) / 100,
    total: Math.round(total * 100) / 100,
    interestFree,
    cashPrice: money0(input.cashPrice),
    paidBefore,
    note: String(input.note ?? "").slice(0, 200),
  };
}

type PurchaseRow = {
  id: string;
  book_id: string;
  card_id: string;
  date: string;
  merchant: string;
  category_id: string;
  currency: string;
  installments: number;
  installment_amount: number;
  total: number;
  interest_free: boolean | number;
  cash_price: number;
  paid_before: number;
  note: string;
};

async function loadPurchases(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<CardPurchase[]> {
  const rows = await sql<PurchaseRow>`
    select id, book_id, card_id, date::text as date, merchant, category_id, currency, installments,
           installment_amount, total, interest_free, cash_price, paid_before, note
    from ledger_card_purchases
    where user_id = ${userId}
    order by date desc, created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    bookId: r.book_id,
    cardId: r.card_id,
    date: String(r.date).slice(0, 10),
    merchant: r.merchant ?? "",
    categoryId: r.category_id,
    currency: r.currency === "USD" ? "USD" : "ARS",
    installments: Number(r.installments),
    installmentAmount: Number(r.installment_amount),
    total: Number(r.total),
    interestFree: Boolean(r.interest_free),
    cashPrice: Number(r.cash_price) || 0,
    paidBefore: Number(r.paid_before) || 0,
    note: r.note ?? "",
  }));
}

/** Create or update purchases in cuotas. The card must be the user's; the book comes from the card. */
export const savePurchases = createServerFn({ method: "POST" })
  .validator((input: CardPurchase[]) => (Array.isArray(input) ? input.slice(0, 100).map(asPurchase) : []))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await withTransaction(async (sql) => {
      for (const p of data) {
        const card = await sql<{ book_id: string }>`
          select book_id from ledger_cards where id = ${p.cardId} and user_id = ${context.userId} limit 1
        `;
        if (!card[0]) throw new Error("Tarjeta inválida");
        await sql`
          insert into ledger_card_purchases (
            id, user_id, book_id, card_id, date, merchant, category_id, currency, installments,
            installment_amount, total, interest_free, cash_price, paid_before, note
          ) values (
            ${p.id}, ${context.userId}, ${card[0].book_id}, ${p.cardId}, ${p.date}, ${p.merchant}, ${p.categoryId},
            ${p.currency}, ${p.installments}, ${p.installmentAmount}, ${p.total}, ${p.interestFree},
            ${p.cashPrice}, ${p.paidBefore}, ${p.note}
          )
          on conflict (id) do update set
            card_id = excluded.card_id,
            book_id = excluded.book_id,
            date = excluded.date,
            merchant = excluded.merchant,
            category_id = excluded.category_id,
            currency = excluded.currency,
            installments = excluded.installments,
            installment_amount = excluded.installment_amount,
            total = excluded.total,
            interest_free = excluded.interest_free,
            cash_price = excluded.cash_price,
            paid_before = excluded.paid_before,
            note = excluded.note
          where ledger_card_purchases.user_id = ${context.userId}
        `;
      }
    });
    return { ok: true as const, count: data.length };
  });

/** Delete purchases and every cuota they derived, in one transaction. */
export const removePurchases = createServerFn({ method: "POST" })
  .validator((ids: string[]) => (Array.isArray(ids) ? ids.map(String).filter(Boolean).slice(0, 100) : []))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await withTransaction(async (sql) => {
      for (const id of data) {
        await sql`delete from ledger_transactions where user_id = ${context.userId} and purchase_id = ${id}`;
        await sql`delete from ledger_card_purchases where user_id = ${context.userId} and id = ${id}`;
      }
    });
    return { ok: true as const, count: data.length };
  });

// ------------------------------------------------------------ statements

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function asStatement(input: BankStatement): BankStatement {
  if (!input || typeof input.id !== "string" || !input.id || input.id.length > 80) throw new Error("Resumen inválido");
  if (!input.cardId) throw new Error("Resumen sin tarjeta");
  if (!PERIOD_RE.test(String(input.period ?? ""))) throw new Error("Período inválido");
  if (!DAY_RE.test(String(input.closingDate ?? "")) || !DAY_RE.test(String(input.dueDate ?? ""))) {
    throw new Error("Fechas inválidas");
  }
  const opt = (v: unknown) => (DAY_RE.test(String(v ?? "")) ? String(v) : "");
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && Math.abs(n) < 1e12 ? Math.round(n * 100) / 100 : 0;
  };
  return {
    id: input.id,
    bookId: String(input.bookId ?? ""),
    cardId: String(input.cardId).slice(0, 80),
    period: input.period,
    closingDate: input.closingDate,
    dueDate: input.dueDate,
    nextClosingDate: opt(input.nextClosingDate),
    nextDueDate: opt(input.nextDueDate),
    totalArs: num(input.totalArs),
    totalUsd: num(input.totalUsd),
    minimumArs: num(input.minimumArs),
    chargesArs: num(input.chargesArs),
    importedAt: "",
  };
}

type StatementRow = {
  id: string;
  book_id: string;
  card_id: string;
  period: string;
  closing_date: string;
  due_date: string;
  next_closing_date: string | null;
  next_due_date: string | null;
  bank_total_ars: number;
  bank_total_usd: number;
  bank_minimum_ars: number;
  charges_ars: number;
  updated_at: string;
};

function rowToStatement(r: StatementRow): BankStatement {
  return {
    id: r.id,
    bookId: r.book_id,
    cardId: r.card_id,
    period: r.period,
    closingDate: String(r.closing_date).slice(0, 10),
    dueDate: String(r.due_date).slice(0, 10),
    nextClosingDate: r.next_closing_date ? String(r.next_closing_date).slice(0, 10) : "",
    nextDueDate: r.next_due_date ? String(r.next_due_date).slice(0, 10) : "",
    totalArs: Number(r.bank_total_ars) || 0,
    totalUsd: Number(r.bank_total_usd) || 0,
    minimumArs: Number(r.bank_minimum_ars) || 0,
    chargesArs: Number(r.charges_ars) || 0,
    importedAt: String(r.updated_at ?? ""),
  };
}

async function loadStatements(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<BankStatement[]> {
  const rows = await sql<StatementRow>`
    select id, book_id, card_id, period, closing_date::text as closing_date, due_date::text as due_date,
           next_closing_date::text as next_closing_date, next_due_date::text as next_due_date, bank_total_ars,
           bank_total_usd, bank_minimum_ars, charges_ars, updated_at::text as updated_at
    from ledger_card_statements
    where user_id = ${userId}
    order by period desc
  `;
  return rows.map(rowToStatement);
}

/**
 * Save what the bank printed on a statement (one per card and period: a new
 * import of the same month replaces it). The card must be the user's.
 */
export const saveStatement = createServerFn({ method: "POST" })
  .validator((input: BankStatement) => asStatement(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<BankStatement> => {
    const sql = await getSql();
    const card = await sql<{ book_id: string }>`
      select book_id from ledger_cards where id = ${data.cardId} and user_id = ${context.userId} limit 1
    `;
    if (!card[0]) throw new Error("Tarjeta inválida");
    const rows = await sql<StatementRow>`
      insert into ledger_card_statements (
        id, user_id, book_id, card_id, period, closing_date, due_date, next_closing_date, next_due_date,
        bank_total_ars, bank_total_usd, bank_minimum_ars, charges_ars
      ) values (
        ${data.id}, ${context.userId}, ${card[0].book_id}, ${data.cardId}, ${data.period}, ${data.closingDate},
        ${data.dueDate}, ${data.nextClosingDate || null}, ${data.nextDueDate || null}, ${data.totalArs},
        ${data.totalUsd}, ${data.minimumArs}, ${data.chargesArs}
      )
      on conflict (user_id, card_id, period) do update set
        closing_date = excluded.closing_date,
        due_date = excluded.due_date,
        next_closing_date = excluded.next_closing_date,
        next_due_date = excluded.next_due_date,
        bank_total_ars = excluded.bank_total_ars,
        bank_total_usd = excluded.bank_total_usd,
        bank_minimum_ars = excluded.bank_minimum_ars,
        charges_ars = excluded.charges_ars,
        updated_at = now()
      returning id, book_id, card_id, period, closing_date::text as closing_date, due_date::text as due_date,
        next_closing_date::text as next_closing_date, next_due_date::text as next_due_date, bank_total_ars,
        bank_total_usd, bank_minimum_ars, charges_ars, updated_at::text as updated_at
    `;
    if (!rows[0]) throw new Error("No pude guardar el resumen");
    return rowToStatement(rows[0]);
  });

export const saveDailyBackup = createServerFn({ method: "POST" })
  .validator((input: { day: string; payloadJson: string }) => {
    if (!DAY_RE.test(input?.day ?? "")) throw new Error("Día inválido");
    if (!input?.payloadJson || input.payloadJson.length > 2_000_000) throw new Error("Respaldo inválido");
    JSON.parse(input.payloadJson);
    return { day: input.day, payloadJson: input.payloadJson };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into ledger_backups (user_id, day, payload)
      values (${context.userId}, ${data.day}::date, ${data.payloadJson}::jsonb)
      on conflict (user_id, day) do update set
        payload = excluded.payload,
        created_at = now()
    `;
    await sql`
      delete from ledger_backups
      where user_id = ${context.userId}
        and day < (${data.day}::date - ${BACKUP_KEEP_DAYS}::int)
    `;
    return { ok: true as const, day: data.day };
  });

export const loadLatestBackup = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ day: string; payload: string; created_at: string }>`
      select day::text as day, payload::text as payload, created_at::text as created_at
      from ledger_backups
      where user_id = ${context.userId}
      order by day desc
      limit 1
    `;
    if (!rows[0]) return { day: "", at: "", payloadJson: "" };
    return {
      day: rows[0].day,
      at: rows[0].created_at,
      payloadJson: rows[0].payload,
    };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Mail inválido");
    return { email };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ email: string }>`
      select email from "user" where id = ${context.userId} limit 1
    `;
    const actual = String(rows[0]?.email ?? "").trim().toLowerCase();
    if (!actual || actual !== data.email) throw new Error("El mail no coincide");
    // Everything goes in one transaction: if any delete fails, nothing is
    // deleted and the user can retry. The goodbye mail goes only after it
    // worked (it used to go first, even when the delete then failed).
    await withTransaction(async (tx) => {
      await tx`delete from ledger_transactions where user_id = ${context.userId}`;
      await tx`delete from ledger_recurring where user_id = ${context.userId}`;
      await tx`delete from ledger_cards where user_id = ${context.userId}`;
      await tx`delete from ledger_card_purchases where user_id = ${context.userId}`;
      await tx`delete from ledger_card_statements where user_id = ${context.userId}`;
      await tx`delete from ledger_accounts where user_id = ${context.userId}`;
      await tx`delete from ledger_books where user_id = ${context.userId}`;
      await tx`delete from ledger_settings where user_id = ${context.userId}`;
      await tx`delete from ledger_backups where user_id = ${context.userId}`;
      await tx`delete from alert_mail_prefs where user_id = ${context.userId}`;
      await tx`delete from alert_mail_sent where user_id = ${context.userId}`;
      await tx`delete from "session" where "userId" = ${context.userId}`;
      await tx`delete from "account" where "userId" = ${context.userId}`;
      await tx`delete from "verification" where "identifier" = ${actual}`;
      await tx`delete from "user" where "id" = ${context.userId}`;
    });
    await sendMailQuiet({ to: actual, ...MAIL.deleted });
    return { ok: true as const };
  });
