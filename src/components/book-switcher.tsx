import { cn } from "@/lib/utils";
import { useLedger } from "@/lib/store";

export function BookSwitcher({ compact = false }: { compact?: boolean }) {
  const { books, activeBookId, setActiveBook } = useLedger();
  if (books.length < 2) return null;
  return (
    <div className={cn("grid grid-cols-2 gap-1 rounded-lg bg-elevated p-1", compact ? "w-[11.5rem]" : "w-full")}>
      {books.map((b) => {
        const on = b.id === activeBookId;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => setActiveBook(b.id)}
            className={cn(
              "h-9 rounded-md text-sm font-medium transition-colors duration-150",
              on ? "bg-surface text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.12)]" : "text-muted",
            )}
          >
            {b.name}
          </button>
        );
      })}
    </div>
  );
}
