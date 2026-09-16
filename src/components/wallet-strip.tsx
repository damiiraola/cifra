import { accountBalance } from "@/lib/books";
import { money } from "@/lib/format";
import { useBookAccounts, useBookTxs, useLedger } from "@/lib/store";

export function WalletStrip() {
  const accounts = useBookAccounts();
  const txs = useBookTxs();
  const openQuick = useLedger((s) => s.openQuick);

  if (accounts.length === 0) return null;

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {accounts.map((a) => {
        const bal = accountBalance(a, txs);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => openQuick({ type: "expense", accountId: a.id, currency: a.currency })}
            className="min-w-fit shrink-0 rounded-full bg-elevated px-3 py-2 text-left"
          >
            <span className="text-[11px] text-muted">{a.name}</span>
            <span className="ml-2 text-sm font-medium tabular-nums text-fg">{money(bal, a.currency, true)}</span>
          </button>
        );
      })}
    </div>
  );
}