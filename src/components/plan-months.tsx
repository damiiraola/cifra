import { Link } from "@tanstack/react-router";
import { money, moneyARS } from "@/lib/format";
import { periodName } from "@/lib/card-pay";
import type { Cashflow } from "@/lib/plan/cashflow";
import { cn } from "@/lib/utils";

function dm(iso: string) {
  return `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
}

function both(ars: number, usd: number) {
  if (ars > 0 && usd > 0) return `${money(ars, "ARS")} + ${money(usd, "USD")}`;
  return usd > 0 ? money(usd, "USD") : money(ars, "ARS");
}

function signed(n: number) {
  return n < 0 ? `−${moneyARS(-n)}` : `+${moneyARS(n)}`;
}

/** Próximos meses: entra, sale (fijos, tarjetas, día a día) y queda. All numbers from lib/plan. */
export function PlanMonths({ flow, surplus }: { flow: Cashflow; surplus: number }) {
  const full = flow.months.slice(1, 4);
  const avgNet = full.length ? Math.round(full.reduce((s, m) => s + m.net, 0) / full.length) : 0;
  const hist = flow.history.months.length;
  return (
    <section
      id="plan"
      className="scroll-mt-24 rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]"
    >
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
        Los próximos meses
      </p>
      <p className="mt-1 font-display text-3xl tracking-tight">
        {surplus > 0
          ? `Te sobran unos ${moneyARS(surplus)} por mes`
          : avgNet < 0
            ? `Faltan unos ${moneyARS(-avgNet)} por mes`
            : "No sobra"}
      </p>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Hoy tenés {moneyARS(flow.startBalance)} en tus cajas (sin contar tarjetas). La cuenta usa
        tus fijos, los resúmenes de tarjeta que vienen (con las cuotas) y lo que gastás en un mes
        normal
        {hist
          ? ` (${hist === 1 ? "lo del último mes" : `la mediana de los últimos ${hist} meses`})`
          : ""}
        .
      </p>
      {flow.months.every((m) => m.totalIn === 0) ? (
        <p className="mt-1 max-w-xl text-sm text-subtle">
          No hay ingresos cargados: sumá tu sueldo como fijo en{" "}
          <Link to="/ajustes" hash="fijos" className="underline">
            Ajustes
          </Link>{" "}
          y la cuenta va a tener lo que entra.
        </p>
      ) : null}
      {hist === 0 ? (
        <p className="mt-1 max-w-xl text-sm text-subtle">
          Todavía no hay un mes completo cargado: el gasto del día a día cuenta como cero hasta que
          lo haya.
        </p>
      ) : null}
      <div className="mt-4 grid gap-3">
        {flow.months.map((m, i) => (
          <details key={m.ym} className="group rounded-2xl bg-elevated px-4 py-3">
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3">
              <span className="text-sm capitalize">
                {periodName(m.ym).split(" ")[0]}
                {i === 0 ? <span className="text-subtle normal-case"> · este mes</span> : null}
              </span>
              <span
                className={cn("text-sm tabular-nums", m.net < 0 ? "text-expense" : "text-income")}
              >
                {signed(m.net)}
              </span>
            </summary>
            <div className="mt-3 grid gap-1 text-sm">
              <p className="flex justify-between gap-3">
                <span className="text-muted">Entra</span>
                <span className="tabular-nums">{moneyARS(m.totalIn)}</span>
              </p>
              {i === 0 && m.outSoFar > 0 ? (
                <p className="flex justify-between gap-3">
                  <span className="text-muted">Ya salió</span>
                  <span className="tabular-nums">{moneyARS(m.outSoFar)}</span>
                </p>
              ) : null}
              <p className="flex justify-between gap-3">
                <span className="text-muted">Fijos{i === 0 ? " que faltan" : ""}</span>
                <span className="tabular-nums">{moneyARS(m.out.fijos)}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span className="text-muted">Tarjetas a pagar</span>
                <span className="tabular-nums">{moneyARS(m.out.cards)}</span>
              </p>
              {m.cards.map((b) => (
                <p
                  key={`${b.cardId}-${b.period}`}
                  className="flex justify-between gap-3 pl-3 text-xs text-subtle"
                >
                  <span>
                    {b.cardName} · {b.overdue ? `venció el ${dm(b.due)}` : `vence el ${dm(b.due)}`}
                    {b.closed ? "" : " · lo cargado hasta hoy"}
                  </span>
                  <span className="tabular-nums">{both(b.ars, b.usd)}</span>
                </p>
              ))}
              {m.out.cards > m.cards.reduce((s, b) => s + b.totalArs, 0) ? (
                <p className="pl-3 text-xs text-subtle">
                  Incluye lo que solés gastar con crédito en un mes.
                </p>
              ) : null}
              <p className="flex justify-between gap-3">
                <span className="text-muted">Día a día{i === 0 ? " que falta" : ""}</span>
                <span className="tabular-nums">{moneyARS(m.out.variable)}</span>
              </p>
              <p className="mt-1 flex justify-between gap-3">
                <span className="text-muted">En tus cajas a fin de mes</span>
                <span className={cn("tabular-nums", m.endBalance < 0 && "text-expense")}>
                  {moneyARS(m.endBalance)}
                </span>
              </p>
            </div>
          </details>
        ))}
      </div>
      <p className="mt-3 text-xs text-subtle">
        Montos en pesos de hoy, dólares al cambio de hoy. Cifra no adivina la inflación.
      </p>
    </section>
  );
}
