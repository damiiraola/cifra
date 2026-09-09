import { money, shortDay } from "@/lib/format";
import { CatIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useAllCategories, useLedger } from "@/lib/store";
import type { Transaction } from "@/lib/types";

export function TxRow({
  tx,
  onClick,
  showDate = false,
}: {
  tx: Transaction;
  onClick?: () => void;
  showDate?: boolean;
}) {
  const accounts = useLedger((s) => s.accounts);
  const cats = useAllCategories();
  const cat = cats.find((c) => c.id === tx.categoryId);
  const income = tx.type === "income";
  const transfer = tx.type === "transfer";
  const from = accounts.find((a) => a.id === tx.accountId);
  const to = accounts.find((a) => a.id === tx.counterpartyId);
  const title = transfer
    ? `${from?.name ?? "Caja"} → ${to?.name ?? "Caja"}`
    : tx.merchant || tx.note || cat?.name || "Movimiento";
  const sub = transfer
    ? "Cambio · no es gasto"
    : `${showDate ? `${shortDay(tx.date)} · ` : ""}${cat?.name || ""}${tx.note && tx.merchant ? ` · ${tx.note}` : ""}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-150 hover:bg-elevated"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted"
        style={{ color: `var(--color-${cat?.token ?? "cat-other"})` }}
      >
        <CatIcon name={cat?.icon ?? "ArrowLeftRight"} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      <span
        className={cn(
          "shrink-0 text-sm tabular-nums",
          income ? "text-income" : transfer ? "text-muted" : "text-fg",
        )}
      >
        {transfer ? "↔ " : income ? "+" : "−"}
        {money(tx.amount, tx.currency)}
      </span>
    </button>
  );
}
