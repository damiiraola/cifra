import { accountBalance } from "@/lib/books";
import { cardDebt } from "@/lib/card-math";
import { money } from "@/lib/format";
import { useBookAccounts, useBookCards, useBookTxs, useLedger } from "@/lib/store";

/**
 * Cajas with what you have. Cards go apart, at the end, with what you owe:
 * a card's caja never adds to your money.
 */
export function WalletStrip() {
  const accounts = useBookAccounts();
  const cards = useBookCards();
  const txs = useBookTxs();
  const openQuick = useLedger((s) => s.openQuick);

  const cajas = accounts.filter((a) => a.kind !== "card");
  if (cajas.length === 0 && cards.length === 0) return null;

  return (
    <div data-tour="cajas" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {cajas.map((a) => {
        const bal = accountBalance(a, txs);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => openQuick({ type: "expense", accountId: a.id, currency: a.currency })}
            className="min-h-11 min-w-fit shrink-0 rounded-full bg-elevated px-3.5 py-2 text-left"
          >
            <span className="text-[11px] text-muted">{a.name}</span>
            <span className="ml-2 text-sm font-medium tabular-nums text-fg">{money(bal, a.currency, true)}</span>
          </button>
        );
      })}
      {cards.map((c) => {
        const ars = accounts.find((a) => a.id === c.accountArsId);
        const usd = accounts.find((a) => a.id === c.accountUsdId);
        const owesArs = ars ? cardDebt(ars, accountBalance(ars, txs)) : 0;
        const owesUsd = usd ? cardDebt(usd, accountBalance(usd, txs)) : 0;
        const parts = [money(owesArs, "ARS", true)];
        if (owesUsd > 0) parts.push(money(owesUsd, "USD", true));
        return (
          <button
            key={c.id}
            type="button"
            aria-label={`${c.name}: debés ${parts.join(" y ")}. Cargar gasto con esta tarjeta`}
            onClick={() =>
              openQuick({ type: "expense", accountId: c.accountArsId, currency: "ARS", method: "credito" })
            }
            className="min-h-11 min-w-fit shrink-0 rounded-full bg-elevated px-3.5 py-2 text-left shadow-[inset_0_0_0_1px_rgba(244,244,240,0.10)]"
          >
            <span className="text-[11px] text-muted">{c.name} · debés</span>
            <span className="ml-2 text-sm font-medium tabular-nums text-fg">{parts.join(" + ")}</span>
          </button>
        );
      })}
    </div>
  );
}
