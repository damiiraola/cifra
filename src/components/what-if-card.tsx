import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { money, moneyARS, parseAmount } from "@/lib/format";
import { periodName } from "@/lib/card-pay";
import type { Scenario, SimGoal, SimResult } from "@/lib/plan/simulate";
import { useSimulation } from "@/lib/plan/use-plan";
import { useAllCategories, useBookAccounts, useBookCards, useLedger } from "@/lib/store";
import { argentinaDay } from "@/lib/market-hours";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Kind = Scenario["kind"];

const KINDS: { id: Kind; label: string }[] = [
  { id: "cuotas", label: "Compra en cuotas" },
  { id: "gasto", label: "Gasto grande" },
  { id: "sueldo", label: "Cambio de sueldo" },
];

const CUOTAS = [3, 6, 12, 18];

function month(ym: string) {
  return periodName(ym).split(" ")[0]!;
}

function signed(n: number) {
  return n < 0 ? `−${moneyARS(-n)}` : n > 0 ? `+${moneyARS(n)}` : moneyARS(0);
}

function goalText(g: SimGoal) {
  const b = g.before.eta;
  const a = g.after.eta;
  switch (g.change) {
    case "later":
      return `${g.name}: llegabas en ${periodName(b)}, ahora en ${periodName(a)}.`;
    case "sooner":
      return `${g.name}: llegabas en ${periodName(b)}, ahora en ${periodName(a)}.`;
    case "lost":
      return `${g.name}: llegabas en ${periodName(b)}; así no sobra para esta meta.`;
    case "gained":
      return `${g.name}: hoy no sobra para esta meta; así llegás en ${periodName(a)}.`;
    default:
      return g.after.assigned !== g.before.assigned
        ? `${g.name}: sigue llegando en ${a ? periodName(a) : "la misma fecha"}, con ${money(g.after.assigned, g.currency)} por mes.`
        : `${g.name}: no cambia.`;
  }
}

/**
 * "¿Y si…?" (§2.6): compra en cuotas, gasto grande o cambio de sueldo. Shows
 * the cajas month by month, the goals and the card limit with and without it.
 * Nothing is saved until the user taps the button to load it.
 */
export function WhatIfCard() {
  const cards = useBookCards();
  const accounts = useBookAccounts();
  const cats = useAllCategories().filter((c) => c.kind === "expense");
  const recurrings = useLedger((s) => s.recurrings);
  const bookId = useLedger((s) => s.activeBookId);
  const savePurchase = useLedger((s) => s.savePurchase);
  const openQuick = useLedger((s) => s.openQuick);
  const upsertRecurring = useLedger((s) => s.upsertRecurring);

  const [kind, setKind] = useState<Kind>(cards.length ? "cuotas" : "gasto");
  const [amount, setAmount] = useState("");
  const [n, setN] = useState("6");
  const [interestFree, setInterestFree] = useState(true);
  const [cardId, setCardId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [fromNow, setFromNow] = useState(false);
  const [what, setWhat] = useState("");
  const [categoryId, setCategoryId] = useState("compras");

  const value = parseAmount(amount) ?? 0;
  const card = cards.find((c) => c.id === cardId) ?? cards[0];
  const cajas = accounts.filter((a) => a.kind !== "card" || cards.some((c) => c.accountArsId === a.id));
  const caja = cajas.find((a) => a.id === accountId) ?? cajas.find((a) => a.kind === "bank") ?? cajas[0];
  const installments = Math.max(1, Math.min(72, Math.round(Number(n) || 1)));
  const sueldo = recurrings
    .filter((r) => r.bookId === bookId && r.active && r.type === "income" && r.currency === "ARS")
    .sort((a, b) => b.amount - a.amount)[0];

  const scenario = useMemo<Scenario | null>(() => {
    if (!value) return null;
    if (kind === "cuotas") {
      if (!card) return null;
      return { kind, cardId: card.id, amount: value, installments, interestFree };
    }
    if (kind === "gasto") return caja ? { kind, accountId: caja.id, amount: value } : null;
    return { kind, delta: value, fromThisMonth: fromNow };
  }, [kind, value, card, installments, interestFree, caja, fromNow]);
  const result = useSimulation(scenario);

  function load() {
    if (!scenario) return;
    if (scenario.kind === "cuotas" && card) {
      const saved = savePurchase({
        cardId: card.id,
        date: argentinaDay(),
        merchant: what.trim(),
        categoryId,
        currency: "ARS",
        installments,
        installmentAmount: interestFree ? Math.round((value / installments) * 100) / 100 : value,
        total: interestFree ? value : Math.round(value * installments * 100) / 100,
        interestFree,
        cashPrice: 0,
        paidBefore: 0,
        note: "",
      });
      if (!saved) return;
      toast.success(`Cargué la compra en ${installments} cuotas en la ${card.name}`);
      setAmount("");
      setWhat("");
    } else if (scenario.kind === "gasto" && caja) {
      openQuick({
        type: "expense",
        amount: value,
        accountId: caja.id,
        currency: caja.currency,
        ...(caja.kind === "card" ? { method: "credito" as const } : {}),
      });
    } else if (scenario.kind === "sueldo" && sueldo) {
      const next = Math.round(sueldo.amount + value);
      if (next <= 0) return;
      upsertRecurring({ ...sueldo, amount: next });
      toast.success(`${sueldo.name} queda en ${moneyARS(next)} por mes`);
      setAmount("");
    }
  }

  const chip = (on: boolean) =>
    on ? "h-11 rounded-full bg-accent px-3.5 text-sm text-accent-fg" : "h-11 rounded-full bg-elevated px-3.5 text-sm text-muted";

  return (
    <section
      id="simular"
      className="scroll-mt-24 rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]"
    >
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">¿Y si…?</p>
      <p className="mt-1 font-display text-3xl tracking-tight">Probalo antes de hacerlo</p>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Mirá cómo quedan tus cajas, tus metas y la tarjeta. No se guarda nada hasta que lo cargues.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Qué querés probar">
        {KINDS.map((k) => (
          <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={chip(kind === k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        {kind === "cuotas" && !cards.length ? (
          <p className="text-sm text-muted">
            Para probar una compra en cuotas, primero{" "}
            <Link to="/ajustes" hash="tarjetas" className="underline">
              cargá una tarjeta
            </Link>
            .
          </p>
        ) : null}
        {kind !== "cuotas" || cards.length ? (
          <Input
            inputMode="decimal"
            aria-label={kind === "sueldo" ? "Cuánto cambia por mes" : kind === "cuotas" && !interestFree ? "Cuánto es cada cuota" : "Cuánto sale"}
            value={amount}
            placeholder={
              kind === "sueldo" ? "Por mes: 150000 o −50000" : kind === "cuotas" && !interestFree ? "Cada cuota" : "Cuánto sale"
            }
            onChange={(e) => setAmount(e.target.value)}
          />
        ) : null}

        {kind === "cuotas" && cards.length ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Cuotas">
              {CUOTAS.map((c) => (
                <button key={c} type="button" aria-pressed={Number(n) === c} onClick={() => setN(String(c))} className={chip(Number(n) === c)}>
                  {c}
                </button>
              ))}
              <Input inputMode="numeric" aria-label="Cantidad de cuotas" value={n} className="w-20" onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={interestFree} onClick={() => setInterestFree(true)} className={chip(interestFree)}>
                Sin interés
              </button>
              <button type="button" aria-pressed={!interestFree} onClick={() => setInterestFree(false)} className={chip(!interestFree)}>
                Con interés
              </button>
            </div>
            {cards.length > 1 ? (
              <select
                aria-label="Tarjeta"
                value={card?.id ?? ""}
                onChange={(e) => setCardId(e.target.value)}
                className="h-11 rounded-lg bg-elevated px-2 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        ) : null}

        {kind === "gasto" ? (
          <select
            aria-label="De qué caja sale"
            value={caja?.id ?? ""}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-11 rounded-lg bg-elevated px-2 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
          >
            {cajas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.kind === "card" ? `${cards.find((c) => c.accountArsId === a.id)?.name ?? a.name} (en un pago)` : a.name}
                {a.currency !== "ARS" ? ` · ${a.currency}` : ""}
              </option>
            ))}
          </select>
        ) : null}

        {kind === "sueldo" ? (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={!fromNow} onClick={() => setFromNow(false)} className={chip(!fromNow)}>
              Desde el mes que viene
            </button>
            <button type="button" aria-pressed={fromNow} onClick={() => setFromNow(true)} className={chip(fromNow)}>
              Desde este mes
            </button>
          </div>
        ) : null}
      </div>

      {result && !result.invalid ? (
        <SimView result={result} kind={kind} cardName={card?.name ?? ""} />
      ) : result?.invalid ? (
        <p className="mt-4 text-sm text-muted">{result.invalid}</p>
      ) : null}

      {result && !result.invalid ? (
        <div className="mt-5 grid gap-2 rounded-2xl bg-elevated px-4 py-3">
          {kind === "cuotas" ? (
            <>
              <p className="text-sm font-medium">¿Lo hacés? Cargalo:</p>
              <Input aria-label="Qué compraste" value={what} placeholder="Qué es (opcional)" onChange={(e) => setWhat(e.target.value)} />
              <select
                aria-label="Categoría de la compra"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-11 rounded-lg bg-surface px-2 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
              >
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button onClick={load}>Cargar esta compra</Button>
            </>
          ) : kind === "gasto" ? (
            <>
              <p className="text-sm">¿Lo hacés? Se abre Nuevo con el monto para que elijas la categoría y lo confirmes.</p>
              <Button onClick={load}>Cargar este gasto</Button>
            </>
          ) : sueldo ? (
            <>
              <p className="text-sm">
                ¿Es así? Tu fijo {sueldo.name} pasa de {moneyARS(sueldo.amount)} a {moneyARS(Math.max(0, Math.round(sueldo.amount + value)))} por mes.
              </p>
              <Button onClick={load} disabled={sueldo.amount + value <= 0}>
                Actualizar {sueldo.name}
              </Button>
            </>
          ) : (
            <p className="text-sm">
              Para que Cifra cuente el sueldo todos los meses,{" "}
              <Link to="/fijos" className="underline">
                cargalo como fijo
              </Link>
              .
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function SimView({ result: r, kind, cardName }: { result: SimResult; kind: Kind; cardName: string }) {
  const last = r.months[r.months.length - 1];
  return (
    <div className="mt-5 grid gap-3">
      {r.cuotas ? (
        <p className="text-sm">
          {r.cuotas.count === 1
            ? `Lo pagás en un pago con el resumen de ${month(r.cuotas.first)}.`
            : `Pagás ${r.cuotas.count} cuotas de ${moneyARS(r.cuotas.each)} con el resumen de la ${cardName}, de ${periodName(r.cuotas.first)} a ${periodName(r.cuotas.last)}. En total, ${moneyARS(r.cuotas.total)}.`}
        </p>
      ) : null}
      {last ? (
        <p className="text-sm">
          Tus cajas a fin de {month(last.ym)}: <span className="tabular-nums">{moneyARS(last.sim)}</span>
          {last.delta !== 0 ? (
            <span className="text-muted"> ({signed(last.delta)} que sin esto)</span>
          ) : null}
          .
        </p>
      ) : null}
      <p className={cn("text-sm", r.redFrom ? "text-warn" : "text-muted")}>
        {r.redFrom
          ? `En ${month(r.redFrom)} quedás en rojo: el mes más justo es ${month(r.lowest.ym)} con ${signed(r.lowest.balance)}.${r.redFromBase ? " (Sin esto también quedabas en rojo.)" : ""}`
          : `No quedás en rojo en los próximos ${r.months.length} meses. El mes más justo: ${month(r.lowest.ym)} con ${moneyARS(r.lowest.balance)}.`}
      </p>
      {r.surplus.after !== r.surplus.before ? (
        <p className="text-sm text-muted">
          Lo que te sobra por mes: {moneyARS(r.surplus.before)} → {moneyARS(r.surplus.after)}.
        </p>
      ) : null}
      {r.limit ? (
        <p className={cn("text-sm", r.limit.after > 1 ? "text-warn" : "text-muted")}>
          {r.limit.after > 1
            ? `Te pasás del límite de la ${r.limit.name} por ${moneyARS(-r.limit.free)}: el banco puede rechazarla.`
            : `La ${r.limit.name} pasa de usar el ${Math.round(r.limit.before * 100)} % al ${Math.round(r.limit.after * 100)} % del límite (te quedan ${moneyARS(r.limit.free)}).`}
        </p>
      ) : kind === "cuotas" ? (
        <p className="text-xs text-subtle">La tarjeta no tiene límite cargado.</p>
      ) : null}
      {r.goals.length ? (
        <div className="grid gap-1">
          <p className="text-sm font-medium">Metas</p>
          {r.goals.map((g) => (
            <p key={g.id} className={cn("text-sm", g.change === "later" || g.change === "lost" ? "text-warn" : "text-muted")}>
              {goalText(g)}
            </p>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-muted uppercase">
              <th className="py-1 font-medium">Fin de</th>
              <th className="py-1 text-right font-medium">Sin esto</th>
              <th className="py-1 text-right font-medium">Con esto</th>
              <th className="py-1 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {r.months.map((m) => (
              <tr key={m.ym} className={cn("border-t border-white/5", m.sim < 0 && "text-warn")}>
                <td className="py-1.5 capitalize">{month(m.ym)}</td>
                <td className="py-1.5 text-right">{moneyARS(m.base)}</td>
                <td className="py-1.5 text-right">{moneyARS(m.sim)}</td>
                <td className="py-1.5 text-right">{signed(m.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
