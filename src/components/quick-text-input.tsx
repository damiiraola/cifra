import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { quickFromText } from "@/lib/quick-text";
import { useAllCategories, useBookAccounts, useBookCards, useLedger } from "@/lib/store";
import { todayISO } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * "Escribilo": one line → the form below, filled and editable. Read by rules
 * (lib/quick-text), no AI and no cost. Nothing is saved until Registrar.
 */
export function QuickTextInput() {
  const [text, setText] = useState("");
  const accounts = useBookAccounts();
  const cards = useBookCards();
  const cats = useAllCategories();
  const openQuick = useLedger((s) => s.openQuick);
  const parsed = useMemo(
    () =>
      quickFromText(text, {
        accounts,
        cards,
        today: todayISO(),
        categoryName: (id) => cats.find((c) => c.id === id)?.name ?? id,
      }),
    [text, accounts, cards, cats],
  );
  const use = () => {
    if (!parsed) return;
    openQuick({ ...parsed.draft });
    setText("");
  };
  return (
    <div className="mt-4 rounded-xl bg-elevated/60 p-3">
      <label htmlFor="quick-text" className="text-xs font-medium text-muted">
        Escribilo y lo completo
      </label>
      <div className="mt-1.5 flex gap-2">
        <Input
          id="quick-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              use();
            }
          }}
          placeholder="Ej. 15 mil super débito"
          autoComplete="off"
          enterKeyHint="done"
        />
        <button
          type="button"
          disabled={!parsed}
          onClick={use}
          className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
        >
          Usar
        </button>
      </div>
      {text.trim() ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-live="polite">
          {parsed ? (
            <>
              <Sparkles className="size-3.5" aria-hidden />
              {parsed.bits.map((b, i) => (
                <span key={i} className="rounded-full bg-surface px-2 py-0.5 text-fg">
                  {b.label}
                </span>
              ))}
              <span>· revisalo abajo antes de registrar</span>
            </>
          ) : (
            "Poné un monto, por ejemplo «15 mil super débito» o «usd 25 amazon tarjeta visa»."
          )}
        </p>
      ) : null}
    </div>
  );
}
