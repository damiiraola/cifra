import type { Account, Book, Category, Recurring, Transaction } from "./types";

const KEY = "cifra.local-vault";
const LEGACY_CAJA = "cifra.caja-backup";
const LEGACY_LEDGER = "cifra-ledger-v1";

export type VaultOpening = {
  bookName: string;
  accountName: string;
  currency: string;
  opening: number;
};

export type VaultTx = Transaction & {
  bookName: string;
  accountName: string;
  counterpartyName: string;
};

export type VaultRecurring = Recurring & {
  bookName: string;
  accountName: string;
};

export type LocalVault = {
  v: 1;
  email: string;
  at: number;
  openings: VaultOpening[];
  transactions: VaultTx[];
  recurrings: VaultRecurring[];
  budgets: Record<string, number>;
  globalBudget: number;
  categoryNames: Record<string, string>;
  hiddenCategoryIds: string[];
  customCategories: Category[];
};

function mailOf(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function bookName(books: Book[], id: string) {
  return books.find((b) => b.id === id)?.name ?? "";
}

function accountName(accounts: Account[], id: string) {
  return accounts.find((a) => a.id === id)?.name ?? "";
}

export function buildLocalVault(input: {
  email: string | null | undefined;
  books: Book[];
  accounts: Account[];
  transactions: Transaction[];
  recurrings: Recurring[];
  budgets: Record<string, number>;
  globalBudget: number;
  categoryNames: Record<string, string>;
  hiddenCategoryIds: string[];
  customCategories: Category[];
}): LocalVault | null {
  const email = mailOf(input.email);
  if (!email) return null;
  return {
    v: 1,
    email,
    at: Date.now(),
    openings: input.accounts
      .map((a) => ({
        bookName: bookName(input.books, a.bookId),
        accountName: a.name,
        currency: a.currency,
        opening: a.opening,
      }))
      .filter((r) => r.bookName && r.opening),
    transactions: input.transactions.map((t) => ({
      ...t,
      bookName: bookName(input.books, t.bookId),
      accountName: accountName(input.accounts, t.accountId),
      counterpartyName: accountName(input.accounts, t.counterpartyId),
    })),
    recurrings: input.recurrings.map((r) => ({
      ...r,
      bookName: bookName(input.books, r.bookId),
      accountName: accountName(input.accounts, r.accountId),
    })),
    budgets: input.budgets,
    globalBudget: input.globalBudget,
    categoryNames: input.categoryNames,
    hiddenCategoryIds: input.hiddenCategoryIds,
    customCategories: input.customCategories,
  };
}

export function writeLocalVault(input: Parameters<typeof buildLocalVault>[0]) {
  const vault = buildLocalVault(input);
  if (typeof window === "undefined" || !vault) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(vault));
  } catch {
    /* quota */
  }
}

const AUTO_KEY = "cifra.auto-backup";

export function markAutoBackup(email: string | null | undefined, day: string) {
  const mail = mailOf(email);
  if (typeof window === "undefined" || !mail) return;
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify({ email: mail, day, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function autoBackupHint(email: string | null | undefined): { day: string; at: number } | null {
  const mail = mailOf(email);
  if (typeof window === "undefined" || !mail) return null;
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; day?: string; at?: number };
    if (parsed.email !== mail || !parsed.day) return null;
    return { day: parsed.day, at: Number(parsed.at) || 0 };
  } catch {
    return null;
  }
}

export function asVault(raw: unknown): LocalVault | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<LocalVault>;
  if (p.v !== 1) return null;
  return {
    v: 1,
    email: String(p.email ?? ""),
    at: Number(p.at) || Date.now(),
    openings: Array.isArray(p.openings) ? p.openings : [],
    transactions: Array.isArray(p.transactions) ? p.transactions : [],
    recurrings: Array.isArray(p.recurrings) ? p.recurrings : [],
    budgets: p.budgets && typeof p.budgets === "object" ? p.budgets : {},
    globalBudget: Number(p.globalBudget) || 0,
    categoryNames: p.categoryNames && typeof p.categoryNames === "object" ? p.categoryNames : {},
    hiddenCategoryIds: Array.isArray(p.hiddenCategoryIds) ? p.hiddenCategoryIds : [],
    customCategories: Array.isArray(p.customCategories) ? p.customCategories : [],
  };
}

export function readLocalVault(email: string | null | undefined): LocalVault | null {
  const mail = mailOf(email);
  if (typeof window === "undefined" || !mail) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalVault;
      if (parsed?.v === 1 && parsed.email === mail) return parsed;
    }
  } catch {
    /* ignore */
  }
  return migrateLegacy(mail);
}

function migrateLegacy(mail: string): LocalVault | null {
  try {
    const cajaRaw = localStorage.getItem(LEGACY_CAJA);
    const caja = cajaRaw ? (JSON.parse(cajaRaw) as { email?: string; openings?: VaultOpening[] }) : null;
    const openings = caja?.email === mail ? (caja.openings ?? []) : [];
    let transactions: VaultTx[] = [];
    const ledgerRaw = localStorage.getItem(LEGACY_LEDGER);
    if (ledgerRaw) {
      const parsed = JSON.parse(ledgerRaw) as { state?: { transactions?: Transaction[] }; transactions?: Transaction[] };
      const txs = parsed.state?.transactions ?? parsed.transactions ?? [];
      transactions = txs.map((t) => ({ ...t, bookName: "", accountName: "", counterpartyName: "" }));
    }
    if (!openings.length && !transactions.length) return null;
    return {
      v: 1,
      email: mail,
      at: Date.now(),
      openings,
      transactions,
      recurrings: [],
      budgets: {},
      globalBudget: 0,
      categoryNames: {},
      hiddenCategoryIds: [],
      customCategories: [],
    };
  } catch {
    return null;
  }
}

export function vaultHint(email: string | null | undefined): { at: number; txs: number; cajas: number } | null {
  const v = readLocalVault(email);
  if (!v) return null;
  return { at: v.at, txs: v.transactions.length, cajas: v.openings.length };
}

export function downloadLocalVault(email: string | null | undefined) {
  const v = readLocalVault(email);
  if (!v) return false;
  const blob = new Blob([JSON.stringify(v, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cifra-respaldo-${v.email.replace(/[^a-z0-9]+/gi, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export function clearLocalVault() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_CAJA);
    localStorage.removeItem(LEGACY_LEDGER);
  } catch {
    /* ignore */
  }
}

export function applyOpenings(books: Book[], accounts: Account[], rows: VaultOpening[]): Account[] | null {
  if (!rows.length || accounts.some((a) => a.opening)) return null;
  let hit = false;
  const next = accounts.map((a) => {
    const name = bookName(books, a.bookId);
    const row = rows.find((r) => r.bookName === name && r.accountName === a.name && r.currency === a.currency);
    if (!row) return a;
    hit = true;
    return { ...a, opening: row.opening };
  });
  return hit ? next : null;
}

export function remapVaultTxs(vault: LocalVault, books: Book[], accounts: Account[]): Transaction[] {
  return vault.transactions.map((t) => {
    const book = books.find((b) => b.name === t.bookName) ?? books.find((b) => b.id === t.bookId);
    const bookId = book?.id || t.bookId;
    const account =
      accounts.find((a) => a.bookId === bookId && a.name === t.accountName) ??
      accounts.find((a) => a.id === t.accountId);
    const counter =
      accounts.find((a) => a.bookId === bookId && a.name === t.counterpartyName) ??
      accounts.find((a) => a.id === t.counterpartyId);
    const { bookName: _b, accountName: _a, counterpartyName: _c, ...rest } = t;
    return {
      ...rest,
      bookId,
      accountId: account?.id || t.accountId,
      counterpartyId: counter?.id || t.counterpartyId,
    };
  });
}

export function remapVaultRecurrings(vault: LocalVault, books: Book[], accounts: Account[]): Recurring[] {
  return vault.recurrings.map((r) => {
    const book = books.find((b) => b.name === r.bookName) ?? books.find((b) => b.id === r.bookId);
    const bookId = book?.id || r.bookId;
    const account =
      accounts.find((a) => a.bookId === bookId && a.name === r.accountName) ??
      accounts.find((a) => a.id === r.accountId);
    const { bookName: _b, accountName: _a, ...rest } = r;
    return { ...rest, bookId, accountId: account?.id || r.accountId };
  });
}

function vaultFile(email: string | null | undefined): File | null {
  const v = readLocalVault(email);
  if (!v) return null;
  const day = new Date(v.at).toISOString().slice(0, 10);
  return new File([JSON.stringify(v, null, 2)], `cifra-${day}.json`, {
    type: "application/json",
  });
}

export async function shareVaultToIcloud(email: string | null | undefined): Promise<"shared" | "downloaded" | "empty"> {
  const file = vaultFile(email);
  if (!file) return "empty";
  try {
    const payload = { files: [file], title: "Cifra", text: "Guardalo en iCloud Drive, carpeta Cifra." };
    if (typeof navigator.share === "function" && navigator.canShare?.(payload)) {
      await navigator.share(payload);
      return "shared";
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "shared";
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
