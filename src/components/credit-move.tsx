import { useMemo, useState } from "react";
import { toast } from "sonner";
import { accountLabel } from "@/lib/books";
import { planCreditMove } from "@/lib/card-pay";
import { money } from "@/lib/format";
import { argentinaDay } from "@/lib/market-hours";
import { useBookStatements, useLedger } from "@/lib/store";
import type { Card } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function both(ars: number, usd: number) {
  if (ars > 0 && usd > 0) return `${money(ars, "ARS")} + ${money(usd, "USD")}`;
  return usd > 0 ? money(usd, "USD") : money(ars, "ARS");
}

/**
 * Ajustes → Tarjetas: move expenses loaded with "Crédito" on a normal caja
 * (before the card existed in Cifra) to the card, with a preview of how
 * balances change. Never runs on its own.
 */
export function CreditMove({ card, onDone }: { card: Card; onDone: () => void }) {
  const txs = useLedger((s) => s.transactions);
  const accounts = useLedger((s) => s.accounts);
  const updateTx = useLedger((s) => s.updateTx);
  const addTx = useLedger((s) => s.addTx);
  const statements = useBookStatements();
  const today = argentinaDay();
  const first = useMemo(() => {
    const all = planCreditMove(card, txs, accounts, "0000-01-01", today, statements);
    const dates = txs.filter((t) => all.moves.some((m) => m.id === t.id)).map((t) => t.date).sort();
    return dates[0] ?? today;
  }, [card, txs, accounts, statements, today]);
  const [from, setFrom] = useState(first);
  const [settle, setSettle] = useState(true);
  const plan = useMemo(() => planCreditMove(card, txs, accounts, from || first, today, statements), [card, txs, accounts, from, first, today, statements]);
  const name = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? accountLabel(a) : "otra caja";
  };
  const risesIfSettled = plan.pendingArs > 0 || plan.pendingUsd > 0;

  function apply() {
    if (!plan.count) return toast.error("No hay gastos con Crédito desde esa fecha");
    for (const m of plan.moves) updateTx(m.id, { accountId: m.accountId, cardPeriod: m.cardPeriod }, { force: true });
    if (settle) for (const p of plan.settle) addTx(p);
    toast.success(`Pasé ${plan.count} ${plan.count === 1 ? "gasto" : "gastos"} a ${card.name}`, {
      description: settle && plan.settle.length ? `Y registré ${plan.settle.length} ${plan.settle.length === 1 ? "pago" : "pagos"} de resúmenes vencidos.` : undefined,
    });
    onDone();
  }

  return (
    <div className="mt-3 grid gap-3 rounded-xl bg-surface p-3" aria-label="Pasar gastos con Crédito a la tarjeta">
      <p className="text-sm font-medium">Pasar mis gastos con Crédito a {card.name}</p>
      <p className="text-xs text-subtle">
        Son gastos que cargaste con Crédito antes de tener la tarjeta en Cifra, y quedaron en otra caja. No se pasan solos
        porque cambian saldos que quizás ya cuadraste.
      </p>
      <div>
        <Label htmlFor={`cm-from-${card.id}`}>Desde</Label>
        <Input id={`cm-from-${card.id}`} type="date" className="mt-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="text-xs text-muted tabular-nums" role="status">
        {plan.count ? (
          <>
            <p>
              {plan.count} {plan.count === 1 ? "gasto" : "gastos"} por {both(plan.ars, plan.usd)}. Cada uno va al resumen que le
              toca según su fecha.
            </p>
            <ul className="mt-1 grid gap-0.5">
              {plan.bySource.map((s) => (
                <li key={`${s.accountId}-${s.currency}`}>
                  Salían de {name(s.accountId)}: {money(s.amount, s.currency)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>No hay gastos con Crédito desde esa fecha.</p>
        )}
      </div>
      {plan.count ? (
        <>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={settle} onChange={(e) => setSettle(e.target.checked)} />
            <span>
              Los resúmenes vencidos ya los pagué
              <span className="block text-xs text-subtle">
                Registro esos pagos desde la misma caja, con la fecha de vencimiento, así tus saldos quedan como estaban.
              </span>
            </span>
          </label>
          <p className="text-xs text-muted tabular-nums">
            {settle
              ? risesIfSettled
                ? `Lo de resúmenes que todavía no vencieron (${both(plan.pendingArs, plan.pendingUsd)}) pasa a deuda de la tarjeta: esa plata vuelve a tu caja hasta que pagues el resumen.`
                : "Tus saldos no cambian: solo se ordena qué compraste con la tarjeta."
              : `Tus cajas suben ${both(plan.ars, plan.usd)} y la tarjeta pasa a deber eso mismo, hasta que registres los pagos.`}
          </p>
        </>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="button" className="flex-1" disabled={!plan.count} onClick={apply}>
          {plan.count ? `Pasar ${plan.count}` : "Pasar"}
        </Button>
      </div>
    </div>
  );
}
