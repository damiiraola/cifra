/**
 * One user, four screens: Presupuestos, Metas (plan de un mes normal), the
 * assistant (resumen del mes, plan del mes, metas) and the simulator must
 * show numbers from the same calculation, with texts that say which one.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Account, Recurring, Transaction } from "../types.ts";
import type { Goal } from "../goals.ts";
import { buildMonthPlan, recurringLines } from "../budget-math.ts";
import { projectCashflow, monthlySurplus } from "./cashflow.ts";
import { goalPlan } from "./goal-plan.ts";
import { monthPlan } from "./month-plan.ts";
import { simulate } from "./simulate.ts";
import { monthNumbers, say, thisMonthIncome } from "./month-numbers.ts";
import { runTool, ToolRun, type AssistantData } from "../assistant/tools.ts";

const today = "2026-10-10";
const rates = { usd: 1540, usdt: 1600 };
const accounts: Account[] = [
  { id: "bank", bookId: "p", name: "Banco", kind: "bank", currency: "ARS", opening: 500_000, archived: false },
  { id: "cash", bookId: "p", name: "Efectivo", kind: "cash", currency: "ARS", opening: 80_000, archived: false },
];
const fijo = (x: Partial<Recurring>): Recurring => ({
  id: x.name!.toLowerCase(), bookId: "p", type: "expense", name: "", amount: 0, currency: "ARS",
  categoryId: "vivienda", accountId: "bank", method: "debito", day: 5, note: "", active: true, ...x,
});
const recurrings: Recurring[] = [
  fijo({ name: "Sueldo", type: "income", amount: 1_200_000, categoryId: "sueldo", day: 1, method: "transferencia" }),
  fijo({ name: "Alquiler", amount: 450_000, day: 5 }),
  fijo({ name: "Internet", amount: 25_000, categoryId: "servicios", day: 8 }),
];
let n = 0;
const tx = (x: Partial<Transaction>): Transaction => ({
  id: `t${++n}`, type: "expense", amount: 0, currency: "ARS", categoryId: "alimentos", note: "", merchant: "",
  date: today, method: "debito", createdAt: "", bookId: "p", accountId: "bank", counterpartyId: "", amountTo: 0,
  rateArs: 0, rateLocked: false, recurringId: "", cardPeriod: "", purchaseId: "", installmentNo: 0, installmentCount: 0, ...x,
});
const txs: Transaction[] = [];
for (const ym of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
  txs.push(tx({ type: "income", amount: 1_200_000, categoryId: "sueldo", date: `${ym}-01`, recurringId: "sueldo", method: "transferencia" }));
  txs.push(tx({ amount: 450_000, categoryId: "vivienda", date: `${ym}-05`, recurringId: "alquiler" }));
  txs.push(tx({ amount: 25_000, categoryId: "servicios", date: `${ym}-08`, recurringId: "internet" }));
  txs.push(tx({ amount: ym === "2026-10" ? 90_000 : 280_000, date: `${ym}-09`, accountId: "cash", method: "efectivo" }));
}
const goal: Goal = {
  id: "brasil", bookId: "p", kind: "viaje", name: "Brasil en enero", currency: "USD", target: 1500, saved: 0,
  deadline: "2027-01-15", priority: 2, active: true, createdAt: "", updatedAt: "",
};
const plan = { today, bookId: "p", txs, accounts, cards: [], statements: [], recurrings, rates };
const data = (): AssistantData => ({
  plan,
  goals: [goal],
  categories: [
    { id: "alimentos", name: "Alimentación", kind: "expense" },
    { id: "vivienda", name: "Vivienda", kind: "expense" },
    { id: "servicios", name: "Servicios", kind: "expense" },
    { id: "sueldo", name: "Sueldo", kind: "income" },
  ],
  topes: {},
});

describe("one user, four screens, one calculation", () => {
  const oct = txs.filter((t) => t.date.startsWith("2026-10"));
  const stats = {
    earned: oct.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    spent: oct.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
  };
  const incomeFijos = recurringLines(recurrings, "p", rates, "income").reduce((s, r) => s + r.amount, 0);
  const flow = projectCashflow(plan, 6);
  const surplus = monthlySurplus(flow);
  const lines = goalPlan([goal], surplus, today, rates);
  const nums = monthNumbers({ incomeFijos, earned: stats.earned, spent: stats.spent, flow, lines });

  it("Presupuestos: «Te quedan este mes» is the shared this-month number", () => {
    const screen = buildMonthPlan({
      income: thisMonthIncome(incomeFijos, stats.earned), spent: stats.spent, pendingFijos: 0, daysLeft: 21, categories: [],
    });
    assert.equal(screen.left, nums.thisMonthLeft);
    assert.equal(nums.thisMonthLeft, 1_200_000 - 450_000 - 25_000 - 90_000);
  });

  it("Asistente, resumen del mes: same number, same words", () => {
    const r = runTool(new ToolRun(data()), "resumen_mes", {});
    assert.ok(r.summary.includes(say.thisMonth(nums.thisMonthLeft)), r.summary);
  });

  it("Metas (plan de un mes normal) and the assistant's plan del mes: same headline", () => {
    const card = monthPlan(flow, lines);
    assert.equal(card.gap, nums.afterGoals);
    const headline = say.afterGoals(card.gap, card.goalsTotal);
    const r = runTool(new ToolRun(data()), "plan_mes", {});
    assert.ok(r.summary.includes(headline), r.summary);
    assert.ok(r.summary.includes(say.bridge(nums.beforeGoals, nums.goalsTotal)), r.summary);
  });

  it("antes de metas − lo que piden las metas = con metas (no contradictions)", () => {
    assert.equal(nums.beforeGoals - nums.goalsTotal, nums.afterGoals);
    assert.ok(nums.goalsTotal > 0);
  });

  it("Simulador and the assistant's metas: the 'antes de tus metas' number is the same projection", () => {
    const sim = simulate(plan, [goal], { kind: "gasto", accountId: "bank", amount: 1 });
    assert.equal(sim.surplus.before, Math.max(0, nums.beforeGoals));
    const r = runTool(new ToolRun(data()), "metas", {});
    assert.ok(r.summary.includes(say.beforeGoals(surplus)), r.summary);
  });

  it("the texts say what they measure", () => {
    assert.match(say.thisMonth(1), /este mes/);
    assert.match(say.beforeGoals(1), /mes normal, antes de tus metas/);
    assert.match(say.afterGoals(-1, 10), /Para tus metas faltan/);
    assert.match(say.afterGoals(5, 0), /mes normal cierra/);
  });
});
