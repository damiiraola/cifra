/**
 * Avisos sin IA (§2.4): rules over the user's own numbers. Pure. Each alert has
 * a stable id that includes its period, so hiding one does not hide next
 * month's.
 */
import { money } from "../format.ts";
import { accountBalance } from "../books.ts";
import {
  closingOf,
  dueOf,
  limitUse,
  periodForCard,
  shiftPeriod,
  upcomingStatements,
} from "../card-math.ts";
import { estimatedInterest, lastClosedBalance, perceptionFor, periodName } from "../card-pay.ts";
import { round0, type PlanData } from "./cashflow.ts";
import type { GoalLine } from "./goal-plan.ts";

export type AlertTone = "bad" | "warn" | "info";

export type PlanAlert = {
  id: string;
  tone: AlertTone;
  text: string;
  to: "/tarjetas" | "/presupuestos" | "/metas";
};

export type AlertInput = PlanData & {
  /** Categories with a tope the user set (current month). */
  budgetRows: { id: string; name: string; spent: number; budget: number }[];
  /** Tope of the month, 0 = none. */
  globalBudget: number;
  /** Spent this month and the pace projection (lib/analytics computeMonth). */
  monthSpent: number;
  projected: number;
  goals: GoalLine[];
};

const ORDER: Record<AlertTone, number> = { bad: 0, warn: 1, info: 2 };

function days(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function dm(iso: string) {
  return `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
}

function when(today: string, iso: string) {
  const n = days(today, iso);
  return n === 0 ? "hoy" : n === 1 ? "mañana" : `el ${dm(iso)}`;
}

function both(ars: number, usd: number) {
  if (ars > 0 && usd > 0) return `${money(ars, "ARS")} + ${money(usd, "USD")}`;
  return usd > 0 ? money(usd, "USD") : money(ars, "ARS");
}

function monthOnly(ym: string) {
  return periodName(ym).split(" ")[0]!;
}

export function cardAlerts(input: AlertInput): PlanAlert[] {
  const { today, txs, statements, accounts, rates } = input;
  const out: PlanAlert[] = [];
  const usdOwn = accounts
    .filter((a) => !a.archived && a.kind !== "card" && a.currency === "USD")
    .reduce((s, a) => s + Math.max(0, accountBalance(a, txs)), 0);
  for (const card of input.cards) {
    const open = periodForCard(today, card, statements);
    const closing = closingOf(card, open, statements);
    const toClose = days(today, closing);
    if (toClose >= 0 && toClose <= 3) {
      const nextDue = dueOf(card, shiftPeriod(open, 1), statements);
      out.push({
        id: `cierre:${card.id}:${open}`,
        tone: "info",
        text: `La ${card.name} cierra ${when(today, closing)}. Lo que compres después lo pagás recién en ${monthOnly(nextDue.slice(0, 7))}.`,
        to: "/tarjetas",
      });
    }

    const st = lastClosedBalance(card, txs, today, statements, accounts);
    const leftTotal = round0(st.leftArs + st.leftUsd * rates.usd);
    if (st.leftArs > 0 || st.leftUsd > 0) {
      const nextClosing = closingOf(card, shiftPeriod(st.period, 1), statements);
      const cost = estimatedInterest(leftTotal, card.tna, st.due, nextClosing).total;
      const costText =
        cost > 0 ? ` Estimado de intereses: ${money(cost, "ARS")} hasta el próximo cierre.` : "";
      const toDue = days(today, st.due);
      if (st.minimumCovered) {
        out.push({
          id: `minimo:${card.id}:${st.period}`,
          tone: "warn",
          text: `Pagaste el mínimo de la ${card.name}. Lo que queda (${both(st.leftArs, st.leftUsd)}) se financia.${costText}`,
          to: "/tarjetas",
        });
      } else if (toDue < 0) {
        out.push({
          id: `vencido:${card.id}:${st.period}`,
          tone: "bad",
          text: `Venció el resumen de ${monthOnly(st.period)} de la ${card.name}: quedan ${both(st.leftArs, st.leftUsd)}. Lo que no pagues se financia.${costText}`,
          to: "/tarjetas",
        });
      } else if (toDue <= 5) {
        const min = st.minimumArs > 0 ? ` (mínimo ${money(st.minimumArs, "ARS")})` : "";
        let short = "";
        const from = accounts.find((a) => a.id === card.payAccountId && a.currency === "ARS");
        if (from && st.leftArs > 0) {
          const have = round0(accountBalance(from, txs));
          if (have < st.leftArs)
            short = ` En ${from.name} tenés ${money(Math.max(0, have), "ARS")}: te faltan ${money(st.leftArs - Math.max(0, have), "ARS")}.`;
        }
        out.push({
          id: `vence:${card.id}:${st.period}`,
          tone: "warn",
          text: `El resumen de la ${card.name} vence ${when(today, st.due)}: ${both(st.leftArs, st.leftUsd)}${min}.${short}`,
          to: "/tarjetas",
        });
      }
      if (st.leftUsd > 0 && usdOwn >= 0.01 && toDue >= -31) {
        const usd = Math.min(st.leftUsd, usdOwn);
        const saved = perceptionFor(usd, rates.usd, card.usdPerceptionPct);
        if (saved > 0)
          out.push({
            id: `usd:${card.id}:${st.period}`,
            tone: "info",
            text: `Si pagás ${money(usd, "USD")} de la ${card.name} con tus dólares, no pagás ${money(saved, "ARS")} de percepción.`,
            to: "/tarjetas",
          });
      }
    }

    const ars = accounts.find((a) => a.id === card.accountArsId);
    const usdAcc = accounts.find((a) => a.id === card.accountUsdId);
    const debtArs = ars ? Math.max(0, -accountBalance(ars, txs)) : 0;
    const debtUsd = usdAcc ? Math.max(0, -accountBalance(usdAcc, txs)) : 0;
    const limit = limitUse(card, debtArs, debtUsd, rates.usd);
    if (limit && limit.pct >= 0.8) {
      out.push({
        id: `limite:${card.id}:${open}`,
        tone: limit.pct >= 1 ? "bad" : "warn",
        text:
          limit.pct >= 1
            ? `Pasaste el límite de la ${card.name}: usás ${money(limit.used, "ARS")} de ${money(limit.limit, "ARS")}.`
            : `Usás el ${Math.round(limit.pct * 100)} % del límite de la ${card.name}: te quedan ${money(limit.free, "ARS")}.`,
        to: "/tarjetas",
      });
    }

    const upcoming = upcomingStatements(card, txs, input.recurrings, today, 3, statements);
    const fresh = txs.filter(
      (t) =>
        t.purchaseId &&
        t.installmentNo === 1 &&
        t.installmentCount > 1 &&
        t.cardPeriod === open &&
        (t.accountId === card.accountArsId || t.accountId === card.accountUsdId),
    );
    if (fresh.length) {
      const arsSum = fresh
        .filter((t) => t.accountId === card.accountArsId)
        .reduce((s, t) => s + t.amount, 0);
      const usdSum = fresh
        .filter((t) => t.accountId === card.accountUsdId)
        .reduce((s, t) => s + t.amount, 0);
      const n = fresh.length;
      out.push({
        id: `cuotas-nuevas:${card.id}:${open}`,
        tone: "info",
        text: `En el resumen de ${monthOnly(open)} de la ${card.name} ${n === 1 ? "arranca 1 compra" : `arrancan ${n} compras`} en cuotas: ${both(round0(arsSum), Math.round(usdSum * 100) / 100)} más por mes.`,
        to: "/tarjetas",
      });
    }
    const ending = upcoming.find((u) => u.ending.count > 0);
    if (ending) {
      const after = shiftPeriod(ending.period, 1);
      const n = ending.ending.count;
      out.push({
        id: `cuotas-fin:${card.id}:${ending.period}`,
        tone: "info",
        text: `En el resumen de ${monthOnly(ending.period)} de la ${card.name} ${n === 1 ? "termina 1 compra" : `terminan ${n} compras`} en cuotas: desde ${monthOnly(after)} son ${both(ending.ending.ars, ending.ending.usd)} menos por mes.`,
        to: "/tarjetas",
      });
    }
  }
  return out;
}

export function budgetAlerts(input: AlertInput): PlanAlert[] {
  const ym = input.today.slice(0, 7);
  const day = Number(input.today.slice(8, 10));
  const out: PlanAlert[] = [];
  const rows = input.budgetRows
    .filter((r) => r.budget > 0 && r.spent >= r.budget * 0.8)
    .sort((a, b) => b.spent / b.budget - a.spent / a.budget);
  for (const r of rows) {
    if (r.spent > r.budget) {
      out.push({
        id: `tope:${r.id}:${ym}`,
        tone: "bad",
        text: `Pasaste el tope de ${r.name}: ${money(round0(r.spent), "ARS")} de ${money(r.budget, "ARS")}.`,
        to: "/presupuestos",
      });
    } else if (day < 20) {
      const last = new Date(
        Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0),
      ).getUTCDate();
      out.push({
        id: `tope80:${r.id}:${ym}`,
        tone: "warn",
        text: `Llevás el ${Math.floor((r.spent / r.budget) * 100)} % de ${r.name} y faltan ${last - day} días.`,
        to: "/presupuestos",
      });
    }
  }
  const capped = out.slice(0, 2);
  if (
    input.globalBudget > 0 &&
    input.monthSpent <= input.globalBudget &&
    input.projected > input.globalBudget * 1.05
  ) {
    capped.push({
      id: `ritmo:${ym}`,
      tone: "warn",
      text: `A este ritmo terminás el mes en ${money(round0(input.projected), "ARS")}, ${money(round0(input.projected - input.globalBudget), "ARS")} arriba del tope.`,
      to: "/presupuestos",
    });
  }
  return capped;
}

export function goalAlerts(input: AlertInput): PlanAlert[] {
  const ym = input.today.slice(0, 7);
  return input.goals
    .filter((g) => g.onTrack === false)
    .map((g) => ({
      id: `meta:${g.goal.id}:${ym}`,
      tone: "warn" as const,
      text: g.eta
        ? `${g.goal.name}: con lo que sobra por mes llegás en ${periodName(g.eta)}, no en ${periodName(g.goal.deadline.slice(0, 7))}. Hacen falta ${money(g.needed, g.goal.currency)} por mes.`
        : `${g.goal.name}: con lo que entra y sale no sobra para la meta. Hacen falta ${money(g.needed, g.goal.currency)} por mes.`,
      to: "/metas" as const,
    }));
}

/** All alerts, worst first. */
export function planAlerts(input: AlertInput): PlanAlert[] {
  return [...cardAlerts(input), ...budgetAlerts(input), ...goalAlerts(input)]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => ORDER[x.a.tone] - ORDER[y.a.tone] || x.i - y.i)
    .map((x) => x.a);
}
