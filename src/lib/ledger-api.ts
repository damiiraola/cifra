import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { DEFAULT_BUDGETS, DEFAULT_GLOBAL_BUDGET } from "@/lib/categories";
import {
  ACCOUNT_TEMPLATES,
  BOOK_SPECS,
  inferAccount,
} from "@/lib/books";
import { DEFAULT_USD_RATE, DEFAULT_USDT_RATE, DEFAULT_USD_SOURCE, isUsdSource, type UsdSource } from "@/lib/fx";
import type { Account, Book, BookKind, Currency, PayMethod, Recurring, Transaction, TxType } from "@/lib/types";
import { uid } from "@/lib/utils";

export type LedgerSnapshot = {
  transactions: Transaction[];
  books: Book[];
  accounts: Account[];
  budgets: Record<string, number>;
  globalBudget: number;
  usdRate: number;
  usdtRate: number;
  usdSource: UsdSource;
  activeBookId: string;
  onboarded: boolean;
  categoryNames: Record<string, string>;
  recurrings: Recurring[];
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
  };
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
  };
}

const TX_SELECT = `id, type, amount, currency, category_id, note, merchant,
             date::text as date, method, created_at::text as created_at,
             coalesce(book_id, '') as book_id, coalesce(account_id, '') as account_id,
             coalesce(counterparty_id, '') as counterparty_id,
             coalesce(amount_to, 0) as amount_to, coalesce(rate_ars, 0) as rate_ars,
             coalesce(rate_locked, false) as rate_locked,
             coalesce(recurring_id, '') as recurring_id`;

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
  }>`select budgets, global_budget, usd_rate, usdt_rate, usd_source, active_book_id, onboarded, category_names from ledger_settings where user_id = ${userId} limit 1`;
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
      usdRate: Number(existing[0].usd_rate) || DEFAULT_USD_RATE,
      usdtRate: Number(existing[0].usdt_rate) || DEFAULT_USDT_RATE,
      usdSource: isUsdSource(existing[0].usd_source) ? existing[0].usd_source : DEFAULT_USD_SOURCE,
      activeBookId: existing[0].active_book_id ?? "",
      onboarded: Boolean(existing[0].onboarded),
      categoryNames,
    };
  }
  await sql`
    insert into ledger_settings (user_id, budgets, global_budget, usd_rate, usdt_rate, usd_source, onboarded, category_names)
    values (${userId}, ${JSON.stringify(DEFAULT_BUDGETS)}::jsonb, ${DEFAULT_GLOBAL_BUDGET}, ${DEFAULT_USD_RATE}, ${DEFAULT_USDT_RATE}, ${DEFAULT_USD_SOURCE}, false, '{}'::jsonb)
    on conflict (user_id) do nothing
  `;
  return {
    budgets: { ...DEFAULT_BUDGETS },
    globalBudget: DEFAULT_GLOBAL_BUDGET,
    usdRate: DEFAULT_USD_RATE,
    usdtRate: DEFAULT_USDT_RATE,
    usdSource: DEFAULT_USD_SOURCE,
    activeBookId: "",
    onboarded: false,
    categoryNames: {} as Record<string, string>,
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
      book_id, account_id, counterparty_id, amount_to, rate_ars, rate_locked, recurring_id
    ) values (
      ${tx.id}, ${userId}, ${tx.type}, ${tx.amount}, ${tx.currency}, ${tx.categoryId},
      ${tx.note}, ${tx.merchant}, ${tx.date}, ${tx.method}, ${tx.createdAt},
      ${tx.bookId}, ${tx.accountId}, ${tx.counterpartyId}, ${tx.amountTo}, ${tx.rateArs}, ${tx.rateLocked}, ${tx.recurringId}
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
      recurring_id = excluded.recurring_id
    where ledger_transactions.user_id = ${userId}
  `;
}

export const loadLedger = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LedgerSnapshot> => {
    const sql = await getSql();
    const settings = await ensureSettings(sql, context.userId);
    const rows = await sql<TxRow>`
      select id, type, amount, currency, category_id, note, merchant,
             date::text as date, method, created_at::text as created_at,
             coalesce(book_id, '') as book_id, coalesce(account_id, '') as account_id,
             coalesce(counterparty_id, '') as counterparty_id,
             coalesce(amount_to, 0) as amount_to, coalesce(rate_ars, 0) as rate_ars,
             coalesce(rate_locked, false) as rate_locked,
             coalesce(recurring_id, '') as recurring_id
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
    return {
      transactions,
      ...settings,
      ...books,
      recurrings,
    };
  });

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
             coalesce(recurring_id, '') as recurring_id
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
    };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into ledger_settings (user_id, budgets, global_budget, usd_rate, usdt_rate, usd_source, active_book_id, onboarded, category_names)
      values (${context.userId}, ${JSON.stringify(data.budgets)}::jsonb, ${data.globalBudget}, ${data.usdRate}, ${data.usdtRate}, ${data.usdSource}, ${data.activeBookId}, ${data.onboarded}, ${JSON.stringify(data.categoryNames)}::jsonb)
      on conflict (user_id) do update set
        budgets = excluded.budgets,
        global_budget = excluded.global_budget,
        usd_rate = excluded.usd_rate,
        usdt_rate = excluded.usdt_rate,
        usd_source = excluded.usd_source,
        active_book_id = excluded.active_book_id,
        onboarded = excluded.onboarded,
        category_names = excluded.category_names,
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
    const sql = await getSql();
    await sql`delete from ledger_transactions where user_id = ${context.userId}`;
    for (const tx of data) {
      await insertTx(sql, context.userId, tx);
    }
    return { ok: true as const, count: data.length };
  });

function asRecurring(input: Recurring): Recurring {
  if (!input?.id) throw new Error("Fijo inválido");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Monto inválido");
  const day = Math.min(28, Math.max(1, Math.round(Number(input.day) || 1)));
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

export const saveRecurring = createServerFn({ method: "POST" })
  .validator((input: Recurring) => asRecurring(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into ledger_recurring (
        id, user_id, book_id, type, name, amount, currency, category_id, account_id, method, day, note, active
      ) values (
        ${data.id}, ${context.userId}, ${data.bookId}, ${data.type}, ${data.name}, ${data.amount},
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
      where ledger_recurring.user_id = ${context.userId}
    `;
    return { ok: true as const };
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

