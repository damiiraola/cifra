/**
 * Plan de un mes normal y palancas cuando no cierra (§2.4). Pure, sin IA.
 *
 *   Entra − ya comprometido (fijos + tarjetas) − metas = queda para el día a día
 *   cierra si eso alcanza para lo que gastás normalmente en el día a día.
 */
import type { Goal, GoalPriority } from "../goals.ts";
import { roundGoal } from "../goals.ts";
import { addMonths, round0, type Cashflow, type Rates } from "./cashflow.ts";
import { goalPlan, monthsUntil, type GoalLine } from "./goal-plan.ts";
import type { BudgetSuggestion } from "./budgets.ts";
import { money } from "../format.ts";

export type MonthPlan = {
  /** Typical month: average of the next full months. */
  income: number;
  fijos: number;
  /** Card statements already known (cuotas, fijos on the card). */
  cards: number;
  committed: number;
  /** Monthly need of goals with a date, highest priority first. */
  goals: { id: string; name: string; priority: GoalPriority; needArs: number }[];
  goalsTotal: number;
  /** Income − committed − goals. */
  dayToDay: number;
  /** What you usually spend day to day (cash + credit, median). */
  usual: number;
  /** dayToDay − usual: ≥ 0 closes. */
  gap: number;
  closes: boolean;
};

function avg(values: number[]) {
  return values.length ? round0(values.reduce((s, v) => s + v, 0) / values.length) : 0;
}

export function monthPlan(flow: Cashflow, lines: GoalLine[]): MonthPlan {
  const full = flow.months.length > 1 ? flow.months.slice(1, 4) : flow.months;
  const income = avg(full.map((m) => m.totalIn));
  const fijos = avg(full.map((m) => m.out.fijos));
  const cards = avg(full.map((m) => m.cardsKnown));
  const committed = fijos + cards;
  const goals = lines
    .filter((l) => l.months > 0 && l.neededArs > 0)
    .map((l) => ({
      id: l.goal.id,
      name: l.goal.name,
      priority: l.goal.priority,
      needArs: l.neededArs,
    }));
  const goalsTotal = goals.reduce((s, g) => s + g.needArs, 0);
  const dayToDay = income - committed - goalsTotal;
  const usual = round0(flow.history.cashVariable + flow.history.cardVariable);
  const gap = dayToDay - usual;
  return {
    income,
    fijos,
    cards,
    committed,
    goals,
    goalsTotal,
    dayToDay,
    usual,
    gap,
    closes: gap >= 0,
  };
}

export type Lever =
  | { kind: "recorte"; id: string; text: string; freed: number }
  | {
      kind: "fecha";
      id: string;
      text: string;
      goalId: string;
      deadline: string;
      /** Set when the date alone would be too far: also lower the amount. */
      target?: number;
    }
  | { kind: "monto"; id: string; text: string; goalId: string; target: number }
  | { kind: "prioridad"; id: string; text: string; goalId: string; priority: GoalPriority };

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function monthName(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

function lastDay(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/** Same day of the month as the old deadline, in `ym` (clamped to its last day). */
export function moveDeadline(deadline: string, ym: string) {
  const day = Math.min(Number(deadline.slice(8, 10)) || 1, lastDay(ym));
  return `${ym}-${String(day).padStart(2, "0")}`;
}

/** Never propose a date further than this from today, whatever the goal. */
export const MAX_MOVE_MONTHS_FROM_TODAY = 60;

/**
 * Latest month a goal's date may be moved to (YYYY-MM): one more year, or
 * double the time it had, whichever is longer, and never more than
 * MAX_MOVE_MONTHS_FROM_TODAY from today. Past that the new date is not a plan.
 */
export function latestMove(today: string, deadline: string) {
  const current = today.slice(0, 7);
  const from = deadline && deadline.slice(0, 7) > current ? deadline.slice(0, 7) : current;
  const extra = Math.max(12, deadline ? monthsUntil(today, deadline) : 0);
  const byGoal = addMonths(from, extra);
  const ceiling = addMonths(current, MAX_MOVE_MONTHS_FROM_TODAY);
  return byGoal < ceiling ? byGoal : ceiling;
}

function niceDown(n: number, currency: Goal["currency"]) {
  const step = currency === "ARS" ? (n >= 100_000 ? 10_000 : 1000) : n >= 1000 ? 50 : 10;
  return roundGoal(Math.floor(n / step) * step, currency);
}

/**
 * Ways to make the plan close, each computed: trim categories (the suggested
 * topes), and for every goal that does not arrive on time: move its date to
 * when it does arrive (if that is too far, see latestMove, move it to the
 * latest sensible month and lower the amount to what it reaches by then),
 * lower its amount to what it reaches by the date, or raise its priority when
 * that alone makes it arrive.
 */
export function planLevers(input: {
  plan: MonthPlan;
  lines: GoalLine[];
  goals: Goal[];
  surplus: number;
  suggestion: BudgetSuggestion;
  today: string;
  rates: Rates;
}): Lever[] {
  const { plan, lines, suggestion } = input;
  const out: Lever[] = [];
  const short = -plan.gap;
  if (!plan.closes && suggestion.freed > 0) {
    const top = suggestion.rows
      .filter((r) => r.cut > 0)
      .sort((a, b) => b.cut - a.cut)
      .slice(0, 3)
      .map((r) => `${r.name} ${money(r.cut, "ARS")}`)
      .join(", ");
    const rest = short - suggestion.freed;
    out.push({
      kind: "recorte",
      id: "recorte",
      freed: suggestion.freed,
      text: `Recortar el día a día (${top}): liberás ${money(suggestion.freed, "ARS")} por mes${
        rest > 0 ? ` y siguen faltando ${money(rest, "ARS")}` : " y alcanza"
      }.`,
    });
  }
  for (const line of lines) {
    if (line.onTrack !== false) continue;
    const g = line.goal;
    const latest = latestMove(input.today, g.deadline);
    if (line.eta && line.eta <= latest) {
      out.push({
        kind: "fecha",
        id: `fecha:${g.id}`,
        goalId: g.id,
        deadline: moveDeadline(g.deadline, line.eta),
        text: `Mover ${g.name} a ${monthName(line.eta)}: con lo que sobra hoy llega para esa fecha.`,
      });
    } else if (line.eta) {
      // The full amount arrives too late to be a plan: offer the latest
      // sensible date with what you do reach by then.
      const deadline = moveDeadline(g.deadline, latest);
      const months = monthsUntil(input.today, deadline);
      const reachLate = niceDown(g.saved + line.assigned * months, g.currency);
      if (reachLate > g.saved && reachLate < g.target) {
        out.push({
          kind: "fecha",
          id: `fecha:${g.id}`,
          goalId: g.id,
          deadline,
          target: reachLate,
          text: `Mover ${g.name} a ${monthName(latest)} y bajarla a ${money(reachLate, g.currency)}: es lo que llegás a juntar para entonces. El total recién llegaría en ${monthName(line.eta)}.`,
        });
      }
    }
    const reach = niceDown(g.saved + line.assigned * line.months, g.currency);
    if (reach > g.saved && reach < g.target) {
      out.push({
        kind: "monto",
        id: `monto:${g.id}`,
        goalId: g.id,
        target: reach,
        text: `Bajar ${g.name} a ${money(reach, g.currency)}: es lo que llegás a juntar para ${monthName(g.deadline.slice(0, 7))}.`,
      });
    }
    // Stretch a goal that does arrive (same or higher priority) so this one fits.
    const missing = line.neededArs - line.assignedArs;
    for (const other of lines) {
      if (other.goal.id === g.id || other.onTrack !== true || other.goal.priority > g.priority)
        continue;
      const rest = other.neededArs - missing;
      if (!(rest > 0) || !(missing > 0)) continue;
      const months = Math.ceil(other.leftArs / rest - 1e-9);
      const ym = addMonths(input.today.slice(0, 7), months);
      if (ym <= other.goal.deadline.slice(0, 7)) continue;
      if (ym > latestMove(input.today, other.goal.deadline)) continue;
      out.push({
        kind: "fecha",
        id: `fecha:${other.goal.id}:por:${g.id}`,
        goalId: other.goal.id,
        deadline: moveDeadline(other.goal.deadline, ym),
        text: `Mover ${other.goal.name} a ${monthName(ym)}: libera ${money(missing, "ARS")} por mes y ${g.name} llega a tiempo.`,
      });
      break;
    }
    if (g.priority > 1) {
      const raised = input.goals.map((x) => (x.id === g.id ? { ...x, priority: 1 as const } : x));
      const next = goalPlan(raised, input.surplus, input.today, input.rates);
      const mine = next.find((l) => l.goal.id === g.id);
      if (mine?.onTrack) {
        const hurt = next
          .filter((l) => l.goal.id !== g.id && l.onTrack === false)
          .filter((l) => lines.find((o) => o.goal.id === l.goal.id)?.onTrack !== false)
          .map((l) => l.goal.name);
        out.push({
          kind: "prioridad",
          id: `prioridad:${g.id}`,
          goalId: g.id,
          priority: 1,
          text: `Pasar ${g.name} a prioridad alta: llega a tiempo${hurt.length ? `, pero se atrasa ${hurt.join(" y ")}` : ""}.`,
        });
      }
    }
  }
  return out;
}
