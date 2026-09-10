import type { Account, Book, Recurring } from "./types";

export function recurringFingerprint(row: Recurring, bookName = ""): string {
  const book = (bookName || row.bookId).trim().toLowerCase();
  return [
    row.type,
    row.name.trim().toLowerCase(),
    book,
    String(row.day),
    String(row.amount),
    row.currency,
  ].join("|");
}

export function mergeRecurrings(
  remote: Recurring[],
  incoming: Recurring[],
  bookName: (id: string) => string = (id) => id,
): {
  merged: Recurring[];
  added: Recurring[];
} {
  const byId = new Map(remote.map((r) => [r.id, r]));
  const fps = new Set(remote.map((r) => recurringFingerprint(r, bookName(r.bookId))));
  const added: Recurring[] = [];
  for (const row of incoming) {
    if (!row?.id) continue;
    if (byId.has(row.id)) continue;
    const fp = recurringFingerprint(row, bookName(row.bookId));
    if (fps.has(fp)) continue;
    added.push(row);
    byId.set(row.id, row);
    fps.add(fp);
  }
  return { merged: [...remote, ...added], added };
}

export function resolveVaultBook(books: Book[], name: string, id: string): Book | undefined {
  if (!books.length) return undefined;
  const trimmed = (name || "").trim();
  const byName = books.find((b) => b.name === trimmed);
  if (byName) return byName;
  const byId = books.find((b) => b.id === id);
  if (byId) return byId;
  const lower = trimmed.toLowerCase();
  if (lower.includes("negocio") || lower.includes("business")) {
    return books.find((b) => b.kind === "business") ?? books[0];
  }
  return books.find((b) => b.kind === "personal") ?? books[0];
}

export function remapRecurrings(
  rows: (Recurring & { bookName?: string; accountName?: string })[],
  books: Book[],
  accounts: Account[],
): Recurring[] {
  const out: Recurring[] = [];
  for (const r of rows) {
    const book = resolveVaultBook(books, r.bookName ?? "", r.bookId);
    if (!book) continue;
    const mine = accounts.filter((a) => a.bookId === book.id && !a.archived);
    const account =
      mine.find((a) => a.name === r.accountName) ??
      mine.find((a) => a.id === r.accountId) ??
      mine.find((a) => a.kind === "bank") ??
      mine[0];
    if (!account) continue;
    const { bookName: _b, accountName: _a, ...rest } = r;
    out.push({ ...rest, bookId: book.id, accountId: account.id });
  }
  return out;
}
