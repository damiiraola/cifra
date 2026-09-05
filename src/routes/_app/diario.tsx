import { createFileRoute } from "@tanstack/react-router";
import { computeMonth, toARS } from "@/lib/analytics";
import { dayLabel, moneyARS } from "@/lib/format";
import { useLedger, useBookTxs } from "@/lib/store";
import { todayISO } from "@/lib/utils";
import { Heatmap } from "@/components/heatmap";
import { MonthSwitcher } from "@/components/month-switcher";
import { TxRow } from "@/components/tx-row";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/diario")({
  component: Diario,
});

function Diario() {
  const {
    viewMonth,
    setViewMonth,
    usdRate,
    usdtRate,
    selectedDay,
    setSelectedDay,
    openQuick,
  } = useLedger();
  const transactions = useBookTxs();
  const fx = { usd: usdRate, usdt: usdtRate };
  const stats = computeMonth(transactions, viewMonth, fx);
  const day = selectedDay && selectedDay.startsWith(viewMonth) ? selectedDay : todayIn(viewMonth, stats.end);
  const dayTx = stats.txs
    .filter((t) => t.date === day)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const spent = dayTx.filter((t) => t.type === "expense").reduce((s, t) => s + toARS(t, fx), 0);
  const earned = dayTx.filter((t) => t.type === "income").reduce((s, t) => s + toARS(t, fx), 0);
  const vsAvg = spent - stats.avgDaily;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Dato diario</p>
          <h1 className="font-display text-4xl tracking-tight">Diario</h1>
        </div>
        <MonthSwitcher value={viewMonth} onChange={setViewMonth} />
      </div>

      <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        <Heatmap byDay={stats.byDay} selected={day} onSelect={setSelectedDay} />
        <p className="mt-3 text-xs text-subtle">
          Intensidad = gasto del día. Tocá un casillero para ver el detalle.
        </p>
      </section>

      <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Día</p>
            <h2 className="font-display text-3xl tracking-tight first-letter:uppercase">
              {dayLabel(day, "EEEE d 'de' MMMM")}
            </h2>
          </div>
          <Button size="sm" onClick={() => openQuick({ date: day, type: "expense" })}>
            <Plus className="size-4" />
            Cargar
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-elevated p-3">
            <p className="text-[11px] text-muted uppercase">Gastado</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{moneyARS(spent)}</p>
          </div>
          <div className="rounded-2xl bg-elevated p-3">
            <p className="text-[11px] text-muted uppercase">Vs promedio</p>
            <p className="mt-1 font-display text-2xl tabular-nums">
              {vsAvg > 0 ? "+" : ""}
              {moneyARS(vsAvg)}
            </p>
          </div>
        </div>
        {earned > 0 ? (
          <p className="mt-3 text-sm text-income">Ingresos del día {moneyARS(earned)}</p>
        ) : null}
        <div className="mt-3">
          {dayTx.map((tx) => (
            <TxRow key={tx.id} tx={tx} onClick={() => openQuick(tx)} />
          ))}
          {dayTx.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Día en blanco. Cargá el primer movimiento.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function todayIn(ym: string, end: string) {
  const t = todayISO();
  if (t.startsWith(ym)) return t;
  return end;
}
