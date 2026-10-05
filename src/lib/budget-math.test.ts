import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthPlan,
  budgetAllocation,
  budgetsFromSpend,
  effectiveCategoryBudget,
  fijoTopes,
  hydrateBookMoney,
  liveCategoryRows,
  moneyForBook,
  unsetBudgetPatch,
} from "./budget-math.ts";
import type { Category } from "./types.ts";

const SEED = { alimentos: 220_000, vivienda: 480_000, salud: 40_000 };

const vivienda: Category = {
  id: "vivienda",
  name: "Vivienda",
  kind: "expense",
  token: "cat-home",
  icon: "Home",
};
const alimentos: Category = {
  id: "alimentos",
  name: "Alimentación",
  kind: "expense",
  token: "cat-food",
  icon: "Utensils",
};
const salud: Category = {
  id: "salud",
  name: "Salud",
  kind: "expense",
  token: "cat-health",
  icon: "HeartPulse",
};
const custom: Category = {
  id: "c_obra",
  name: "Obra",
  kind: "expense",
  token: "cat-other",
  icon: "Ellipsis",
};

describe("effectiveCategoryBudget", () => {
  it("uses this month's spend as default tope when the stored value is the factory seed", () => {
    assert.equal(effectiveCategoryBudget("vivienda", 480_000, 1_550_000, SEED), 1_550_000);
  });

  it("uses spend when there is no tope stored", () => {
    assert.equal(effectiveCategoryBudget("salud", 0, 700_000, SEED), 700_000);
  });

  it("ignores factory defaults on idle builtin categories", () => {
    assert.equal(effectiveCategoryBudget("alimentos", 220_000, 0, SEED), 0);
  });

  it("keeps a custom idle tope the user actually set", () => {
    assert.equal(effectiveCategoryBudget("c_obra", 90_000, 0, SEED, true), 90_000);
  });

  it("keeps a builtin tope that the user locked", () => {
    assert.equal(effectiveCategoryBudget("vivienda", 1_800_000, 1_550_000, SEED, true), 1_800_000);
    assert.equal(effectiveCategoryBudget("alimentos", 300_000, 0, SEED, true), 300_000);
  });

  it("loads the assigned fijo as the tope even before it is spent", () => {
    assert.equal(effectiveCategoryBudget("vivienda", 0, 0, SEED, false, 800_000), 800_000);
  });

  it("keeps the fijo tope when the month already spent more", () => {
    assert.equal(effectiveCategoryBudget("vivienda", 200_000, 900_000, SEED, false, 800_000), 800_000);
  });

  it("a locked tope still wins over the fijo", () => {
    assert.equal(effectiveCategoryBudget("vivienda", 1_200_000, 900_000, SEED, true, 800_000), 1_200_000);
  });
});

describe("buildMonthPlan", () => {
  it("says the month is tight when fijos already take most of the cap", () => {
    const plan = buildMonthPlan({
      cap: 5_830_000,
      assigned: 4_230_000,
      daysLeft: 28,
      openCategories: [
        { id: "alimentos", name: "Alimentación" },
        { id: "compras", name: "Compras" },
        { id: "ocio", name: "Ocio" },
      ],
    });
    assert.equal(plan.tone, "tight");
    assert.equal(plan.left, 1_600_000);
    assert.equal(plan.perDay, 57_143);
    assert.ok(plan.suggestions.find((s) => s.id === "alimentos")!.amount > 0);
    assert.ok(plan.cushion > 0);
    assert.ok(plan.suggestions.reduce((s, x) => s + x.amount, 0) + plan.cushion <= 1_600_000);
  });
});

describe("liveCategoryRows + allocation", () => {
  it("connects spent categories to their envelopes and leaves the rest unassigned", () => {
    const rows = liveCategoryRows(
      { vivienda: 1_550_000, salud: 700_000 },
      { vivienda: 480_000, alimentos: 220_000, salud: 40_000 },
      [vivienda, alimentos, salud, custom],
      SEED,
    );
    const viva = rows.find((r) => r.id === "vivienda")!;
    const food = rows.find((r) => r.id === "alimentos")!;
    assert.equal(viva.spent, 1_550_000);
    assert.equal(viva.budget, 1_550_000);
    assert.equal(food.spent, 0);
    assert.equal(food.budget, 0);

    const { assigned, unassigned } = budgetAllocation(rows, 3_050_000);
    assert.equal(assigned, 1_550_000 + 700_000);
    assert.equal(unassigned, 3_050_000 - 2_250_000);
  });
});

describe("fijoTopes", () => {
  it("sums active expense fijos of this book into the category, in pesos", () => {
    assert.deepEqual(
      fijoTopes(
        [
          { bookId: "p", type: "expense", active: true, categoryId: "vivienda", amount: 500_000, currency: "ARS" },
          { bookId: "p", type: "expense", active: true, categoryId: "vivienda", amount: 80_000, currency: "ARS" },
          { bookId: "p", type: "expense", active: true, categoryId: "servicios", amount: 20, currency: "USDT" },
          { bookId: "p", type: "income", active: true, categoryId: "sueldo", amount: 1, currency: "ARS" },
          { bookId: "p", type: "expense", active: false, categoryId: "salud", amount: 10, currency: "ARS" },
          { bookId: "n", type: "expense", active: true, categoryId: "vivienda", amount: 9, currency: "ARS" },
        ],
        "p",
        { usd: 1400, usdt: 1614 },
      ),
      { vivienda: 580_000, servicios: 32_280 },
    );
  });
});

describe("budgetsFromSpend", () => {
  it("copies this month's spend into envelopes", () => {
    assert.deepEqual(budgetsFromSpend({ vivienda: 1_550_000, alimentos: 0 }), {
      vivienda: 1_550_000,
    });
  });
});

describe("unsetBudgetPatch", () => {
  it("persists spend as tope for categories the user did not lock", () => {
    const patch = unsetBudgetPatch(
      { vivienda: 1_550_000, salud: 700_000, alimentos: 0 },
      { vivienda: 480_000, salud: 40_000, alimentos: 220_000 },
      SEED,
    );
    assert.deepEqual(patch, { vivienda: 1_550_000, salud: 700_000 });
  });

  it("saves the assigned fijo as the tope before any spend", () => {
    const patch = unsetBudgetPatch({}, { vivienda: 0 }, SEED, {}, { vivienda: 800_000 });
    assert.deepEqual(patch, { vivienda: 800_000 });
  });

  it("does not replace a fijo tope with a higher spend", () => {
    const patch = unsetBudgetPatch({ vivienda: 900_000 }, { vivienda: 800_000 }, SEED, {}, { vivienda: 800_000 });
    assert.equal(patch, null);
  });

  it("does not overwrite a tope the user locked", () => {
    const patch = unsetBudgetPatch({ vivienda: 1_550_000 }, { vivienda: 1_800_000 }, SEED, {
      vivienda: true,
    });
    assert.equal(patch, null);
  });
});

describe("hydrateBookMoney", () => {
  it("copies legacy envelopes only onto the personal book", () => {
    const { bookBudgets, bookGlobals } = hydrateBookMoney({
      books: [
        { id: "p1", kind: "personal" },
        { id: "n1", kind: "business" },
      ],
      legacyBudgets: { vivienda: 1_550_000 },
      legacyGlobal: 3_050_000,
      bookBudgets: {},
      bookGlobals: {},
    });
    assert.deepEqual(bookBudgets.p1, { vivienda: 1_550_000 });
    assert.equal(bookGlobals.p1, 3_050_000);
    assert.equal(bookBudgets.n1, undefined);
    assert.equal(bookGlobals.n1, undefined);
    const biz = moneyForBook("n1", bookBudgets, bookGlobals);
    assert.deepEqual(biz.budgets, {});
    assert.equal(biz.globalBudget, 0);
  });

  it("does not overwrite a book that already has its own envelopes", () => {
    const { bookBudgets } = hydrateBookMoney({
      books: [{ id: "p1", kind: "personal" }],
      legacyBudgets: { vivienda: 1 },
      legacyGlobal: 1,
      bookBudgets: { p1: { vivienda: 9 } },
      bookGlobals: { p1: 8 },
    });
    assert.deepEqual(bookBudgets.p1, { vivienda: 9 });
  });
});
