import { useState } from "react";
import { toast } from "sonner";
import { accountBalance, accountLabel } from "@/lib/books";
import { closingOf, shiftPeriod } from "@/lib/card-math";
import { estimatedInterest, paymentMovements, perceptionFor, periodName, PERCEPTION_NOTE, type PayPlan, type StatementBalance } from "@/lib/card-pay";
import { quoteVenta, formatRate } from "@/lib/fx";
import { amountInput, money, parseAmount } from "@/lib/format";
import { useBookAccounts, useBookStatements, useBookTxs, useLedger } from "@/lib/store";
import type { Card } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SELECT =
  "mt-1.5 h-11 w-full rounded-lg bg-surface px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none";

type ArsChoice = "total" | "minimo" | "otro";
type UsdChoice = "total" | "otro";

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={cn("grid gap-2", options.length === 3 ? "grid-cols-3" : "grid-cols-2")} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "min-h-11 rounded-lg px-2 text-sm font-medium",
            value === o.id ? "bg-surface text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.2)]" : "bg-surface/60 text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Pay a closed statement: total, minimum or another amount, from a caja.
 * Pesos are a Cambio to the card's ARS caja. Dollars: with your own dollars
 * (no perception) or in pesos (perception at the card's % as an expense in
 * Impuestos). Nothing here is an expense except that perception.
 */
export function PayStatement({ card, balance, onDone }: { card: Card; balance: StatementBalance; onDone: () => void }) {
  const accounts = useBookAccounts();
  const txs = useBookTxs();
  const statements = useBookStatements();
  const addTx = useLedger((s) => s.addTx);
  const quotes = useLedger((s) => s.quotes);
  const usdRate = useLedger((s) => s.usdRate);
  const pesosCajas = accounts.filter((a) => a.kind !== "card" && a.currency === "ARS");
  const dollarCajas = accounts.filter((a) => a.kind !== "card" && a.currency === "USD");
  const bal = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? accountBalance(a, txs) : 0;
  };
  const defaultPesos =
    (card.payAccountId && pesosCajas.some((a) => a.id === card.payAccountId) ? card.payAccountId : "") ||
    pesosCajas.find((a) => a.kind === "bank")?.id ||
    pesosCajas[0]?.id ||
    "";
  const minLeft = Math.max(0, Math.round(balance.minimumArs - balance.paidArs));
  const official = quoteVenta(quotes, "oficial") ?? usdRate;

  const [arsChoice, setArsChoice] = useState<ArsChoice>("total");
  const [arsOther, setArsOther] = useState("");
  const [arsFrom, setArsFrom] = useState(defaultPesos);
  const [usdChoice, setUsdChoice] = useState<UsdChoice>("total");
  const [usdOther, setUsdOther] = useState("");
  const bestDollars = dollarCajas.slice().sort((a, b) => bal(b.id) - bal(a.id))[0];
  const [usdMode, setUsdMode] = useState<"dolares" | "pesos">(
    bestDollars && bal(bestDollars.id) >= balance.leftUsd ? "dolares" : "pesos",
  );
  const [usdFrom, setUsdFrom] = useState(bestDollars?.id ?? "");
  const [usdPesosFrom, setUsdPesosFrom] = useState(defaultPesos);
  const [rate, setRate] = useState(amountInput(Math.round(official)));
  const [date, setDate] = useState(todayISO());

  const hasArs = balance.leftArs > 0;
  const hasUsd = balance.leftUsd > 0;
  const arsAmount = !hasArs
    ? 0
    : arsChoice === "total"
      ? balance.leftArs
      : arsChoice === "minimo"
        ? minLeft
        : (parseAmount(arsOther) ?? 0);
  const usdAmount = !hasUsd ? 0 : usdChoice === "total" ? balance.leftUsd : (parseAmount(usdOther) ?? 0);
  const r = parseAmount(rate) ?? 0;
  const pesosForUsd = Math.round(usdAmount * r);
  const perception = perceptionFor(usdAmount, r, card.usdPerceptionPct);
  const restArs = Math.max(0, Math.round(balance.leftArs - arsAmount));
  const restUsd = Math.max(0, Math.round((balance.leftUsd - usdAmount) * 100) / 100);
  const nextClosing = closingOf(card, shiftPeriod(balance.period, 1), statements);
  const interest = estimatedInterest(restArs, card.tna, balance.due, nextClosing);
  const totalPerception = perceptionFor(balance.leftUsd, r, card.usdPerceptionPct);
  const haveDollars = dollarCajas.reduce((s, a) => s + Math.max(0, bal(a.id)), 0);

  function save() {
    if (hasArs && arsAmount > 0 && !arsFrom) return toast.error("Elegí de qué caja salen los pesos");
    if (arsAmount < 0 || usdAmount < 0) return toast.error("Ingresá un monto válido");
    if (hasUsd && usdAmount > 0) {
      if (usdMode === "dolares" && !usdFrom) return toast.error("Elegí de qué caja salen los dólares");
      if (usdMode === "pesos" && !usdPesosFrom) return toast.error("Elegí de qué caja salen los pesos");
      if (usdMode === "pesos" && !(r > 0)) return toast.error("Poné la cotización del dólar");
    }
    if (!date) return toast.error("Elegí la fecha del pago");
    const plan: PayPlan = { date, period: balance.period };
    if (arsAmount > 0) plan.ars = { fromId: arsFrom, amount: arsAmount };
    if (usdAmount > 0) {
      plan.usd =
        usdMode === "dolares"
          ? { mode: "dolares", fromId: usdFrom, amount: usdAmount }
          : { mode: "pesos", fromId: usdPesosFrom, amount: usdAmount, rate: r };
    }
    const moves = paymentMovements(card, plan);
    if (!moves.length) return toast.error("Ingresá cuánto pagás");
    for (const m of moves) addTx(m);
    const parts = [
      arsAmount > 0 ? money(Math.round(arsAmount), "ARS") : "",
      usdAmount > 0 ? (usdMode === "dolares" ? money(usdAmount, "USD") : `${money(usdAmount, "USD")} en pesos`) : "",
    ].filter(Boolean);
    toast.success(`Registré el pago de ${parts.join(" + ")}`, {
      description:
        perception > 0 && usdMode === "pesos"
          ? `Y la percepción de ${money(perception, "ARS")} como gasto en Impuestos.`
          : restArs > 0 || restUsd > 0
            ? "Lo que falta pasa al próximo resumen."
            : "Resumen pagado. No cuenta como gasto.",
    });
    onDone();
  }

  return (
    <form
      aria-label="Pagar resumen"
      className="mt-3 grid gap-4 rounded-xl bg-elevated p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <p className="text-sm font-medium">Pagar el resumen de {periodName(balance.period)}</p>
        <p className="text-xs text-subtle">Es un Cambio de tu caja a la tarjeta: baja la deuda y no cuenta como gasto.</p>
      </div>

      {hasArs ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-xs tracking-wide text-muted uppercase">Pesos · quedan {money(balance.leftArs, "ARS")}</legend>
          <Chips<ArsChoice>
            label="Cuánto pagás en pesos"
            value={arsChoice}
            onChange={setArsChoice}
            options={[
              { id: "total", label: "Total" },
              ...(minLeft > 0 ? [{ id: "minimo" as const, label: `Mínimo ${money(minLeft, "ARS")}` }] : []),
              { id: "otro", label: "Otro monto" },
            ]}
          />
          {minLeft <= 0 && balance.minimumArs <= 0 ? (
            <p className="text-xs text-subtle">El pago mínimo lo dice el banco: importá el resumen en PDF para verlo.</p>
          ) : null}
          {arsChoice === "otro" ? (
            <div>
              <Label htmlFor={`pay-ars-${card.id}`}>Monto en pesos</Label>
              <Input id={`pay-ars-${card.id}`} className="mt-1.5" inputMode="decimal" value={arsOther} onChange={(e) => setArsOther(e.target.value)} placeholder="0" />
            </div>
          ) : null}
          <div>
            <Label htmlFor={`pay-from-${card.id}`}>Desde</Label>
            <select id={`pay-from-${card.id}`} className={SELECT} value={arsFrom} onChange={(e) => setArsFrom(e.target.value)}>
              {pesosCajas.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)} · {money(bal(a.id), "ARS")}
                </option>
              ))}
            </select>
            {arsFrom && arsAmount > bal(arsFrom) ? (
              <p className="mt-1 text-xs text-expense">No te alcanza: esa caja tiene {money(bal(arsFrom), "ARS")}.</p>
            ) : null}
          </div>
        </fieldset>
      ) : null}

      {hasUsd ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-xs tracking-wide text-muted uppercase">Dólares · quedan {money(balance.leftUsd, "USD")}</legend>
          <p className="text-xs text-muted tabular-nums">
            En pesos: {money(Math.round(balance.leftUsd * r) + totalPerception, "ARS")} (oficial ${formatRate(r)} + {card.usdPerceptionPct} % de
            percepción). Con tus dólares: {money(balance.leftUsd, "USD")}, sin percepción.
            {dollarCajas.length ? ` Tenés ${money(haveDollars, "USD")} en dólares.` : ""}
          </p>
          <Chips<"dolares" | "pesos">
            label="Cómo pagás los dólares"
            value={usdMode}
            onChange={setUsdMode}
            options={[
              { id: "dolares", label: "Con mis dólares" },
              { id: "pesos", label: "En pesos" },
            ]}
          />
          <Chips<UsdChoice>
            label="Cuánto pagás en dólares"
            value={usdChoice}
            onChange={setUsdChoice}
            options={[
              { id: "total", label: "Total" },
              { id: "otro", label: "Otro monto" },
            ]}
          />
          {usdChoice === "otro" ? (
            <div>
              <Label htmlFor={`pay-usd-${card.id}`}>Monto en dólares</Label>
              <Input id={`pay-usd-${card.id}`} className="mt-1.5" inputMode="decimal" value={usdOther} onChange={(e) => setUsdOther(e.target.value)} placeholder="0" />
            </div>
          ) : null}
          {usdMode === "dolares" ? (
            dollarCajas.length ? (
              <div>
                <Label htmlFor={`pay-usdfrom-${card.id}`}>Desde</Label>
                <select id={`pay-usdfrom-${card.id}`} className={SELECT} value={usdFrom} onChange={(e) => setUsdFrom(e.target.value)}>
                  {dollarCajas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)} · {money(bal(a.id), "USD")}
                    </option>
                  ))}
                </select>
                {usdFrom && usdAmount > bal(usdFrom) ? (
                  <p className="mt-1 text-xs text-expense">No te alcanza: esa caja tiene {money(bal(usdFrom), "USD")}.</p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-expense">No tenés cajas en dólares. Agregá una en Ajustes o pagá en pesos.</p>
            )
          ) : (
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`pay-usdpesos-${card.id}`}>Desde</Label>
                  <select id={`pay-usdpesos-${card.id}`} className={SELECT} value={usdPesosFrom} onChange={(e) => setUsdPesosFrom(e.target.value)}>
                    {pesosCajas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {accountLabel(a)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor={`pay-rate-${card.id}`}>Dólar oficial</Label>
                  <Input id={`pay-rate-${card.id}`} className="mt-1.5" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
                </div>
              </div>
              {usdAmount > 0 && r > 0 ? (
                <p className="text-xs text-muted tabular-nums">
                  Salen {money(pesosForUsd + perception, "ARS")}: {money(pesosForUsd, "ARS")} por los dólares
                  {perception > 0 ? ` + ${money(perception, "ARS")} de percepción (${card.usdPerceptionPct} %), que se anota como gasto en Impuestos: ${PERCEPTION_NOTE}.` : "."}
                </p>
              ) : null}
            </div>
          )}
          <p className="text-xs text-subtle">
            Si tenés débito automático, el banco cobra los dólares en pesos salvo que pidas stop debit.
          </p>
        </fieldset>
      ) : null}

      <div>
        <Label htmlFor={`pay-date-${card.id}`}>Fecha del pago</Label>
        <Input id={`pay-date-${card.id}`} type="date" className="mt-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {restArs > 0 || restUsd > 0 ? (
        <p role="status" className="rounded-lg bg-surface p-3 text-xs text-muted">
          Quedan sin pagar {restUsd > 0 && restArs > 0 ? `${money(restArs, "ARS")} + ${money(restUsd, "USD")}` : restArs > 0 ? money(restArs, "ARS") : money(restUsd, "USD")}.
          Pasa al próximo resumen como saldo financiado y el banco cobra intereses (más IVA), que se cargan en Intereses y
          comisiones cuando llega el resumen.
          {interest.total > 0
            ? ` Interés estimado con tu TNA de ${card.tna} %: ${money(interest.total, "ARS")} (${money(interest.interest, "ARS")} + IVA, ${interest.days} días).`
            : card.tna > 0
              ? ""
              : " Si cargás la TNA de la tarjeta en Ajustes, te muestro el interés estimado."}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1">
          Registrar pago
        </Button>
      </div>
    </form>
  );
}
