/**
 * Read-only tools of the assistant (§2.7). Each one runs Cifra's own engine
 * (src/lib/plan, cards, goals) and returns a small JSON where every number is
 * a fact id ("f3") with its formatted value in `valores`, plus a plain summary
 * Cifra can show if the model fails. Tools never write: changes are returned
 * as proposals the user confirms with a button. Pure, sin IA.
 */
import type { Goal, GoalPriority } from "../goals.ts";
import type { Account, Category, Currency } from "../types.ts";
import { accountBalance, accountLabel } from "../books.ts";
import { closingOf, dueOf, limitUse, periodForCard } from "../card-math.ts";
import { lastClosedBalance } from "../card-pay.ts";
import { money } from "../format.ts";
import {
  addMonths,
  cardBills,
  monthlySurplus,
  pendingFijos,
  projectCashflow,
  round0,
  txArs,
  type PlanData,
} from "../plan/cashflow.ts";
import { goalPlan } from "../plan/goal-plan.ts";
import { committedByCategory, suggestBudgets } from "../plan/budgets.ts";
import { monthPlan, planLevers } from "../plan/month-plan.ts";
import { cardDebts, compareDebtPlans, minimumFor, suggestedDebtBudget } from "../plan/debt.ts";
import { simulate, type Scenario } from "../plan/simulate.ts";
import { Facts, dayLabel, monthLabel } from "./facts.ts";

/** Everything the tools read, for one book. */
export type AssistantData = {
  plan: PlanData;
  goals: Goal[];
  categories: Pick<Category, "id" | "name" | "kind">[];
  /** Topes the user set for this book (category id → ARS). */
  topes: Record<string, number>;
};

export type Proposal =
  | {
      id: string;
      kind: "aplicar_topes";
      label: string;
      topes: { id: string; name: string; tope: number }[];
    }
  | {
      id: string;
      kind: "meta";
      label: string;
      goalId: string;
      deadline?: string;
      target?: number;
      priority?: GoalPriority;
    }
  | {
      id: string;
      kind: "compra_cuotas";
      label: string;
      cardId: string;
      amount: number;
      installments: number;
      interestFree: boolean;
      what: string;
    }
  | {
      id: string;
      kind: "gasto";
      label: string;
      accountId: string;
      amount: number;
      currency: Currency;
      card: boolean;
    };

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ProposalInput = DistOmit<Proposal, "id">;

export type ToolResult = {
  /** Sent to the model: numbers only as fact ids, their values in `valores`. */
  data: Record<string, unknown>;
  /** Plain Spanish built by Cifra (template answer if the model fails). */
  summary: string;
};

export class ToolRun {
  readonly facts: Facts;
  readonly proposals: Proposal[] = [];
  readonly summaries: string[] = [];
  readonly data: AssistantData;
  constructor(data: AssistantData) {
    this.data = data;
    this.facts = new Facts(data.plan.today.slice(0, 4));
  }
  propose(p: ProposalInput): string {
    const id = `p${this.proposals.length + 1}`;
    this.proposals.push({ ...p, id });
    return id;
  }
}

// ------------------------------------------------------------------ helpers

export function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findByName<T>(list: T[], name: unknown, label: (t: T) => string): T | undefined {
  const q = typeof name === "string" ? norm(name) : "";
  if (!q) return undefined;
  return (
    list.find((t) => norm(label(t)) === q) ??
    list.find((t) => norm(label(t)).includes(q)) ??
    list.find((t) => q.includes(norm(label(t))))
  );
}

const PRIORITY: Record<GoalPriority, string> = { 1: "alta", 2: "media", 3: "baja" };

function catName(d: AssistantData, id: string) {
  return d.categories.find((c) => c.id === id)?.name ?? id;
}

function monthSpend(d: AssistantData, ym: string) {
  const byCat: Record<string, number> = {};
  let spent = 0;
  let earned = 0;
  for (const t of d.plan.txs) {
    if (!t.date.startsWith(ym)) continue;
    if (t.type === "expense") {
      const v = txArs(t, d.plan.rates);
      spent += v;
      byCat[t.categoryId] = (byCat[t.categoryId] ?? 0) + v;
    } else if (t.type === "income") earned += txArs(t, d.plan.rates);
  }
  return { spent: round0(spent), earned: round0(earned), byCat };
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

function cajas(d: AssistantData): Account[] {
  const cardIds = new Set(d.plan.cards.flatMap((c) => [c.accountArsId, c.accountUsdId]));
  return d.plan.accounts.filter(
    (a) => !a.archived && !cardIds.has(a.id) && a.bookId === d.plan.bookId,
  );
}

// -------------------------------------------------------------------- tools

function resumenMes(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const d = run.data;
  const f = run.facts;
  const current = d.plan.today.slice(0, 7);
  const ym =
    typeof args.mes === "string" && /^\d{4}-\d{2}$/.test(args.mes) && args.mes <= current
      ? args.mes
      : current;
  const cur = monthSpend(d, ym);
  const prev = monthSpend(d, addMonths(ym, -1));
  const isCurrent = ym === current;
  const elapsed = isCurrent ? Number(d.plan.today.slice(8, 10)) : daysInMonth(ym);
  const projected =
    isCurrent && elapsed > 0 ? round0((cur.spent / elapsed) * daysInMonth(ym)) : cur.spent;
  const top = Object.entries(cur.byCat)
    .filter(([, v]) => v >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const categorias = top.map(([id, v]) => {
    const tope = d.topes[id] ?? 0;
    const before = prev.byCat[id] ?? 0;
    return {
      categoria: catName(d, id),
      gastado: f.ars(v),
      ...(tope > 0 ? { tope: f.ars(tope), usado: f.pct(v / tope), pasado: v > tope } : {}),
      ...(before >= 1 ? { mes_anterior: f.ars(before) } : {}),
    };
  });
  const data = {
    mes: f.month(ym),
    entro: f.ars(cur.earned),
    gastado: f.ars(cur.spent),
    neto: f.ars(cur.earned - cur.spent),
    ...(isCurrent
      ? { proyeccion_gasto_mes: f.ars(projected), dias_pasados: f.count(elapsed, "día", "días") }
      : {}),
    gastado_mes_anterior: f.ars(prev.spent),
    categorias,
  };
  const topText = top
    .slice(0, 3)
    .map(([id, v]) => `${catName(d, id)} ${money(round0(v), "ARS")}`)
    .join(", ");
  const summary = `En ${monthLabel(ym)} entraron ${money(cur.earned, "ARS")} y gastaste ${money(cur.spent, "ARS")}${
    topText ? ` (lo que más: ${topText})` : ""
  }. El mes anterior gastaste ${money(prev.spent, "ARS")}.`;
  return { data, summary };
}

function tendenciaCategoria(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const d = run.data;
  const f = run.facts;
  const cat =
    d.categories.find((c) => c.id === args.categoria) ??
    findByName(d.categories, args.categoria, (c) => c.name);
  if (!cat) {
    return {
      data: {
        error: "No encontré esa categoría.",
        categorias: d.categories.filter((c) => c.kind === "expense").map((c) => c.name),
      },
      summary: "No encontré esa categoría.",
    };
  }
  const n = Math.max(1, Math.min(6, Math.round(Number(args.meses) || 3)));
  const current = d.plan.today.slice(0, 7);
  const rows = [];
  const parts: string[] = [];
  for (let i = n; i >= 0; i--) {
    const ym = addMonths(current, -i);
    const v = round0(monthSpend(d, ym).byCat[cat.id] ?? 0);
    rows.push({ mes: f.month(ym), gastado: f.ars(v), en_curso: i === 0 });
    parts.push(`${monthLabel(ym)} ${money(v, "ARS")}`);
  }
  const tope = d.topes[cat.id] ?? 0;
  return {
    data: { categoria: cat.name, meses: rows, ...(tope > 0 ? { tope: f.ars(tope) } : {}) },
    summary: `${cat.name}: ${parts.join(", ")}.`,
  };
}

function tarjetas(run: ToolRun): ToolResult {
  const d = run.data;
  const f = run.facts;
  const p = d.plan;
  if (!p.cards.length)
    return {
      data: { tarjetas: [], nota: "No hay tarjetas cargadas." },
      summary: "No tenés tarjetas cargadas.",
    };
  const bills = cardBills(p, 3);
  const out = [];
  const parts: string[] = [];
  for (const card of p.cards) {
    const st = lastClosedBalance(card, p.txs, p.today, p.statements, p.accounts);
    const leftArs = round0(st.leftArs + st.leftUsd * (p.rates.usd > 0 ? p.rates.usd : 0));
    const open = periodForCard(p.today, card, p.statements);
    const next = bills.find((b) => b.cardId === card.id && !b.closed);
    const debtNow = bills.filter((b) => b.cardId === card.id).reduce((s, b) => s + b.totalArs, 0);
    const lim = limitUse(card, debtNow, 0, p.rates.usd);
    const minimo = minimumFor(leftArs, 0, st.minimumArs > 0 ? st.minimumArs : 0, true);
    out.push({
      nombre: card.name,
      resumen_cerrado: {
        a_pagar: f.ars(leftArs),
        ...(st.leftUsd > 0 ? { incluye_usd: f.money(st.leftUsd, "USD") } : {}),
        vence: f.day(st.due),
        vencido: leftArs >= 1 && st.due < p.today,
        ...(leftArs >= 1 ? { minimo: f.ars(minimo), minimo_es_del_banco: st.minimumArs > 0 } : {}),
      },
      proximo_cierre: f.day(closingOf(card, open, p.statements)),
      proximo_resumen: next
        ? { cargado_hasta_hoy: f.ars(next.totalArs), vence: f.day(next.due) }
        : { cargado_hasta_hoy: f.ars(0), vence: f.day(dueOf(card, open, p.statements)) },
      ...(card.tna > 0 ? { tna: f.rate(card.tna) } : {}),
      ...(lim ? { limite: f.ars(lim.limit), limite_usado: f.pct(lim.pct) } : {}),
    });
    parts.push(
      leftArs >= 1
        ? `${card.name}: ${st.due < p.today ? "venció" : "vence"} el ${dayLabel(st.due)} con ${money(leftArs, "ARS")} a pagar`
        : `${card.name}: nada a pagar del último resumen; el próximo lleva ${money(next?.totalArs ?? 0, "ARS")}`,
    );
  }
  return { data: { tarjetas: out }, summary: `${parts.join(". ")}.` };
}

function proximos(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const d = run.data;
  const f = run.facts;
  const p = d.plan;
  const days = Math.max(1, Math.min(45, Math.round(Number(args.dias) || 30)));
  const until = new Date(Date.parse(`${p.today}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const items: { fecha: string; que: string; monto: string; tipo: string; _date: string }[] = [];
  for (const b of cardBills(p, 3)) {
    if (b.due > until || (b.due < p.today && !b.overdue)) continue;
    items.push({
      _date: b.due,
      fecha: f.day(b.due),
      que: `Resumen ${b.cardName}${b.overdue ? " (vencido)" : ""}`,
      monto: f.ars(b.totalArs),
      tipo: "tarjeta",
    });
  }
  const months = [p.today.slice(0, 7), addMonths(p.today.slice(0, 7), 1)];
  for (const ym of months) {
    for (const type of ["expense", "income"] as const) {
      for (const fx of pendingFijos(p, ym, type)) {
        if (fx.date < p.today || fx.date > until) continue;
        items.push({
          _date: fx.date,
          fecha: f.day(fx.date),
          que: fx.name,
          monto: f.ars(fx.amount),
          tipo: type === "income" ? "fijo que entra" : "fijo que sale",
        });
      }
    }
  }
  items.sort((a, b) => a._date.localeCompare(b._date));
  const list = items.slice(0, 12);
  const summary = list.length
    ? `Próximos ${days} días: ${items
        .slice(0, 6)
        .map((i) => `${i.que} el ${dayLabel(i._date)} (${run.facts.get(i.monto)})`)
        .join(", ")}.`
    : `No hay vencimientos ni fijos en los próximos ${days} días.`;
  return {
    data: { dias: f.count(days, "día", "días"), proximos: list.map(({ _date, ...rest }) => rest) },
    summary,
  };
}

function metas(run: ToolRun): ToolResult {
  const d = run.data;
  const f = run.facts;
  const goals = d.goals.filter((g) => g.active);
  const flow = projectCashflow(d.plan, 6);
  const surplus = monthlySurplus(flow);
  const lines = goalPlan(goals, surplus, d.plan.today, d.plan.rates);
  if (!lines.length) {
    return {
      data: { metas: [], sobrante_por_mes: f.ars(surplus), nota: "No hay metas abiertas." },
      summary: "No tenés metas abiertas.",
    };
  }
  const parts: string[] = [];
  const out = lines.map((l) => {
    const g = l.goal;
    parts.push(
      l.onTrack === true
        ? `${g.name} llega a tiempo`
        : l.onTrack === false
          ? `${g.name} no llega para ${monthLabel(g.deadline.slice(0, 7))}${l.eta ? ` (llegaría en ${monthLabel(l.eta)})` : ""}`
          : `${g.name} no tiene fecha`,
    );
    return {
      nombre: g.name,
      prioridad: PRIORITY[g.priority],
      objetivo: f.money(g.target, g.currency),
      juntado: f.money(g.saved, g.currency),
      ...(g.deadline
        ? { fecha: f.day(g.deadline), hace_falta_por_mes: f.money(l.needed, g.currency) }
        : {}),
      le_toca_por_mes: f.money(l.assigned, g.currency),
      llega_a_tiempo: l.onTrack,
      ...(l.eta ? { llegaria: f.month(l.eta) } : { llegaria: "nunca con lo que sobra hoy" }),
      ...(l.usdHint
        ? { aviso: "En pesos a más de 6 meses pierde valor; se puede pasar a USD." }
        : {}),
    };
  });
  return {
    data: { sobrante_por_mes: f.ars(surplus), metas: out },
    summary: `Te sobran unos ${money(surplus, "ARS")} por mes para metas. ${parts.join(". ")}.`,
  };
}

function planMes(run: ToolRun): ToolResult {
  const d = run.data;
  const f = run.facts;
  const goals = d.goals.filter((g) => g.active);
  const flow = projectCashflow(d.plan, 6);
  const surplus = monthlySurplus(flow);
  const lines = goalPlan(goals, surplus, d.plan.today, d.plan.rates);
  const plan = monthPlan(flow, lines);
  const suggestion = suggestBudgets({
    usual: flow.history.byCategory,
    committed: committedByCategory(d.plan, d.plan.today.slice(0, 7)),
    cut: Math.max(0, -plan.gap),
    names: Object.fromEntries(d.categories.map((c) => [c.id, c.name])),
  });
  const levers = planLevers({
    plan,
    lines,
    goals,
    surplus,
    suggestion,
    today: d.plan.today,
    rates: d.plan.rates,
  });
  const topes = suggestion.rows.filter((r) => r.tope > 0);
  const propuestas: { id: string; que: string }[] = [];
  if (topes.length) {
    const id = run.propose({
      kind: "aplicar_topes",
      label: `Aplicar ${topes.length} tope${topes.length === 1 ? "" : "s"} en Presupuestos`,
      topes: topes.map((r) => ({ id: r.id, name: r.name, tope: r.tope })),
    });
    propuestas.push({ id, que: "Aplicar los topes sugeridos" });
  }
  for (const l of levers) {
    if (l.kind === "recorte") continue;
    const id = run.propose({
      kind: "meta",
      label: l.text,
      goalId: l.goalId,
      // A "fecha" lever may also lower the amount (when the date alone would be too far).
      ...(l.kind === "fecha"
        ? {
            deadline: l.deadline,
            ...("target" in l && typeof l.target === "number" ? { target: l.target } : {}),
          }
        : {}),
      ...(l.kind === "monto" ? { target: l.target } : {}),
      ...(l.kind === "prioridad" ? { priority: l.priority } : {}),
    });
    propuestas.push({
      id,
      que:
        l.kind === "fecha"
          ? "Mover la fecha de una meta"
          : l.kind === "monto"
            ? "Bajar el monto de una meta"
            : "Subir la prioridad de una meta",
    });
  }
  const data = {
    entra_por_mes: f.ars(plan.income),
    fijos: f.ars(plan.fijos),
    tarjetas: f.ars(plan.cards),
    metas: plan.goals.map((g) => ({
      nombre: g.name,
      prioridad: PRIORITY[g.priority],
      por_mes: f.ars(g.needArs),
    })),
    queda_para_el_dia_a_dia: f.ars(plan.dayToDay),
    gasto_normal_dia_a_dia: f.ars(plan.usual),
    cierra: plan.closes,
    ...(plan.closes ? { sobra: f.ars(plan.gap) } : { falta: f.ars(-plan.gap) }),
    topes_sugeridos: topes
      .slice(0, 6)
      .map((r) => ({ categoria: r.name, normal: f.ars(r.usual), tope: f.ars(r.tope) })),
    ...(suggestion.freed > 0 ? { los_topes_liberan: f.ars(suggestion.freed) } : {}),
    propuestas,
  };
  const summary = plan.closes
    ? `El mes cierra: entran ${money(plan.income, "ARS")}, ya está comprometido ${money(plan.committed, "ARS")}, las metas piden ${money(plan.goalsTotal, "ARS")} y para el día a día quedan ${money(plan.dayToDay, "ARS")}.`
    : `El mes no cierra: faltan ${money(-plan.gap, "ARS")} por mes. Entran ${money(plan.income, "ARS")}, ya está comprometido ${money(plan.committed, "ARS")} y las metas piden ${money(plan.goalsTotal, "ARS")}.`;
  return { data, summary };
}

function simular(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const d = run.data;
  const f = run.facts;
  const p = d.plan;
  const tipo = args.tipo;
  const monto = Math.abs(Number(args.monto) || 0);
  if (!(monto > 0))
    return { data: { error: "Falta el monto." }, summary: "Para simular necesito el monto." };
  let scenario: Scenario;
  let proposal: ProposalInput | null = null;
  if (tipo === "cuotas") {
    const card = findByName(p.cards, args.tarjeta, (c) => c.name) ?? p.cards[0];
    if (!card)
      return {
        data: { error: "No hay tarjetas cargadas." },
        summary: "Para simular cuotas necesitás cargar una tarjeta.",
      };
    const n = Math.max(1, Math.min(72, Math.round(Number(args.cuotas) || 1)));
    const interestFree = args.sin_interes !== false;
    scenario = { kind: "cuotas", cardId: card.id, amount: monto, installments: n, interestFree };
    const what = typeof args.que === "string" ? args.que.slice(0, 40) : "";
    const total = interestFree ? monto : monto * n;
    proposal = {
      kind: "compra_cuotas",
      label: `Cargar ${what || "la compra"} de ${money(total, "ARS")} en ${n} cuota${n === 1 ? "" : "s"} en la ${card.name}`,
      cardId: card.id,
      amount: monto,
      installments: n,
      interestFree,
      what,
    };
  } else if (tipo === "gasto") {
    const list = cajas(d);
    const card = findByName(p.cards, args.caja, (c) => c.name);
    const caja = card
      ? p.accounts.find((a) => a.id === card.accountArsId)
      : (findByName(list, args.caja, (a) => a.name) ??
        list
          .filter((a) => a.currency === "ARS")
          .sort((a, b) => accountBalance(b, p.txs) - accountBalance(a, p.txs))[0]);
    if (!caja)
      return {
        data: { error: "No hay cajas en pesos." },
        summary: "Para simular un gasto necesitás una caja.",
      };
    scenario = { kind: "gasto", accountId: caja.id, amount: monto };
    proposal = {
      kind: "gasto",
      label: `Cargar un gasto de ${money(monto, caja.currency)} ${card ? `con la ${card.name}` : `desde ${accountLabel(caja)}`}`,
      accountId: caja.id,
      amount: monto,
      currency: caja.currency,
      card: Boolean(card),
    };
  } else if (tipo === "sueldo") {
    const delta = (args.baja === true ? -1 : 1) * monto;
    scenario = { kind: "sueldo", delta };
  } else {
    return {
      data: { error: "tipo debe ser cuotas, gasto o sueldo." },
      summary: "No entendí qué simular.",
    };
  }
  const r = simulate(
    p,
    d.goals.filter((g) => g.active),
    scenario,
    6,
  );
  if (r.invalid) return { data: { error: r.invalid }, summary: r.invalid };
  const goals = r.goals
    .filter((g) => g.change !== "same")
    .map((g) => ({
      meta: g.name,
      cambio: (
        {
          later: "se atrasa",
          sooner: "se adelanta",
          lost: "deja de llegar",
          gained: "ahora llega",
          same: "igual",
        } as const
      )[g.change],
      antes: g.before.eta ? f.month(g.before.eta) : "nunca",
      despues: g.after.eta ? f.month(g.after.eta) : "nunca",
    }));
  const data: Record<string, unknown> = {
    tipo,
    mes_mas_justo: { mes: f.month(r.lowest.ym), saldo: f.ars(r.lowest.balance) },
    ...(r.redFrom ? { en_rojo_desde: f.month(r.redFrom) } : { en_rojo: false }),
    ...(r.redFromBase ? { ya_en_rojo_sin_esto_desde: f.month(r.redFromBase) } : {}),
    sobrante_por_mes: { antes: f.ars(r.surplus.before), despues: f.ars(r.surplus.after) },
    metas_que_cambian: goals,
    ...(r.cuotas
      ? {
          cuotas: {
            cada_una: f.ars(r.cuotas.each),
            cantidad: f.count(r.cuotas.count, "cuota", "cuotas"),
            total: f.ars(r.cuotas.total),
            primera: f.month(r.cuotas.first),
            ultima: f.month(r.cuotas.last),
          },
        }
      : {}),
    ...(r.limit && r.limit.limit > 0
      ? {
          limite_tarjeta: {
            tarjeta: r.limit.name,
            libre_despues: f.ars(r.limit.free),
            pasa_el_limite: r.limit.free < 0,
          },
        }
      : {}),
    guardado: false,
  };
  if (proposal) data.propuesta = run.propose(proposal);
  const summary = `Con esto, el mes más justo es ${monthLabel(r.lowest.ym)} con ${money(r.lowest.balance, "ARS")} en tus cajas${
    r.redFrom ? ` y quedás en rojo desde ${monthLabel(r.redFrom)}` : ""
  }.${
    r.surplus.before !== r.surplus.after
      ? ` Lo que sobra por mes pasa de ${money(r.surplus.before, "ARS")} a ${money(r.surplus.after, "ARS")}.`
      : ""
  }${
    goals.length ? ` Cambian ${goals.length === 1 ? "1 meta" : `${goals.length} metas`}.` : ""
  } No se guardó nada.`;
  return { data, summary };
}

function planDeuda(run: ToolRun, args: Record<string, unknown>): ToolResult {
  const d = run.data;
  const f = run.facts;
  const p = d.plan;
  const debts = cardDebts({
    today: p.today,
    cards: p.cards,
    txs: p.txs,
    statements: p.statements,
    accounts: p.accounts,
    usdRate: p.rates.usd,
  });
  if (!debts.length)
    return {
      data: { deudas: [], nota: "No hay deuda de tarjeta." },
      summary: "No tenés deuda de tarjeta.",
    };
  const surplus = monthlySurplus(projectCashflow(p, 6));
  const asked = Math.round(Number(args.presupuesto) || 0);
  const budget = asked > 0 ? asked : suggestedDebtBudget(debts, p.today, surplus);
  const c = compareDebtPlans(debts, budget, p.today);
  const plan = (x: typeof c.avalancha) => ({
    sale_en: x.end ? f.month(x.end) : "más de 10 años",
    meses: x.months != null ? f.count(x.months, "mes", "meses") : "más de 120",
    intereses_estimados: f.ars(x.interest),
    orden: x.order.map((id) => debts.find((dd) => dd.cardId === id)?.name ?? id),
    ...(x.shortFrom ? { no_alcanza_desde: f.month(x.shortFrom) } : {}),
  });
  const data = {
    presupuesto_por_mes: f.ars(c.budget),
    presupuesto_sugerido_por_cifra: asked <= 0,
    obligatorio_este_mes: f.ars(c.mandatory),
    deudas: debts.map((dd) => ({
      tarjeta: dd.name,
      saldo: f.ars(dd.balance),
      ...(dd.tna > 0 ? { tna: f.rate(dd.tna) } : { tna: "sin cargar" }),
      vencido: dd.overdue,
      cuotas_que_siguen: f.ars(dd.cuotasTotal),
    })),
    avalancha: plan(c.avalancha),
    bola_de_nieve: plan(c.bola),
    solo_minimo: plan(c.minimo),
    las_dos_estrategias_son_iguales: c.same,
    ...(c.avalanchaSaves > 0 ? { avalancha_ahorra: f.ars(c.avalanchaSaves) } : {}),
    ...(c.missingTna.length ? { tarjetas_sin_tna: c.missingTna } : {}),
  };
  const summary = `Pagando ${money(c.budget, "ARS")} por mes: con avalancha salís en ${c.avalancha.end ? monthLabel(c.avalancha.end) : "más de 10 años"} y pagás unos ${money(c.avalancha.interest, "ARS")} de intereses; con bola de nieve, en ${c.bola.end ? monthLabel(c.bola.end) : "más de 10 años"} con ${money(c.bola.interest, "ARS")}. Son estimados con la TNA de cada tarjeta.`;
  return { data, summary };
}

// --------------------------------------------------------------- registry

type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (run: ToolRun, args: Record<string, unknown>) => ToolResult;
};

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false };

export const TOOLS: ToolDef[] = [
  {
    name: "resumen_mes",
    description: "Ingresos, gasto, categorías y topes de un mes (por defecto el actual).",
    parameters: {
      type: "object",
      properties: { mes: { type: "string", description: "YYYY-MM" } },
      additionalProperties: false,
    },
    run: resumenMes,
  },
  {
    name: "tendencia_categoria",
    description: "Gasto de una categoría en los últimos meses.",
    parameters: {
      type: "object",
      properties: {
        categoria: { type: "string" },
        meses: { type: "integer", minimum: 1, maximum: 6 },
      },
      required: ["categoria"],
      additionalProperties: false,
    },
    run: tendenciaCategoria,
  },
  {
    name: "tarjetas",
    description: "Cada tarjeta: a pagar, vencimiento, mínimo, próximo resumen y límite.",
    parameters: NO_ARGS,
    run: (r) => tarjetas(r),
  },
  {
    name: "proximos",
    description: "Vencimientos de tarjeta y fijos de los próximos días.",
    parameters: {
      type: "object",
      properties: { dias: { type: "integer", minimum: 1, maximum: 45 } },
      additionalProperties: false,
    },
    run: proximos,
  },
  {
    name: "metas",
    description: "Metas: cuánto falta, cuánto les toca por mes y si llegan.",
    parameters: NO_ARGS,
    run: (r) => metas(r),
  },
  {
    name: "plan_mes",
    description:
      "Plan de un mes normal: entra, comprometido, metas, si cierra, topes sugeridos y propuestas.",
    parameters: NO_ARGS,
    run: (r) => planMes(r),
  },
  {
    name: "simular",
    description:
      "¿Y si…? compra en cuotas, gasto grande o cambio de sueldo: cajas, metas y límite. No guarda nada.",
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["cuotas", "gasto", "sueldo"] },
        monto: {
          type: "number",
          description: "Pesos. En cuotas sin interés: el precio; con interés: cada cuota.",
        },
        cuotas: { type: "integer", minimum: 1, maximum: 72 },
        sin_interes: { type: "boolean" },
        tarjeta: { type: "string" },
        caja: { type: "string" },
        baja: { type: "boolean", description: "sueldo: true si baja" },
        que: { type: "string", description: "Qué se compra, 1-3 palabras" },
      },
      required: ["tipo", "monto"],
      additionalProperties: false,
    },
    run: simular,
  },
  {
    name: "plan_deuda",
    description:
      "Salir de la deuda de tarjeta: avalancha vs bola de nieve vs mínimo, con fecha e intereses.",
    parameters: {
      type: "object",
      properties: { presupuesto: { type: "number", description: "Pesos por mes" } },
      additionalProperties: false,
    },
    run: planDeuda,
  },
];

export const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

/** Run one tool. Unknown tools and bad arguments come back as an error, never throw. */
export function runTool(
  run: ToolRun,
  name: string,
  args: unknown,
): ToolResult & { valores: Record<string, string> } {
  const def = TOOLS.find((t) => t.name === name);
  const from = run.facts.cursor;
  let result: ToolResult;
  try {
    result = def
      ? def.run(
          run,
          args && typeof args === "object" && !Array.isArray(args)
            ? (args as Record<string, unknown>)
            : {},
        )
      : { data: { error: `No existe la herramienta ${name}.` }, summary: "" };
  } catch {
    result = { data: { error: "No pude calcular eso." }, summary: "" };
  }
  if (result.summary) run.summaries.push(result.summary);
  return { ...result, valores: run.facts.since(from) };
}
