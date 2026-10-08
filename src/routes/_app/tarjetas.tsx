import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard, FileUp } from "lucide-react";
import { toast } from "sonner";
import { accountBalance } from "@/lib/books";
import {
  cardDebt,
  closingOf,
  dueOf,
  limitUse,
  openStatement,
  purchaseProgress,
  shiftPeriod,
  upcomingStatements,
} from "@/lib/card-math";
import { estimatedInterest, gapCharge, lastClosedBalance, periodName, statementBalance, type StatementBalance } from "@/lib/card-pay";
import { money, monthLabel } from "@/lib/format";
import { argentinaDay } from "@/lib/market-hours";
import { useBookAccounts, useBookCards, useBookPurchases, useBookStatements, useBookTxs, useLedger } from "@/lib/store";
import { CARD_NETWORKS, type Card } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PurchaseForm } from "@/components/purchase-form";
import { StatementImport } from "@/components/statement-import";
import { PayStatement } from "@/components/pay-statement";
import { DebtPlanCard } from "@/components/debt-plan-card";

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
  const statements = useBookStatements();
  const accounts = useBookAccounts();
  const book = useLedger((s) => s.books.find((b) => b.id === s.activeBookId));
  const today = argentinaDay();

  // Links from a cuota land on #compra-<id>: scroll there.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "center" }), 300);
  }, []);

  const toPay = cards
    .map((c) => ({ card: c, st: lastClosedBalance(c, txs, today, statements, accounts) }))
    .filter((x) => x.st.leftArs > 0 || x.st.leftUsd > 0);
  const payArs = toPay.reduce((s, x) => s + x.st.leftArs, 0);
  const payUsd = toPay.reduce((s, x) => s + x.st.leftUsd, 0);
  const late = toPay.some((x) => x.st.due < today);

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Crédito · {book?.name ?? ""}</p>
        <h1 data-tour="titulo" className="font-display text-4xl tracking-tight">Tarjetas</h1>
        {cards.length ? (
          <p className="mt-1 text-sm text-muted">
            {toPay.length
              ? `${late ? "Para pagar" : "Próximo a pagar"}: ${both(payArs, payUsd)} (${toPay
                  .map((x) => `${x.st.due < today ? "venció" : "vence"} ${dm(x.st.due)}`)
                  .join(" y ")}).`
              : "No tenés resúmenes cerrados por pagar."}
          </p>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <div data-tour="tarjeta" className="rounded-3xl bg-surface p-5">
          <p className="text-sm">Todavía no cargaste ninguna tarjeta.</p>
          <p className="mt-1 text-sm text-muted">Agregala en Ajustes con su día de cierre y vencimiento.</p>
          <Button asChild className="mt-4">
            <Link to="/ajustes" hash="tarjetas">
              Agregar tarjeta
            </Link>
          </Button>
        </div>
      ) : (
        cards.map((c, i) => <CardBlock key={c.id} card={c} today={today} tour={i === 0} />)
      )}
      {cards.length ? <DebtPlanCard /> : null}
    </div>
  );
}

function CardBlock({ card, today, tour = false }: { card: Card; today: string; tour?: boolean }) {
  const txs = useBookTxs();
  const accounts = useBookAccounts();
  const purchases = useBookPurchases().filter((p) => p.cardId === card.id);
  const recurrings = useLedger((s) => s.recurrings);
  const usdRate = useLedger((s) => s.usdRate);
  const removePurchase = useLedger((s) => s.removePurchase);
  const statements = useBookStatements();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [paying, setPaying] = useState(false);
  const addTx = useLedger((s) => s.addTx);
  const [editingId, setEditingId] = useState("");
  const [confirmId, setConfirmId] = useState("");

  const open = openStatement(card, txs, today, statements);
  const closed = lastClosedBalance(card, txs, today, statements, accounts);
  const openBal = statementBalance(card, txs, open.period, today, statements, accounts);
  const financed = closed.due < today ? Math.max(0, openBal.carriedArs) : 0;
  const financedUsd = closed.due < today ? Math.max(0, openBal.carriedUsd) : 0;
  const gap = gapCharge(card, closed);
  const nextDue = dueOf(card, shiftPeriod(open.period, 1), statements);
  const upcoming = upcomingStatements(card, txs, recurrings, today, 6, statements);
  const max = Math.max(1, ...upcoming.map((u) => u.ars + u.usd * usdRate));
  const ars = accounts.find((a) => a.id === card.accountArsId);
  const usd = accounts.find((a) => a.id === card.accountUsdId);
  const debtArs = ars ? cardDebt(ars, accountBalance(ars, txs)) : 0;
  const debtUsd = usd ? cardDebt(usd, accountBalance(usd, txs)) : 0;
  const limit = limitUse(card, debtArs, debtUsd, usdRate);
  const network = CARD_NETWORKS.find((n) => n.id === card.network)?.label ?? "";
  const endings = upcoming.filter((u, i) => i > 0 && u.ending.count > 0).slice(0, 2);

  return (
    <section data-tour={tour ? "tarjeta" : undefined} className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
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
        <ClosedStatement
          card={card}
          closed={closed}
          today={today}
          paying={paying}
          onPay={() => {
            setAdding(false);
            setImporting(false);
            setEditingId("");
            setPaying(true);
          }}
          onLoadGap={
            gap
              ? () => {
                  addTx(gap);
                  toast.success(`Cargué ${money(gap.amount, "ARS")} en Intereses y comisiones, en el resumen de ${periodName(closed.period)}`);
                }
              : undefined
          }
        />
        <div className="rounded-2xl bg-elevated p-4">
          <p className="text-[11px] tracking-wide text-muted uppercase">Resumen abierto · cierra {dm(open.closing)}</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{both(open.ars, open.usd)}</p>
          {financed > 0 || financedUsd > 0 ? (
            <p className="mt-1 text-xs text-expense tabular-nums">
              Más {both(financed, financedUsd)} de saldo financiado del resumen anterior (con intereses).
            </p>
          ) : null}
          <p className="mt-1 text-xs text-subtle">
            Vence el {dm(open.due)}. Si comprás después del {dm(open.closing)}, lo pagás el {dm(nextDue)}.
          </p>
        </div>
      </div>
      {paying ? <PayStatement card={card} balance={closed} onDone={() => setPaying(false)} /> : null}

      <div className="mt-5" data-tour={tour ? "resumen" : undefined}>
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

      <div className="mt-6" data-tour={tour ? "compras" : undefined}>
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
        ) : importing ? (
          <StatementImport card={card} onClose={() => setImporting(false)} />
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setEditingId("");
                setAdding(true);
              }}
            >
              Cargar compra en cuotas
            </Button>
            <Button
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setEditingId("");
                setImporting(true);
              }}
            >
              <FileUp aria-hidden />
              Importar resumen PDF
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

const STATUS: Record<StatementBalance["status"], string> = {
  "sin-deuda": "",
  pagado: "Pagado",
  parcial: "Pago parcial",
  "a-pagar": "A pagar",
  vencido: "Vencido",
};

function ClosedStatement({
  card,
  closed,
  today,
  paying,
  onPay,
  onLoadGap,
}: {
  card: Card;
  closed: StatementBalance;
  today: string;
  paying: boolean;
  onPay: () => void;
  onLoadGap?: () => void;
}) {
  const statements = useBookStatements();
  const left = closed.leftArs > 0 || closed.leftUsd > 0;
  const bank = closed.bank;
  const status = STATUS[closed.status];
  const nextClosing = closingOf(card, shiftPeriod(closed.period, 1), statements);
  const interest = closed.status === "vencido" ? estimatedInterest(closed.leftArs, card.tna, closed.due, nextClosing) : null;
  const over = bank ? Math.round(closed.cifraArs - bank.totalArs) : 0;
  return (
    <div className="rounded-2xl bg-elevated p-4" aria-label="Resumen cerrado">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] tracking-wide text-muted uppercase">
          Resumen cerrado · {closed.due >= today ? `vence ${dm(closed.due)}` : `venció ${dm(closed.due)}`}
        </p>
        {status ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
              closed.status === "pagado" ? "bg-income/15 text-income" : closed.status === "vencido" ? "bg-expense/15 text-expense" : "bg-surface text-muted",
            )}
          >
            {status}
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-display text-3xl tabular-nums">{both(closed.owedArs, closed.owedUsd)}</p>
      {bank ? (
        <p className="mt-1 text-xs text-muted tabular-nums">
          Según el banco{bank.minimumArs ? ` · mínimo ${money(bank.minimumArs, "ARS")}` : ""}.
          {Math.abs(bank.totalArs - closed.cifraArs) >= 1 || Math.abs(bank.totalUsd - closed.cifraUsd) >= 0.01
            ? ` En Cifra: ${both(Math.max(0, closed.cifraArs), Math.max(0, closed.cifraUsd))}.`
            : " Coincide con lo que tenés en Cifra."}
        </p>
      ) : null}
      {closed.carriedArs > 0 || closed.carriedUsd > 0 ? (
        <p className="mt-1 text-xs text-muted tabular-nums">
          Incluye {both(Math.max(0, closed.carriedArs), Math.max(0, closed.carriedUsd))} que venían de antes sin pagar. ¿Ya
          lo pagaste? Registrá ese pago con su fecha.
        </p>
      ) : null}
      {closed.paidArs > 0 || closed.paidUsd > 0 ? (
        <p className="mt-1 text-xs text-muted tabular-nums">
          Pagaste {both(closed.paidArs, closed.paidUsd)}
          {left ? ` · quedan ${both(closed.leftArs, closed.leftUsd)}` : ""}
          {closed.minimumArs > 0 && left ? (closed.minimumCovered ? " · cubriste el mínimo" : " · no llegaste al mínimo") : ""}.
        </p>
      ) : null}
      {onLoadGap ? (
        <div className="mt-2 rounded-lg bg-surface p-2.5 text-xs text-muted">
          <p className="tabular-nums">
            El banco dice {money(bank!.totalArs, "ARS")} y Cifra tiene {money(Math.max(0, closed.cifraArs), "ARS")}. Faltan{" "}
            {money(Math.round(bank!.totalArs - closed.cifraArs), "ARS")}: ¿intereses, comisiones o un consumo sin cargar?
          </p>
          <Button variant="secondary" size="sm" className="mt-2 h-10 w-full" onClick={onLoadGap}>
            Cargar la diferencia como cargo del banco
          </Button>
        </div>
      ) : over > 1 ? (
        <p className="mt-1 text-xs text-subtle tabular-nums">
          Cifra tiene {money(over, "ARS")} más que el banco: revisá si cargaste algo dos veces o falta registrar un pago.
        </p>
      ) : null}
      {interest && interest.total > 0 ? (
        <p className="mt-1 text-xs text-expense tabular-nums">
          Lo que quede sin pagar pasa al próximo resumen. Interés estimado: {money(interest.total, "ARS")} (con IVA).
        </p>
      ) : null}
      {left ? (
        !paying ? (
          <Button className="mt-3 h-11 w-full" onClick={onPay}>
            Pagar
          </Button>
        ) : null
      ) : (
        <p className="mt-1 text-xs text-subtle">
          {closed.status === "pagado" ? "Listo, este resumen está pago." : "Sin consumos cargados en ese resumen."}
        </p>
      )}
    </div>
  );
}
