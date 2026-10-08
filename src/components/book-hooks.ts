import { useLedger } from "@/lib/store";

/** Which book (personal / business) is open. Own file so book-mode.tsx only exports components. */
export function useActiveBook() {
  const books = useLedger((s) => s.books);
  const activeBookId = useLedger((s) => s.activeBookId);
  return books.find((b) => b.id === activeBookId) ?? books[0] ?? null;
}

export function useBusinessBook() {
  return useLedger((s) => s.books.find((b) => b.kind === "business") ?? null);
}

export function usePersonalBook() {
  return useLedger((s) => s.books.find((b) => b.kind === "personal") ?? null);
}
