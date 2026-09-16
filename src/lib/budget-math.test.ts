import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  budgetAllocation,
  budgetsFromSpend,
  effectiveCategoryBudget,
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
    assert.equal(effectiveCategoryBudget("c_obra", 90_000, 0, SEED), 90_000);
  });

  it("keeps a builtin tope that is not the seed default", () => {
    assert.equal(effectiveCategoryBudget("vivienda", 1_800_000, 1_550_000, SEED), 1_800_000);
    assert.equal(effectiveCategoryBudget("alimentos", 300_000, 0, SEED), 300_000);
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

describe("budgetsFromSpend", () => {
  it("copies this month's spend into envelopes", () => {
    assert.deepEqual(budgetsFromSpend({ vivienda: 1_550_000, alimentos: 0 }), {
      vivienda: 1_550_000,
    });
  });
});

describe("unsetBudgetPatch", () => {
  it("persists spend as tope only for categories still on factory defaults", () => {
    const patch = unsetBudgetPatch(
      { vivienda: 1_550_000, salud: 700_000, alimentos: 0 },
      { vivienda: 480_000, salud: 40_000, alimentos: 220_000 },
      SEED,
    );
    assert.deepEqual(patch, { vivienda: 1_550_000, salud: 700_000 });
  });

  it("does not overwrite a tope the user already set", () => {
    const patch = unsetBudgetPatch({ vivienda: 1_550_000 }, { vivienda: 1_800_000 }, SEED);
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
