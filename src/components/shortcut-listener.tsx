import { useEffect, useState } from "react";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { shareVaultToIcloud } from "@/lib/local-vault";
import { captureShortcutSearch, parseShortcutSearch, takeShortcutSearch } from "@/lib/shortcut-intent";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useAllCategories, useLedger } from "@/lib/store";
import { todayISO } from "@/lib/utils";

export function ShortcutListener() {
  const user = useCurrentUser();
  const status = useLedger((s) => s.status);
  const onboarded = useLedger((s) => s.onboarded);
  const books = useLedger((s) => s.books);
  const accounts = useLedger((s) => s.accounts);
  const setActiveBook = useLedger((s) => s.setActiveBook);
  const openQuick = useLedger((s) => s.openQuick);
  const addTx = useLedger((s) => s.addTx);
  const cats = useAllCategories();
  const [icloud, setIcloud] = useState(false);

  useEffect(() => {
    captureShortcutSearch();
  }, []);

  useEffect(() => {
    if (status !== "ready" || !onboarded) return;
    const raw = takeShortcutSearch();
    if (!raw) return;
    const intent = parseShortcutSearch(raw, books, accounts, cats);
    if (!intent) return;
    if (intent.icloud) setIcloud(true);
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
      if (!intent.icloud) return;
    }
    if (intent.open) openQuick(intent.draft);
  }, [status, onboarded, books, accounts, cats, addTx, openQuick, setActiveBook]);

  if (!icloud) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-40 px-4 md:bottom-8">
      <button
        type="button"
        className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-medium text-accent-fg shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        onClick={() => {
          void shareVaultToIcloud(user?.primaryEmail).then((r) => {
            if (r === "empty") toast.error("No hay respaldo todavía");
            else if (r === "shared") toast.success("Elegí Guardar en Archivos → iCloud Drive");
            else toast.success("Bajé el JSON. Movelo a iCloud Drive");
            setIcloud(false);
          });
        }}
      >
        Guardar respaldo en iCloud
      </button>
    </div>
  );
}
