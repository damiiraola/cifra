import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cardBills,
  cashOut,
  history,
  liquidBalance,
  median,
  monthlySurplus,
  pendingFijos,
  projectCashflow,
  type PlanData,
} from "./cashflow.ts";
import { goalPlan, monthsUntil } from "./goal-plan.ts";
import { budgetAlerts, cardAlerts, planAlerts, type AlertInput } from "./alerts.ts";
import type { Goal } from "../goals.ts";
import type { Account, Card, Recurring, Transaction } from "../types.ts";

const card: Card = {
  id: "visa",
  bookId: "p",
  name: "Visa",
  bank: "Galicia",
  network: "visa",
  last4: "",
  closingDay: 23,
  dueDay: 5,
  limitArs: 0,
  accountArsId: "visa-ars",
  accountUsdId: "visa-usd",
  payAccountId: "bank",
  usdPerceptionPct: 30,
  tna: 73,
  archived: false,
};

const accounts: Account[] = [
  {
    id: "bank",
    bookId: "p",
    name: "Banco",
    kind: "bank",
    currency: "ARS",
    opening: 1_000_000,
    archived: false,
  },
  {
    id: "usd",
    bookId: "p",
    name: "Dólares",
    kind: "cash",
    currency: "USD",
    opening: 500,
    archived: false,
  },
  {
    id: "visa-ars",
    bookId: "p",
    name: "Visa",
    kind: "card",
    currency: "ARS",
    opening: 0,
    archived: false,
  },
  {
    id: "visa-usd",
    bookId: "p",
    name: "Visa USD",
    kind: "card",
    currency: "USD",
    opening: 0,
    archived: false,
  },
];

let n = 0;
const tx = (extra: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  type: "expense",
  amount: 1000,
  currency: "ARS",
  categoryId: "alimentos",
  note: "",
  merchant: "",
  date: "2026-10-02",
  method: "credito",
  createdAt: "",
  bookId: "p",
  accountId: "visa-ars",
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

const fijo = (extra: Partial<Recurring>): Recurring => ({
  id: "r",
  bookId: "p",
  type: "expense",
  name: "Fijo",
  amount: 1000,
  currency: "ARS",
  categoryId: "vivienda",
  accountId: "bank",
  method: "transferencia",
  day: 10,
  note: "",
  active: true,
  ...extra,
});

const cuota = (k: number, period: string, date: string) =>
  tx({
    id: `cuo_p1_${k}`,
    amount: 10_000,
    purchaseId: "p1",
    installmentNo: k,
    installmentCount: 3,
    cardPeriod: period,
    date,
  });

const recurrings: Recurring[] = [
  fijo({
    id: "sueldo",
    type: "income",
    name: "Sueldo",
    amount: 800_000,
    day: 1,
    categoryId: "sueldo",
  }),
  fijo({ id: "alquiler", name: "Alquiler", amount: 300_000, day: 10 }),
  fijo({
    id: "netflix",
    name: "Netflix",
    amount: 5_000,
    day: 7,
    accountId: "visa-ars",
    categoryId: "suscripciones",
  }),
  fijo({ id: "otro-libro", bookId: "b", name: "Local", amount: 99_999 }),
];

const txs: Transaction[] = [
  tx({ amount: 30_000, date: "2026-09-10" }),
  tx({ amount: 3_000, date: "2026-10-02" }),
  tx({ amount: 5_000, date: "2026-10-03", accountId: "bank", method: "debito" }),
  tx({
    type: "income",
    amount: 800_000,
    date: "2026-10-01",
    accountId: "bank",
    recurringId: "sueldo",
    categoryId: "sueldo",
  }),
  cuota(1, "2026-10", "2026-10-02"),
  cuota(2, "2026-11", "2026-11-02"),
  cuota(3, "2026-12", "2026-12-02"),
];

const data: PlanData = {
  today: "2026-10-08",
  bookId: "p",
  txs,
  accounts,
  cards: [card],
  statements: [],
  recurrings,
  rates: { usd: 1500, usdt: 1500 },
};

describe("sale de tus cajas", () => {
  it("counts expenses outside cards and statement payments, not credit purchases or own transfers", () => {
    const more = [
      ...txs,
      tx({
        type: "transfer",
        amount: 20_000,
        amountTo: 20_000,
        accountId: "bank",
        counterpartyId: "visa-ars",
        date: "2026-10-06",
      }),
      tx({
        type: "transfer",
        amount: 150_000,
        amountTo: 100,
        accountId: "bank",
        counterpartyId: "usd",
        date: "2026-10-06",
      }),
      tx({ amount: 10, currency: "USD", rateArs: 1450, accountId: "usd", date: "2026-10-07" }),
    ];
    const out = cashOut({ ...data, txs: more }, "2026-10");
    assert.deepEqual(out, {
      ym: "2026-10",
      expenses: 5_000 + 14_500,
      cardPayments: 20_000,
      total: 39_500,
    });
  });
});

describe("history", () => {
  it("median helper", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 3]), 2);
    assert.equal(median([]), 0);
  });

  it("uses complete months since the first movement, splits cash and card, skips fijos and cuotas", () => {
    const h = history(data);
    assert.deepEqual(h.months, ["2026-09"]);
    assert.equal(h.cardVariable, 30_000);
    assert.equal(h.cashVariable, 0);
    assert.equal(h.variableIncome, 0);
    assert.deepEqual(h.byCategory, { alimentos: 30_000 });
  });

  it("median of three months per category", () => {
    const three = [
      tx({ amount: 100, date: "2026-07-05", accountId: "bank" }),
      tx({ amount: 300, date: "2026-08-05", accountId: "bank" }),
      tx({ amount: 200, date: "2026-09-05", accountId: "bank" }),
      tx({ amount: 900, date: "2026-09-06", accountId: "bank", categoryId: "ocio" }),
    ];
    const h = history({ ...data, txs: three });
    assert.equal(h.cashVariable, 300);
    assert.deepEqual(h.byCategory, { alimentos: 200 });
  });
});

describe("cashflow projection", () => {
  it("card bills: the overdue closed statement lands now, cuotas and card fijos in their due month", () => {
    const bills = cardBills(data, 4).map((b) => [b.ym, b.period, b.totalArs, b.closed]);
    assert.deepEqual(bills, [
      ["2026-10", "2026-09", 30_000, true],
      ["2026-11", "2026-10", 13_000, false],
      ["2026-12", "2026-11", 15_000, false],
      ["2027-01", "2026-12", 15_000, false],
      ["2027-02", "2027-01", 5_000, false],
    ]);
  });

  it("pending fijos skip cards, other books and what is already loaded", () => {
    assert.deepEqual(
      pendingFijos(data, "2026-10", "expense").map((f) => f.name),
      ["Alquiler"],
    );
    assert.deepEqual(pendingFijos(data, "2026-10", "income"), []);
  });

  it("projects months with fijos, statements and day-to-day spending", () => {
    assert.equal(liquidBalance(data), 1_795_000 + 750_000);
    const flow = projectCashflow(data, 3);
    const [oct, nov, dec] = flow.months;
    assert.deepEqual(oct!.out, { fijos: 300_000, cards: 30_000, variable: 0 });
    assert.equal(oct!.outSoFar, 5_000);
    assert.equal(oct!.totalIn, 800_000);
    assert.equal(oct!.endBalance, 2_545_000 - 330_000);
    // Credit spending of a typical month (30.000) minus what is already loaded in October.
    assert.deepEqual(nov!.out, { fijos: 300_000, cards: 13_000 + 27_000, variable: 0 });
    assert.equal(nov!.net, 460_000);
    assert.deepEqual(dec!.out, { fijos: 300_000, cards: 15_000 + 30_000, variable: 0 });
    assert.equal(dec!.endBalance, 2_215_000 + 460_000 + 455_000);
    assert.equal(monthlySurplus(flow), 457_500);
  });

  it("caps the horizon at 12 months", () => {
    assert.equal(projectCashflow(data, 40).months.length, 12);
  });
});

const goal = (extra: Partial<Goal>): Goal => ({
  id: "g",
  bookId: "p",
  kind: "viaje",
  name: "Viaje",
  currency: "USD",
  target: 2000,
  saved: 500,
  deadline: "2027-04-08",
  priority: 2,
  active: true,
  createdAt: "",
  updatedAt: "",
  ...extra,
});

describe("goal plan", () => {
  const rates = { usd: 1500, usdt: 1500 };

  it("months until the deadline", () => {
    assert.equal(monthsUntil("2026-10-08", "2027-04-08"), 6);
    assert.equal(monthsUntil("2026-10-08", "2026-10-20"), 1);
    assert.equal(monthsUntil("2026-10-08", ""), 0);
  });

  it("on track when the surplus covers it; the rest goes to goals without a date", () => {
    const [viaje, fondo] = goalPlan(
      [
        goal({}),
        goal({
          id: "f",
          name: "Fondo",
          kind: "ahorro",
          currency: "ARS",
          target: 1_000_000,
          saved: 0,
          deadline: "",
        }),
      ],
      457_500,
      "2026-10-08",
      rates,
    );
    assert.equal(viaje!.needed, 250);
    assert.equal(viaje!.onTrack, true);
    assert.equal(viaje!.eta, "2027-04");
    assert.equal(fondo!.assignedArs, 82_500);
    assert.equal(fondo!.eta, "2027-11");
    assert.equal(fondo!.onTrack, null);
    assert.equal(fondo!.usdHint, true);
  });

  it("when it does not reach, shares by need and gives a realistic date", () => {
    const lines = goalPlan(
      [
        goal({}),
        goal({
          id: "a",
          name: "Auto",
          kind: "bien",
          currency: "ARS",
          target: 10_000_000,
          saved: 0,
          deadline: "2027-01-08",
        }),
      ],
      457_500,
      "2026-10-08",
      rates,
    );
    const auto = lines.find((l) => l.goal.id === "a")!;
    assert.equal(auto.onTrack, false);
    assert.equal(auto.assignedArs, 397_826);
    assert.equal(auto.eta, "2028-12");
    assert.equal(auto.usdHint, false);
  });

  it("no surplus: no date", () => {
    const [line] = goalPlan([goal({})], 0, "2026-10-08", rates);
    assert.equal(line!.eta, "");
    assert.equal(line!.onTrack, false);
  });

  it("skips done and inactive goals", () => {
    assert.equal(
      goalPlan([goal({ saved: 2000 }), goal({ active: false })], 1, "2026-10-08", rates).length,
      0,
    );
  });
});

const alertInput = (extra: Partial<AlertInput> = {}): AlertInput => ({
  ...data,
  budgetRows: [],
  globalBudget: 0,
  monthSpent: 0,
  projected: 0,
  goals: [],
  ...extra,
});

describe("alerts", () => {
  it("overdue statement with estimated interest, new and ending cuotas", () => {
    const a = cardAlerts(alertInput());
    const ids = a.map((x) => x.id);
    assert.deepEqual(ids, [
      "vencido:visa:2026-09",
      "cuotas-nuevas:visa:2026-10",
      "cuotas-fin:visa:2026-12",
    ]);
    assert.match(a[0]!.text, /quedan \$\s?30\.000/);
    assert.match(a[0]!.text, /1\.307/);
    assert.match(a[1]!.text, /arranca 1 compra en cuotas: \$\s?10\.000 más por mes/);
    assert.match(a[2]!.text, /desde enero son \$\s?10\.000 menos/);
  });

  it("closing soon, due soon with what is missing in the bank, USD with own dollars, limit", () => {
    const poor = accounts.map((x) => (x.id === "bank" ? { ...x, opening: 0 } : x));
    const set = [
      tx({ amount: 30_000, date: "2026-09-10" }),
      tx({ amount: 10, currency: "USD", rateArs: 0, accountId: "visa-usd", date: "2026-09-12" }),
      tx({
        type: "income",
        amount: 20_000,
        date: "2026-10-01",
        accountId: "bank",
        categoryId: "sueldo",
      }),
    ];
    const a = cardAlerts(
      alertInput({
        today: "2026-10-03",
        txs: set,
        accounts: poor,
        cards: [{ ...card, limitArs: 50_000 }],
      }),
    );
    const byId = Object.fromEntries(a.map((x) => [x.id.split(":")[0], x.text]));
    assert.match(
      byId.vence!,
      /vence el 5\/10: \$\s?30\.000 \+ US\$\s?10,00\. En Banco tenés \$\s?20\.000: te faltan \$\s?10\.000\./,
    );
    assert.match(byId.usd!, /no pagás \$\s?4\.500 de percepción/);
    assert.match(byId.limite!, /Usás el 90 % del límite/);
    const closing = cardAlerts(alertInput({ today: "2026-10-21", txs: [], cards: [card] }));
    assert.match(
      closing[0]!.text,
      /La Visa cierra el 23\/10\. Lo que compres después lo pagás recién en diciembre\./,
    );
  });

  it("paid the minimum: warns with the cost, not as overdue", () => {
    const statements = [
      {
        id: "s",
        bookId: "p",
        cardId: "visa",
        period: "2026-09",
        closingDate: "2026-09-23",
        dueDate: "2026-10-05",
        nextClosingDate: "",
        nextDueDate: "",
        totalArs: 30_000,
        totalUsd: 0,
        minimumArs: 3_000,
        chargesArs: 0,
        importedAt: "",
      },
    ] as unknown as PlanData["statements"];
    const paid = tx({
      type: "transfer",
      amount: 3_000,
      amountTo: 3_000,
      accountId: "bank",
      counterpartyId: "visa-ars",
      date: "2026-10-04",
      cardPeriod: "2026-09",
    });
    const a = cardAlerts(
      alertInput({ txs: [tx({ amount: 30_000, date: "2026-09-10" }), paid], statements }),
    );
    assert.equal(a[0]!.id, "minimo:visa:2026-09");
    assert.match(
      a[0]!.text,
      /Pagaste el mínimo de la Visa\. Lo que queda \(\$\s?27\.000\) se financia\./,
    );
  });

  it("budgets: 80 % before day 20, over the tope any day, global pace", () => {
    const rows = [
      { id: "alimentos", name: "Alimentos", spent: 45_000, budget: 50_000 },
      { id: "ocio", name: "Ocio", spent: 12_000, budget: 10_000 },
      { id: "ropa", name: "Ropa", spent: 1_000, budget: 50_000 },
    ];
    const a = budgetAlerts(
      alertInput({
        budgetRows: rows,
        globalBudget: 400_000,
        monthSpent: 100_000,
        projected: 500_000,
      }),
    );
    assert.deepEqual(
      a.map((x) => x.id),
      ["tope:ocio:2026-10", "tope80:alimentos:2026-10", "ritmo:2026-10"],
    );
    assert.match(a[1]!.text, /Llevás el 90 % de Alimentos y faltan 23 días\./);
    const late = budgetAlerts(alertInput({ today: "2026-10-25", budgetRows: rows }));
    assert.deepEqual(
      late.map((x) => x.id),
      ["tope:ocio:2026-10"],
    );
  });

  it("goal behind and order: worst first", () => {
    const lines = goalPlan([goal({ deadline: "2026-12-08" })], 100_000, "2026-10-08", {
      usd: 1500,
      usdt: 1500,
    });
    const all = planAlerts(alertInput({ goals: lines }));
    assert.equal(all[0]!.tone, "bad");
    const meta = all.find((x) => x.id.startsWith("meta:"))!;
    assert.match(
      meta.text,
      /Viaje: con lo que sobra por mes llegás en septiembre 2028, no en diciembre 2026\. Hacen falta US\$\s?500,00 por mes\./,
    );
  });
});
