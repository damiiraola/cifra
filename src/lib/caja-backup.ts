import type { Account, Book } from "./types";

const KEY = "cifra.caja-backup";

export type CajaBackupRow = {
  bookName: string;
  accountName: string;
  currency: string;
  opening: number;
};

type CajaBackup = {
  email: string;
  openings: CajaBackupRow[];
};

export function writeCajaBackup(email: string | null | undefined, books: Book[], accounts: Account[]) {
  const mail = email?.trim().toLowerCase();
  if (typeof window === "undefined" || !mail) return;
  const openings = accounts
    .map((a) => ({
      bookName: books.find((b) => b.id === a.bookId)?.name ?? "",
      accountName: a.name,
      currency: a.currency,
      opening: a.opening,
    }))
    .filter((r) => r.bookName && r.opening);
  try {
    localStorage.setItem(KEY, JSON.stringify({ email: mail, openings } satisfies CajaBackup));
  } catch {
    /* ignore */
  }
}

export function readCajaBackup(email: string | null | undefined): CajaBackupRow[] {
  const mail = email?.trim().toLowerCase();
  if (typeof window === "undefined" || !mail) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CajaBackup;
    if (parsed.email !== mail || !Array.isArray(parsed.openings)) return [];
    return parsed.openings.filter((r) => r && r.opening);
  } catch {
    return [];
  }
}

export function applyCajaBackup(books: Book[], accounts: Account[], rows: CajaBackupRow[]): Account[] | null {
  if (!rows.length) return null;
  if (accounts.some((a) => a.opening)) return null;
  let hit = false;
  const next = accounts.map((a) => {
    const bookName = books.find((b) => b.id === a.bookId)?.name ?? "";
    const row = rows.find((r) => r.bookName === bookName && r.accountName === a.name && r.currency === a.currency);
    if (!row) return a;
    hit = true;
    return { ...a, opening: row.opening };
  });
  return hit ? next : null;
}
