import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { amountInput, moneyARS, parseAmount } from "@/lib/format";
import { periodName } from "@/lib/card-pay";
import { MAX_MONTHS, type DebtStrategy, type Payoff } from "@/lib/plan/debt";
import { useDebtPlan } from "@/lib/plan/use-plan";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const STRATEGY: Record<DebtStrategy, { title: string; hint: string }> = {
  avalancha: { title: "Avalancha", hint: "Primero la tasa más alta" },
  bola: { title: "Bola de nieve", hint: "Primero el saldo más chico" },
};

function months(n: number) {
  return n === 1 ? "1 mes" : `${n} meses`;
}

function exit(p: Payoff, current: string) {
  if (p.months === null) return `Más de ${MAX_MONTHS / 12} años`;
  return p.end === current ? "Este mes" : `${periodName(p.end)} (${months(p.months)})`;
}

/**
 * Plan para bajar deudas (§2.2 `payoff`): saldos que quedan de los resúmenes y
 * cuotas que siguen, avalancha vs bola de nieve vs pagar el mínimo. Every
 * number comes from lib/plan/debt; nothing is saved.
 */
export function DebtPlanCard() {
  const [text, setText] = useState("");
  const typed = parseAmount(text);
  const { debts, suggested, comparison: c, today } = useDebtPlan(typed && typed > 0 ? typed : null);
  const [pick, setPick] = useState<DebtStrategy>("avalancha");
  if (!c || !debts.length) return null;
  const current = today.slice(0, 7);
  const balances = debts.filter((d) => d.balance >= 1);
  const balanceTotal = balances.reduce((s, d) => s + d.balance, 0);
  const cuotasTotal = debts.reduce((s, d) => s + d.cuotasTotal, 0);
  const cuotasEnd = debts.map((d) => d.cuotasEnd).filter(Boolean).sort().at(-1) ?? "";
  const names = (ids: string[]) => ids.map((id) => debts.find((d) => d.cardId === id)?.name ?? "").join(" → ");
  const chosen = c[pick];
  const short = chosen.shortFrom;

  return (
    <section
      id="deudas"
      className="scroll-mt-24 rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]"
    >
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Plan para bajar deudas</p>
      <p className="mt-1 font-display text-3xl tracking-tight">
        Debés {moneyARS(balanceTotal + cuotasTotal)}
      </p>
      <p className="mt-2 max-w-xl text-sm text-muted">
        {balanceTotal > 0
          ? `${moneyARS(balanceTotal)} de resúmenes sin pagar (${balances
              .map((d) => `${d.name} ${moneyARS(d.balance)}${d.overdue ? ", vencido" : ""}`)
              .join(" · ")})`
          : "Sin saldos de resúmenes por pagar"}
        {cuotasTotal > 0 ? ` y ${moneyARS(cuotasTotal)} en cuotas que siguen hasta ${periodName(cuotasEnd)}.` : "."}
        {" "}Supone que lo que compres de ahora en más lo pagás completo.
      </p>

      <label className="mt-4 grid max-w-xs gap-1 text-xs text-muted">
        Por mes podés poner en las tarjetas
        <Input
          inputMode="decimal"
          aria-label="Por mes para las tarjetas"
          value={text}
          placeholder={amountInput(c.budget)}
          onChange={(e) => setText(e.target.value)}
        />
        <span className="text-subtle">
          {text ? "" : `Propuesta: lo que sobra por mes más cuotas y mínimos (${moneyARS(suggested)}). `}
          Este mes, como mínimo: {moneyARS(c.mandatory)} (cuotas y mínimos).
        </span>
      </label>

      {balanceTotal > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(["avalancha", "bola"] as const).map((k) => {
            const p = c[k];
            const best = !c.same && k === "avalancha" && c.avalanchaSaves > 0;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={pick === k}
                onClick={() => setPick(k)}
                className={cn(
                  "grid gap-1 rounded-2xl px-4 py-3 text-left",
                  pick === k ? "bg-elevated shadow-[0_0_0_1px_rgba(244,244,240,0.18)]" : "bg-elevated/50",
                )}
              >
                <span className="text-sm font-medium">
                  {STRATEGY[k].title}
                  {best ? <span className="text-xs text-income"> · paga menos intereses</span> : null}
                </span>
                <span className="text-xs text-subtle">{STRATEGY[k].hint}{p.order.length > 1 ? `: ${names(p.order)}` : ""}</span>
                <span className="mt-1 text-sm">Salís: {exit(p, current)}</span>
                <span className="text-sm tabular-nums text-muted">Intereses estimados: {moneyARS(p.interest)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 grid gap-1 text-sm text-muted">
        {balanceTotal > 0 ? (
          c.same ? (
            <p>
              {balances.length > 1
                ? "Acá las dos estrategias coinciden: la tarjeta con la tasa más alta es también la de saldo más chico."
                : "Con un solo saldo, las dos estrategias son el mismo plan."}
            </p>
          ) : c.avalanchaSaves > 0 ? (
            <p>
              Avalancha te ahorra {moneyARS(c.avalanchaSaves)} de intereses. Bola de nieve cierra antes la{" "}
              {debts.find((d) => d.cardId === c.bola.order[0])?.name}, si eso te ayuda a seguir.
            </p>
          ) : (
            <p>Las dos estrategias cuestan lo mismo en intereses con este monto.</p>
          )
        ) : null}
        {balanceTotal > 0 ? (
          <p>
            Pagando solo el mínimo:{" "}
            {c.minimo.months === null
              ? `más de ${MAX_MONTHS / 12} años y más de ${moneyARS(c.minimo.interest)} de intereses.`
              : `salís en ${periodName(c.minimo.end)} y pagás ${moneyARS(c.minimo.interest)} de intereses.`}
          </p>
        ) : null}
        {short ? (
          <p className="text-warn">
            En {periodName(short)} no alcanza para cuotas y mínimos: lo que falte se financia y suma intereses.
          </p>
        ) : null}
        {c.missingTna.length ? (
          <p className="text-xs text-subtle">
            {c.missingTna.join(" y ")} sin TNA: no puedo estimar sus intereses.{" "}
            <Link to="/ajustes" hash="tarjetas" className="underline">
              Cargala en Ajustes
            </Link>
            .
          </p>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[320px] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-muted uppercase">
              <th className="py-1 font-medium">Mes</th>
              <th className="py-1 text-right font-medium">Cuotas</th>
              <th className="py-1 text-right font-medium">Saldos</th>
              <th className="py-1 text-right font-medium">Intereses</th>
              <th className="py-1 text-right font-medium">Queda</th>
            </tr>
          </thead>
          <tbody>
            {chosen.schedule.slice(0, 12).map((m) => (
              <tr key={m.ym} className={cn("border-t border-white/5", m.short && "text-warn")}>
                <td className="py-1.5 capitalize">{periodName(m.ym).split(" ")[0]}</td>
                <td className="py-1.5 text-right">{moneyARS(m.cuotas)}</td>
                <td className="py-1.5 text-right">{moneyARS(m.balances)}</td>
                <td className="py-1.5 text-right">{moneyARS(m.interest)}</td>
                <td className="py-1.5 text-right">{moneyARS(m.left)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-subtle">
          Intereses estimados con la TNA de cada tarjeta más IVA; el resumen del banco manda. Mínimo
          estimado: intereses del mes más el 5 % del saldo (el primer mes, el del banco si lo importaste).
        </p>
      </div>
    </section>
  );
}
