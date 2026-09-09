import { useEffect } from "react";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { captureShortcutSearch, parseShortcutSearch, takeShortcutSearch } from "@/lib/shortcut-intent";
import { useAllCategories, useLedger } from "@/lib/store";
import { todayISO } from "@/lib/utils";

export function ShortcutListener() {
  const status = useLedger((s) => s.status);
  const onboarded = useLedger((s) => s.onboarded);
  const books = useLedger((s) => s.books);
  const accounts = useLedger((s) => s.accounts);
  const setActiveBook = useLedger((s) => s.setActiveBook);
  const openQuick = useLedger((s) => s.openQuick);
  const addTx = useLedger((s) => s.addTx);
  const cats = useAllCategories();

  useEffect(() => {
    captureShortcutSearch();
  }, []);

  useEffect(() => {
    if (status !== "ready" || !onboarded) return;
    const raw = takeShortcutSearch();
    if (!raw) return;
    const intent = parseShortcutSearch(raw, books, accounts, cats);
    if (!intent) return;
    if (intent.bookId) setActiveBook(intent.bookId);
    if (intent.save && intent.draft.amount && intent.draft.type !== "transfer") {
      addTx({
        type: intent.draft.type ?? "expense",
        amount: intent.draft.amount,
        currency: intent.draft.currency ?? "ARS",
        categoryId: intent.draft.categoryId ?? (intent.draft.type === "income" ? "sueldo" : "otros"),
        note: intent.draft.note ?? "",
        merchant: intent.draft.merchant ?? "",
        date: intent.draft.date ?? todayISO(),
        method: intent.draft.method ?? "debito",
        accountId: intent.draft.accountId ?? "",
        bookId: intent.bookId ?? "",
        counterpartyId: "",
        amountTo: 0,
        rateArs: 0,
        rateLocked: false,
        recurringId: "",
      });
      toast.success(`Anoté ${money(intent.draft.amount, intent.draft.currency ?? "ARS", true)}`);
      return;
    }
    if (intent.open) openQuick(intent.draft);
  }, [status, onboarded, books, accounts, cats, addTx, openQuick, setActiveBook]);

  return null;
}
