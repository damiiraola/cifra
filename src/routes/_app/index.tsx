import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import { computeMonth, pickDiaryDay, toARS } from "@/lib/analytics";
import { dayLabel, moneyARS } from "@/lib/format";
import { isPosted } from "@/lib/recurring";
import { useAllCategories, useBookTxs, useLedger } from "@/lib/store";
import { monthISO, shiftMonth, todayISO } from "@/lib/utils";
import { Heatmap } from "@/components/heatmap";
import { MonthSwitcher } from "@/components/month-switcher";
import { TxRow } from "@/components/tx-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FxStrip } from "@/components/fx-strip";
import { WalletStrip } from "@/components/wallet-strip";

export const Route = createFileRoute("/_app/")({
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
    recurrings,
    activeBookId,
  } = useLedger();
  const transactions = useBookTxs();
  const allCats = useAllCategories();
  const fx = { usd: usdRate, usdt: usdtRate };
  const stats = computeMonth(transactions, viewMonth, fx);
  const prevYm = useRef(viewMonth);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (prevYm.current !== viewMonth || !selectedDay || !selectedDay.startsWith(viewMonth)) {
      prevYm.current = viewMonth;
      setSelectedDay(pickDiaryDay(viewMonth, stats.byDay, todayISO()));
    }
    // byDay is derived; only resync when the month changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth]);

  const day =
    selectedDay && selectedDay.startsWith(viewMonth)
      ? selectedDay
      : pickDiaryDay(viewMonth, stats.byDay, todayISO());
  const dayTx = stats.txs
    .filter((t) => t.date === day)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const spent = dayTx.filter((t) => t.type === "expense").reduce((s, t) => s + toARS(t, fx), 0);
  const earned = dayTx.filter((t) => t.type === "income").reduce((s, t) => s + toARS(t, fx), 0);
  const vsAvg = spent - stats.avgDaily;
  const fijosPendientes = recurrings.filter(
    (r) => r.bookId === activeBookId && r.active && !isPosted(r, transactions, viewMonth),
  ).length;

  const query = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    return stats.txs
      .filter((t) => {
        const hay = `${t.merchant} ${t.note} ${allCats.find((c) => c.id === t.categoryId)?.name ?? ""}`.toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [stats.txs, query, allCats]);

  function changeMonth(delta: -1 | 1) {
    const next = shiftMonth(viewMonth, delta);
    if (next > monthISO()) return;
    setViewMonth(next);
  }

  function selectDay(date: string) {
    setSelectedDay(date);
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => {
      document.getElementById("cifra-dia")?.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <MonthSwitcher value={viewMonth} onChange={setViewMonth} />
        <div className="flex items-center gap-2">
          <p className="font-display text-2xl tabular-nums tracking-tight">{moneyARS(stats.spent, true)}</p>
          <button
            type="button"
            aria-label={searching ? "Cerrar búsqueda" : "Buscar en el mes"}
            onClick={() => {
              setSearching((v) => !v);
              setQ("");
            }}
            className="grid size-11 place-items-center rounded-lg text-muted hover:bg-elevated hover:text-fg"
          >
            {searching ? <X className="size-4" /> : <Search className="size-4" />}
          </button>
        </div>
      </div>

      <FxStrip />
      <WalletStrip />

      {fijosPendientes > 0 && !searching ? (
        <Link to="/fijos" className="text-sm text-muted hover:text-fg">
          {fijosPendientes} fijo{fijosPendientes === 1 ? "" : "s"} sin anotar este mes.
        </Link>
      ) : null}

      {searching ? (
        <section>
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Comercio, nota, categoría"
          />
          <p className="mt-3 text-xs text-subtle">
            {query ? `${matches.length} en ${viewMonth}` : "Escribí para filtrar el mes."}
          </p>
          <div className="mt-2">
            {matches.map((tx) => (
              <TxRow key={tx.id} tx={tx} showDate onClick={() => openQuick(tx)} />
            ))}
            {query && matches.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Nada con esa búsqueda.</p>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <Heatmap
            byDay={stats.byDay}
            selected={day}
            viewMonth={viewMonth}
            onSelect={selectDay}
            onLongPress={(date) => openQuick({ date, type: "expense" })}
            onMonthDelta={changeMonth}
          />

          <section id="cifra-dia" className="scroll-mt-24">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted first-letter:uppercase">
                  {dayLabel(day, "EEEE d")}
                  <span className="text-subtle">
                    {" · "}
                    {moneyARS(spent)}
                    {dayTx.length ? ` · ${dayTx.length}` : ""}
                  </span>
                </p>
                <p className="mt-1 text-xs tabular-nums text-subtle">
                  {stats.avgDaily
                    ? vsAvg > 0
                      ? `+${moneyARS(vsAvg)} vs promedio`
                      : `${moneyARS(vsAvg)} vs promedio`
                    : "Sin promedio todavía"}
                  {earned > 0 ? ` · ingresos ${moneyARS(earned)}` : ""}
                </p>
              </div>
              <Button size="sm" onClick={() => openQuick({ date: day, type: "expense" })}>
                <Plus className="size-4" />
                Cargar
              </Button>
            </div>
            <div className="mt-3">
              {dayTx.map((tx) => (
                <TxRow key={tx.id} tx={tx} onClick={() => openQuick(tx)} />
              ))}
              {dayTx.length === 0 ? (
                <button
                  type="button"
                  onClick={() => openQuick({ date: day, type: "expense" })}
                  className="w-full py-10 text-center text-sm text-muted"
                >
                  Nada este día. Tocá para cargar.
                </button>
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}