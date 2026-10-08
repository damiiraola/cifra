import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseGoals, type Goal } from "../goals.ts";
import type { Cashflow, MonthFlow, PlanData } from "./cashflow.ts";
import { goalPlan } from "./goal-plan.ts";
import { committedByCategory, suggestBudgets } from "./budgets.ts";
import {
  latestMove,
  MAX_MOVE_MONTHS_FROM_TODAY,
  monthPlan,
  moveDeadline,
  planLevers,
} from "./month-plan.ts";
import type { Recurring, Transaction } from "../types.ts";

const rates = { usd: 1000, usdt: 1000 };
const today = "2026-10-08";

const goal = (extra: Partial<Goal>): Goal => ({
  id: "g",
  bookId: "p",
  kind: "viaje",
  name: "Viaje",
  currency: "ARS",
  target: 1_500_000,
  saved: 0,
  deadline: "2027-02-08",
  priority: 2,
  active: true,
  createdAt: "",
  updatedAt: "",
  ...extra,
});

describe("goal priority", () => {
  it("parses it, media by default", () => {
    const [a, b, c] = parseGoals([
      { id: "a", kind: "viaje", currency: "ARS", target: 1, priority: 1 },
      { id: "b", kind: "viaje", currency: "ARS", target: 1, priority: 3 },
      { id: "c", kind: "viaje", currency: "ARS", target: 1 },
    ]);
    assert.deepEqual([a!.priority, b!.priority, c!.priority], [1, 3, 2]);
    assert.equal(
      parseGoals([{ id: "d", kind: "viaje", currency: "ARS", target: 1, priority: 9 }])[0]!
        .priority,
      2,
    );
  });

  it("higher priority gets what it needs first", () => {
    // 5 months to 2027-02-08 → 300.000 per month each.
    const lines = goalPlan(
      [
        goal({ id: "baja", name: "Baja", priority: 3 }),
        goal({ id: "alta", name: "Alta", priority: 1 }),
      ],
      400_000,
      today,
      rates,
    );
    assert.deepEqual(
      lines.map((l) => [l.goal.id, l.assignedArs, l.onTrack]),
      [
        ["alta", 300_000, true],
        ["baja", 100_000, false],
      ],
    );
  });

  it("goals without a date share what is left 3/2/1 by priority", () => {
    const lines = goalPlan(
      [goal({ id: "x", deadline: "", priority: 1 }), goal({ id: "y", deadline: "", priority: 3 })],
      400_000,
      today,
      rates,
    );
    assert.deepEqual(
      lines.map((l) => [l.goal.id, l.assignedArs]),
      [
        ["x", 300_000],
        ["y", 100_000],
      ],
    );
  });
});

describe("suggested topes", () => {
  const usual = { ocio: 100_000, alimentos: 200_000 };
  const committed = { vivienda: 300_000, suscripciones: 10_000 };
  const names = {
    ocio: "Ocio",
    alimentos: "Alimentación",
    vivienda: "Vivienda",
    suscripciones: "Suscripciones",
  };

  it("without a cut: committed + usual", () => {
    const s = suggestBudgets({ usual, committed, cut: 0, names });
    assert.deepEqual(
      s.rows.map((r) => [r.id, r.tope]),
      [
        ["vivienda", 300_000],
        ["alimentos", 200_000],
        ["ocio", 100_000],
        ["suscripciones", 10_000],
      ],
    );
    assert.equal(s.freed, 0);
  });

  it("trims what can be trimmed, never fijos", () => {
    const s = suggestBudgets({ usual, committed, cut: 30_000, names });
    const by = Object.fromEntries(s.rows.map((r) => [r.id, r]));
    assert.equal(by.ocio!.tope, 80_000);
    assert.equal(by.alimentos!.tope, 189_000);
    assert.equal(by.vivienda!.tope, 300_000);
    assert.equal(s.freed, 31_000);
    assert.equal(s.short, 0);
  });

  it("says what is still missing when trimming is not enough", () => {
    const s = suggestBudgets({ usual, committed, cut: 100_000, names });
    const by = Object.fromEntries(s.rows.map((r) => [r.id, r.tope]));
    assert.deepEqual([by.ocio, by.alimentos], [65_000, 180_000]);
    assert.equal(s.freed, 55_000);
    assert.equal(s.short, 45_000);
  });

  it("committed per category: fijos (the loaded amount if loaded) and the month's cuotas", () => {
    const fijo = (extra: Partial<Recurring>): Recurring => ({
      id: "r",
      bookId: "p",
      type: "expense",
      name: "Fijo",
      amount: 300_000,
      currency: "ARS",
      categoryId: "vivienda",
      accountId: "bank",
      method: "transferencia",
      day: 10,
      note: "",
      active: true,
      ...extra,
    });
    const tx = (extra: Partial<Transaction>): Transaction => ({
      id: Math.random().toString(36),
      type: "expense",
      amount: 10_000,
      currency: "ARS",
      categoryId: "compras",
      note: "",
      merchant: "",
      date: "2026-10-02",
      method: "credito",
      createdAt: "",
      bookId: "p",
      accountId: "visa",
      counterpartyId: "",
      amountTo: 0,
      rateArs: 1,
      rateLocked: false,
      recurringId: "",
      cardPeriod: "",
      purchaseId: "",
      installmentNo: 0,
      installmentCount: 0,
      ...extra,
    });
    const data: PlanData = {
      today,
      bookId: "p",
      txs: [
        tx({ purchaseId: "p1", installmentNo: 1, installmentCount: 3 }),
        tx({ purchaseId: "p1", installmentNo: 2, installmentCount: 3, date: "2026-11-02" }),
        tx({
          amount: 310_000,
          categoryId: "vivienda",
          recurringId: "alq",
          accountId: "bank",
          date: "2026-10-05",
        }),
        tx({ amount: 99_000, categoryId: "ocio" }),
      ],
      accounts: [],
      cards: [],
      statements: [],
      recurrings: [
        fijo({ id: "alq" }),
        fijo({ id: "nf", amount: 10, currency: "USD", categoryId: "suscripciones" }),
        fijo({ id: "otro", bookId: "b", categoryId: "salud" }),
        fijo({ id: "off", active: false, categoryId: "salud" }),
      ],
      rates,
    };
    assert.deepEqual(committedByCategory(data, "2026-10"), {
      vivienda: 310_000,
      suscripciones: 10_000,
      compras: 10_000,
    });
  });
});

function flowOf(m: Partial<MonthFlow>, history: Partial<Cashflow["history"]> = {}): Cashflow {
  const month = (ym: string): MonthFlow => ({
    ym,
    inSoFar: 0,
    outSoFar: 0,
    income: { fijos: 800_000, variable: 0 },
    out: { fijos: 300_000, cards: 150_000, variable: 200_000 },
    cards: [],
    cardsKnown: 50_000,
    totalIn: 800_000,
    totalOut: 650_000,
    net: 150_000,
    endBalance: 0,
    ...m,
  });
  return {
    startBalance: 0,
    history: {
      months: ["2026-09"],
      cashVariable: 200_000,
      cardVariable: 100_000,
      variableIncome: 0,
      byCategory: {},
      ...history,
    },
    months: ["2026-10", "2026-11", "2026-12", "2027-01"].map(month),
  };
}

describe("month plan and levers", () => {
  it("income − committed − goals vs the usual day to day", () => {
    const lines = goalPlan([goal({ name: "Brasil" })], 150_000, today, rates);
    const p = monthPlan(flowOf({}), lines);
    assert.deepEqual(
      [p.income, p.fijos, p.cards, p.goalsTotal, p.dayToDay, p.usual, p.gap, p.closes],
      [800_000, 300_000, 50_000, 300_000, 150_000, 300_000, -150_000, false],
    );
  });

  it("closes without goals when the day to day fits", () => {
    const p = monthPlan(flowOf({}), []);
    assert.equal(p.gap, 150_000);
    assert.equal(p.closes, true);
  });

  it("moves a deadline keeping the day", () => {
    assert.equal(moveDeadline("2027-01-31", "2027-02"), "2027-02-28");
    assert.equal(moveDeadline("2027-01-08", "2027-06"), "2027-06-08");
  });

  it("levers: trim, move the date, lower the amount, raise the priority", () => {
    const goals = [
      goal({ id: "auto", name: "Auto", priority: 2 }),
      goal({ id: "brasil", name: "Brasil", priority: 3 }),
    ];
    const surplus = 400_000;
    const lines = goalPlan(goals, surplus, today, rates);
    const plan = monthPlan(flowOf({}), lines);
    const suggestion = suggestBudgets({
      usual: { ocio: 100_000, alimentos: 200_000 },
      committed: {},
      cut: -plan.gap,
      names: { ocio: "Ocio", alimentos: "Alimentación" },
    });
    const levers = planLevers({ plan, lines, goals, surplus, suggestion, today, rates });
    const byId = Object.fromEntries(levers.map((l) => [l.id, l]));
    assert.match(byId.recorte!.text, /liberás \$\s?55\.000 por mes y siguen faltando/);
    const fecha = byId["fecha:brasil"]!;
    assert.equal(fecha.kind === "fecha" && fecha.deadline, "2028-01-08");
    assert.match(fecha.text, /Mover Brasil a enero 2028/);
    const monto = byId["monto:brasil"]!;
    assert.equal(monto.kind === "monto" && monto.target, 500_000);
    assert.match(
      byId["prioridad:brasil"]!.text,
      /Pasar Brasil a prioridad alta: llega a tiempo, pero se atrasa Auto\./,
    );
    assert.equal(byId["fecha:auto"], undefined);
    const stretch = byId["fecha:auto:por:brasil"]!;
    assert.equal(stretch.kind === "fecha" && stretch.deadline, "2028-01-08");
    assert.match(
      stretch.text,
      /Mover Auto a enero 2028: libera \$\s?200\.000 por mes y Brasil llega a tiempo\./,
    );
  });
});

describe("Mover fecha: never an absurd date", () => {
  it("latest sensible month: one more year or double the time, at most 5 years from today", () => {
    assert.equal(latestMove(today, "2026-12-20"), "2027-12");
    assert.equal(latestMove(today, "2029-10-08"), "2031-10");
    assert.equal(latestMove(today, "2034-01-01"), "2031-10");
    assert.equal(latestMove(today, "2026-01-10"), "2027-10");
    assert.equal(latestMove(today, ""), "2027-10");
    assert.equal(MAX_MOVE_MONTHS_FROM_TODAY, 60);
  });

  it("a short goal that would arrive in 2029 gets date + amount instead", () => {
    // 5M for December with ~130k a month: the full amount arrives in Nov 2029.
    const goals = [
      goal({ id: "brasil", name: "Brasil", target: 5_000_000, deadline: "2026-12-20" }),
    ];
    const surplus = 135_000;
    const lines = goalPlan(goals, surplus, today, rates);
    assert.equal(lines[0]!.eta > "2029-01", true);
    const plan = monthPlan(flowOf({}), lines);
    const suggestion = suggestBudgets({ usual: {}, committed: {}, cut: 0, names: {} });
    const levers = planLevers({ plan, lines, goals, surplus, suggestion, today, rates });
    const fecha = levers.find((l) => l.id === "fecha:brasil")!;
    assert.equal(fecha.kind, "fecha");
    if (fecha.kind !== "fecha") return;
    assert.equal(fecha.deadline, "2027-12-20");
    assert.ok(fecha.deadline <= "2027-12-31");
    // 15 months × 135k = 2.025M, rounded down to 10k
    assert.equal(fecha.target, 2_020_000);
    assert.match(
      fecha.text,
      /Mover Brasil a diciembre 2027 y bajarla a \$\s?2\.020\.000: es lo que llegás a juntar para entonces\. El total recién llegaría en/,
    );
    for (const l of levers) if (l.kind === "fecha") assert.ok(l.deadline < "2028-01-01", l.id);
  });

  it("no date lever when even the latest date reaches nothing new", () => {
    const goals = [goal({ id: "x", name: "X", target: 5_000_000, deadline: "2026-12-20" })];
    const lines = goalPlan(goals, 0, today, rates);
    const plan = monthPlan(flowOf({}), lines);
    const suggestion = suggestBudgets({ usual: {}, committed: {}, cut: 0, names: {} });
    const levers = planLevers({ plan, lines, goals, surplus: 0, suggestion, today, rates });
    assert.equal(levers.filter((l) => l.kind === "fecha").length, 0);
  });

  it("does not stretch another goal past its sensible limit", () => {
    const goals = [
      goal({ id: "auto", name: "Auto", priority: 2, target: 1_000_000, deadline: "2026-12-08" }),
      goal({
        id: "brasil",
        name: "Brasil",
        priority: 3,
        target: 3_000_000,
        deadline: "2027-02-08",
      }),
    ];
    const surplus = 520_000;
    const lines = goalPlan(goals, surplus, today, rates);
    const plan = monthPlan(flowOf({}), lines);
    const suggestion = suggestBudgets({ usual: {}, committed: {}, cut: 0, names: {} });
    const levers = planLevers({ plan, lines, goals, surplus, suggestion, today, rates });
    for (const l of levers)
      if (l.kind === "fecha")
        assert.ok(
          l.deadline.slice(0, 7) <=
            latestMove(today, goals.find((g) => g.id === l.goalId)!.deadline),
          l.id,
        );
  });
});
