import { accountBalance, toARSAmount } from "@/lib/books";
import { money, moneyARS } from "@/lib/format";
import { useBookAccounts, useBookTxs, useLedger } from "@/lib/store";

export function WalletStrip() {
  const accounts = useBookAccounts();
  const txs = useBookTxs();
  const { usdRate, usdtRate, openQuick } = useLedger();

  const rows = accounts.map((a) => {
    const bal = accountBalance(a, txs);
    const ars = toARSAmount(Math.abs(bal), a.currency, usdRate, usdtRate);
    return { a, bal, ars: bal < 0 ? -ars : ars };
  });
  const totalArs = rows.reduce((s, r) => s + r.ars, 0);

  if (accounts.length === 0) return null;

  return (
    <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Cajas</p>
          <p className="font-display text-2xl tracking-tight tabular-nums">{moneyARS(totalArs, true)}</p>
        </div>
        <button
          type="button"
          className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
          onClick={() => openQuick({ type: "transfer" })}
        >
          Mover
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(({ a, bal }) => (
          <button
            key={a.id}
            type="button"
            onClick={() => openQuick({ type: "expense", accountId: a.id, currency: a.currency })}
            className="rounded-2xl bg-elevated px-3 py-2.5 text-left"
          >
            <span className="block truncate text-[11px] text-muted">{a.name}</span>
            <span className="mt-0.5 block text-sm font-medium tabular-nums text-fg">{money(bal, a.currency, true)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
