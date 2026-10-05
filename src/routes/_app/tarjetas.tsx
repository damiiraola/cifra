import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { accountBalance, accountLabel } from "@/lib/books";
import {
  cardDebt,
  dueDate,
  lastClosedStatement,
  limitUse,
  openStatement,
  purchaseProgress,
  shiftPeriod,
  upcomingStatements,
} from "@/lib/card-math";
import { money, monthLabel } from "@/lib/format";
import { argentinaDay } from "@/lib/market-hours";
import { useBookAccounts, useBookCards, useBookPurchases, useBookTxs, useLedger } from "@/lib/store";
import { CARD_NETWORKS, type Card } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PurchaseForm } from "@/components/purchase-form";

export const Route = createFileRoute("/_app/tarjetas")({
  component: Tarjetas,
});

function dm(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function both(ars: number, usd: number) {
  return usd > 0 ? `${money(ars, "ARS")} + ${money(usd, "USD")}` : money(ars, "ARS");
}

function Tarjetas() {
  const cards = useBookCards();
  const txs = useBookTxs();
  const book = useLedger((s) => s.books.find((b) => b.id === s.activeBookId));
  const today = argentinaDay();

  // Links from a cuota land on #compra-<id>: scroll there.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "center" }), 300);
  }, []);

  const toPay = cards
    .map((c) => ({ card: c, st: lastClosedStatement(c, txs, today) }))
    .filter((x) => (x.st.ars > 0 || x.st.usd > 0) && x.st.due >= today);
  const payArs = toPay.reduce((s, x) => s + x.st.ars, 0);
  const payUsd = toPay.reduce((s, x) => s + x.st.usd, 0);

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Crédito · {book?.name ?? ""}</p>
        <h1 data-tour="titulo" className="font-display text-4xl tracking-tight">Tarjetas</h1>
        {cards.length ? (
          <p className="mt-1 text-sm text-muted">
            {toPay.length
              ? `Próximo a pagar: ${both(payArs, payUsd)} (vence${toPay.length > 1 ? "n" : ""} ${toPay.map((x) => dm(x.st.due)).join(" y ")}).`
              : "No tenés resúmenes cerrados por pagar."}
          </p>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-3xl bg-surface p-5">
          <p className="text-sm">Todavía no cargaste ninguna tarjeta.</p>
          <p className="mt-1 text-sm text-muted">Agregala en Ajustes con su día de cierre y vencimiento.</p>
          <Button asChild className="mt-4">
            <Link to="/ajustes" hash="tarjetas">
              Agregar tarjeta
            </Link>
          </Button>
        </div>
      ) : (
        cards.map((c) => <CardBlock key={c.id} card={c} today={today} />)
      )}
    </div>
  );
}

function CardBlock({ card, today }: { card: Card; today: string }) {
  const txs = useBookTxs();
  const accounts = useBookAccounts();
  const purchases = useBookPurchases().filter((p) => p.cardId === card.id);
  const recurrings = useLedger((s) => s.recurrings);
  const usdRate = useLedger((s) => s.usdRate);
  const removePurchase = useLedger((s) => s.removePurchase);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [confirmId, setConfirmId] = useState("");

  const open = openStatement(card, txs, today);
  const closed = lastClosedStatement(card, txs, today);
  const nextDue = dueDate(shiftPeriod(open.period, 1), card.closingDay, card.dueDay);
  const upcoming = upcomingStatements(card, txs, recurrings, today, 6);
  const max = Math.max(1, ...upcoming.map((u) => u.ars + u.usd * usdRate));
  const ars = accounts.find((a) => a.id === card.accountArsId);
  const usd = accounts.find((a) => a.id === card.accountUsdId);
  const debtArs = ars ? cardDebt(ars, accountBalance(ars, txs)) : 0;
  const debtUsd = usd ? cardDebt(usd, accountBalance(usd, txs)) : 0;
  const limit = limitUse(card, debtArs, debtUsd, usdRate);
  const payFrom = accounts.find((a) => a.id === card.payAccountId);
  const network = CARD_NETWORKS.find((n) => n.id === card.network)?.label ?? "";
  const endings = upcoming.filter((u, i) => i > 0 && u.ending.count > 0).slice(0, 2);

  return (
    <section className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted">
          <CreditCard className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-medium">{card.name}</h2>
          <p className="text-xs text-muted">
            {[network, card.last4 ? `•••• ${card.last4}` : "", `cierra el ${card.closingDay}, vence el ${card.dueDay}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-elevated p-4">
          <p className="text-[11px] tracking-wide text-muted uppercase">
            Resumen cerrado · {closed.due >= today ? `vence ${dm(closed.due)}` : `venció ${dm(closed.due)}`}
          </p>
          <p className="mt-1 font-display text-3xl tabular-nums">{both(closed.ars, closed.usd)}</p>
          <p className="mt-1 text-xs text-subtle">
            {closed.ars > 0 || closed.usd > 0
              ? `Pagalo con un Cambio ${payFrom ? `desde ${accountLabel(payFrom)} ` : ""}a la tarjeta. No cuenta como gasto.`
              : "Sin consumos cargados en ese resumen."}
          </p>
        </div>
        <div className="rounded-2xl bg-elevated p-4">
          <p className="text-[11px] tracking-wide text-muted uppercase">Resumen abierto · cierra {dm(open.closing)}</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{both(open.ars, open.usd)}</p>
          <p className="mt-1 text-xs text-subtle">
            Vence el {dm(open.due)}. Si comprás después del {dm(open.closing)}, lo pagás el {dm(nextDue)}.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-medium">Próximos 6 resúmenes</h3>
        <p className="text-xs text-subtle">Lo ya cargado: cuotas, compras y fijos con esta tarjeta.</p>
        <ul className="mt-3 grid gap-2">
          {upcoming.map((u) => {
            const v = u.ars + u.usd * usdRate;
            return (
              <li key={u.period} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 text-sm">
                <span className="text-muted capitalize">{monthLabel(u.period, "LLL")}</span>
                <span className="h-2 overflow-hidden rounded-full bg-elevated">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
                </span>
                <span className="text-right tabular-nums">{both(u.ars, u.usd)}</span>
              </li>
            );
          })}
        </ul>
        {endings.map((u) => (
          <p key={u.period} className="mt-2 text-xs text-subtle">
            En {monthLabel(u.period, "LLLL")} termina{u.ending.count > 1 ? `n ${u.ending.count} cuotas` : " 1 cuota"}: desde
            el resumen siguiente liberás {both(u.ending.ars, u.ending.usd)} por mes.
          </p>
        ))}
      </div>

      <dl className="mt-5 grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Deuda total (con las cuotas que vienen)</dt>
          <dd className="text-right tabular-nums">{both(debtArs, debtUsd)}</dd>
        </div>
        {limit ? (
          <div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Uso del límite</dt>
              <dd className={cn("text-right tabular-nums", limit.pct > 0.8 && "text-expense")}>
                {Math.round(limit.pct * 100)} % · libre {money(Math.max(0, limit.free), "ARS")}
              </dd>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
              <span
                className={cn("block h-full rounded-full", limit.pct > 0.8 ? "bg-expense" : "bg-accent")}
                style={{ width: `${Math.min(100, limit.pct * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-subtle">Las cuotas ocupan el límite completo hasta que las pagás.</p>
          </div>
        ) : null}
      </dl>

      <div className="mt-6">
        <h3 className="text-sm font-medium">Compras en cuotas</h3>
        {purchases.length === 0 && !adding ? (
          <p className="mt-1 text-sm text-muted">Ninguna todavía. También podés cargarlas desde Nuevo eligiendo esta tarjeta.</p>
        ) : null}
        <ul className="mt-2 grid gap-2">
          {purchases.map((p) => {
            const prog = purchaseProgress(p, txs, today);
            if (editingId === p.id) {
              return (
                <li key={p.id} id={`compra-${p.id}`}>
                  <PurchaseForm card={card} initial={p} onDone={() => setEditingId("")} />
                </li>
              );
            }
            return (
              <li key={p.id} id={`compra-${p.id}`} className="rounded-xl bg-elevated p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">{p.merchant || "Compra en cuotas"}</p>
                  <p className="shrink-0 text-sm tabular-nums">
                    {p.installments} × {money(p.installmentAmount, p.currency)}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {prog.current ? `Vas por la ${prog.current}/${prog.count}` : `Arranca en ${monthLabel(p.date.slice(0, 7), "LLLL")}`}
                  {" · "}
                  {prog.left > 0 ? `quedan ${money(prog.left, p.currency)}` : "ya está paga"}
                  {p.interestFree ? " · sin interés" : " · con interés"}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-11 flex-1"
                    onClick={() => {
                      setConfirmId("");
                      setAdding(false);
                      setEditingId(p.id);
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant={confirmId === p.id ? "danger" : "ghost"}
                    size="sm"
                    className="h-11 flex-1"
                    onClick={() => {
                      if (confirmId !== p.id) {
                        setConfirmId(p.id);
                        return;
                      }
                      removePurchase(p.id);
                      setConfirmId("");
                      toast.success("Borré la compra y sus cuotas");
                    }}
                  >
                    {confirmId === p.id ? "¿Seguro? Borrar" : "Borrar"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {adding ? (
          <PurchaseForm card={card} onDone={() => setAdding(false)} />
        ) : (
          <Button
            variant="secondary"
            className="mt-3 w-full sm:w-auto"
            onClick={() => {
              setEditingId("");
              setAdding(true);
            }}
          >
            Cargar compra en cuotas
          </Button>
        )}
      </div>
    </section>
  );
}
