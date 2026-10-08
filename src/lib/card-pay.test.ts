import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estimatedInterest,
  gapCharge,
  lastClosedBalance,
  paymentMovements,
  perceptionFor,
  periodName,
  planCreditMove,
  statementBalance,
  PERCEPTION_NOTE,
} from "./card-pay.ts";
import { cardPeriodFor } from "./card-math.ts";
import { accountBalance } from "./books.ts";
import { chargeCategory } from "./statement-import.ts";
import type { Account, BankStatement, Card, Transaction } from "./types.ts";

const card: Card = {
  id: "visa",
  bookId: "p",
  name: "Visa Galicia",
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
  { id: "bank", bookId: "p", name: "Banco", kind: "bank", currency: "ARS", opening: 1_000_000, archived: false },
  { id: "usd", bookId: "p", name: "Dólares", kind: "cash", currency: "USD", opening: 500, archived: false },
  { id: "visa-ars", bookId: "p", name: "Visa Galicia", kind: "card", currency: "ARS", opening: 0, archived: false },
  { id: "visa-usd", bookId: "p", name: "Visa Galicia USD", kind: "card", currency: "USD", opening: 0, archived: false },
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
  date: "2026-09-10",
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

const pay = (amount: number, date: string, extra: Partial<Transaction> = {}) =>
  tx({ type: "transfer", amount, amountTo: amount, accountId: "bank", counterpartyId: "visa-ars", date, method: "transferencia", categoryId: "transferencias", ...extra });

const asTx = (d: Omit<Transaction, "id" | "createdAt">): Transaction => ({ ...d, id: `d${++n}`, createdAt: "" });

describe("statement balance", () => {
  const aug = tx({ amount: 10_000, date: "2026-08-10" });
  const sep = tx({ amount: 20_000, date: "2026-09-10" });

  it("paid in full: nothing carries over", () => {
    const b = statementBalance(card, [aug, sep, pay(10_000, "2026-09-03")], "2026-09", "2026-10-01");
    assert.equal(b.carriedArs, 0);
    assert.equal(b.chargesArs, 20_000);
    assert.equal(b.owedArs, 20_000);
    assert.equal(b.leftArs, 20_000);
    assert.equal(b.status, "a-pagar");
    assert.equal(b.due, "2026-10-05");
  });

  it("partial payment: the rest is carried into the next statement", () => {
    const b = statementBalance(card, [aug, sep, pay(4_000, "2026-09-03")], "2026-09", "2026-10-01");
    assert.equal(b.carriedArs, 6_000);
    assert.equal(b.cifraArs, 26_000);
    assert.equal(b.owedArs, 26_000);
    const augB = statementBalance(card, [aug, sep, pay(4_000, "2026-09-03")], "2026-08", "2026-10-01");
    assert.equal(augB.paidArs, 4_000);
    assert.equal(augB.leftArs, 6_000);
    assert.equal(augB.status, "vencido");
  });

  it("status follows payments and the due date", () => {
    const txs = [aug, sep, pay(10_000, "2026-09-03")];
    assert.equal(statementBalance(card, txs, "2026-09", "2026-10-08").status, "vencido");
    assert.equal(statementBalance(card, [...txs, pay(5_000, "2026-09-30")], "2026-09", "2026-10-02").status, "parcial");
    const done = statementBalance(card, [...txs, pay(20_000, "2026-10-04")], "2026-09", "2026-10-08");
    assert.equal(done.status, "pagado");
    assert.equal(done.leftArs, 0);
    assert.equal(statementBalance(card, [], "2026-09", "2026-10-08").status, "sin-deuda");
  });

  it("lastClosedBalance picks the statement closed before today", () => {
    assert.equal(lastClosedBalance(card, [sep], "2026-10-01").period, "2026-09");
    assert.equal(lastClosedBalance(card, [sep], "2026-09-23").period, "2026-08");
  });

  it("the bank's total and minimum win when the statement was imported", () => {
    const st: BankStatement = {
      id: "s",
      bookId: "p",
      cardId: "visa",
      period: "2026-09",
      closingDate: "2026-09-24",
      dueDate: "2026-10-06",
      nextClosingDate: "2026-10-22",
      nextDueDate: "2026-11-04",
      totalArs: 20_250,
      totalUsd: 14.49,
      minimumArs: 5_000,
      chargesArs: 250,
      importedAt: "",
    };
    const b = statementBalance(card, [sep, pay(5_000, "2026-10-01")], "2026-09", "2026-10-02", [st]);
    assert.equal(b.owedArs, 20_250);
    assert.equal(b.owedUsd, 14.49);
    assert.equal(b.due, "2026-10-06");
    assert.equal(b.minimumArs, 5_000);
    assert.equal(b.minimumCovered, true);
    assert.equal(b.leftArs, 15_250);
    const gap = gapCharge(card, b)!;
    assert.equal(gap.amount, 250);
    assert.equal(gap.categoryId, "intereses");
    assert.equal(gap.cardPeriod, "2026-09");
    assert.equal(gap.accountId, "visa-ars");
  });

  it("debt loaded as the card caja's opening counts as carried", () => {
    const withDebt = accounts.map((a) => (a.id === "visa-ars" ? { ...a, opening: -7_000 } : a));
    const b = statementBalance(card, [sep], "2026-09", "2026-10-01", [], withDebt);
    assert.equal(b.carriedArs, 7_000);
    assert.equal(b.owedArs, 27_000);
  });

  it("USD consumos and payments are tracked apart", () => {
    const u = tx({ amount: 14.49, currency: "USD", accountId: "visa-usd", date: "2026-09-11" });
    const p = tx({ type: "transfer", amount: 14.49, amountTo: 14.49, currency: "USD", accountId: "usd", counterpartyId: "visa-usd", date: "2026-10-01" });
    const b = statementBalance(card, [sep, u, p], "2026-09", "2026-10-02");
    assert.equal(b.owedUsd, 14.49);
    assert.equal(b.paidUsd, 14.49);
    assert.equal(b.leftUsd, 0);
    assert.equal(b.leftArs, 20_000);
  });
});

describe("paying", () => {
  it("ARS: a Cambio into the card tagged with the statement, not an expense", () => {
    const [m, ...rest] = paymentMovements(card, { date: "2026-10-04", period: "2026-09", ars: { fromId: "bank", amount: 20_000.4 } });
    assert.equal(rest.length, 0);
    assert.equal(m!.type, "transfer");
    assert.equal(m!.amount, 20_000);
    assert.equal(m!.amountTo, 20_000);
    assert.equal(m!.accountId, "bank");
    assert.equal(m!.counterpartyId, "visa-ars");
    assert.equal(m!.cardPeriod, "2026-09");
    assert.match(m!.note, /septiembre 2026/);
  });

  it("USD with your own dollars: no perception", () => {
    const out = paymentMovements(card, { date: "2026-10-04", period: "2026-09", usd: { mode: "dolares", fromId: "usd", amount: 14.49 } });
    assert.equal(out.length, 1);
    assert.equal(out[0]!.currency, "USD");
    assert.equal(out[0]!.counterpartyId, "visa-usd");
    assert.equal(out[0]!.amount, 14.49);
  });

  it("USD in pesos: pesos at the rate plus the perception as an expense in Impuestos", () => {
    const out = paymentMovements(card, {
      date: "2026-10-04",
      period: "2026-09",
      usd: { mode: "pesos", fromId: "bank", amount: 14.49, rate: 1000 },
    });
    assert.equal(out.length, 2);
    const [cambio, perc] = out;
    assert.equal(cambio!.type, "transfer");
    assert.equal(cambio!.amount, 14_490);
    assert.equal(cambio!.amountTo, 14.49);
    assert.equal(cambio!.counterpartyId, "visa-usd");
    assert.equal(cambio!.rateArs, 1000);
    assert.equal(perc!.type, "expense");
    assert.equal(perc!.categoryId, "impuestos");
    assert.equal(perc!.amount, 4_347);
    assert.equal(perc!.accountId, "bank");
    assert.ok(perc!.note.includes(PERCEPTION_NOTE));
    assert.equal(perc!.cardPeriod, "");
    assert.equal(perceptionFor(14.49, 1000, 0), 0);
  });

  it("after paying, the bank goes down and the card debt goes to zero", () => {
    const u = tx({ amount: 14.49, currency: "USD", accountId: "visa-usd", date: "2026-09-11" });
    const sep = tx({ amount: 20_000, date: "2026-09-10" });
    const moves = paymentMovements(card, {
      date: "2026-10-04",
      period: "2026-09",
      ars: { fromId: "bank", amount: 20_000 },
      usd: { mode: "pesos", fromId: "bank", amount: 14.49, rate: 1000 },
    }).map(asTx);
    const txs = [sep, u, ...moves];
    const acc = (id: string) => accounts.find((a) => a.id === id)!;
    assert.equal(accountBalance(acc("visa-ars"), txs), 0);
    assert.equal(Math.round(accountBalance(acc("visa-usd"), txs) * 100) / 100, 0);
    assert.equal(accountBalance(acc("bank"), txs), 1_000_000 - 20_000 - 14_490 - 4_347);
    assert.equal(statementBalance(card, txs, "2026-09", "2026-10-08").status, "pagado");
  });

  it("a payment keeps its statement when saved; other Cambios do not get one", () => {
    const cards = [card];
    assert.equal(cardPeriodFor(cards, { type: "transfer", accountId: "bank", counterpartyId: "visa-ars", date: "2026-10-04", cardPeriod: "2026-09" }), "2026-09");
    assert.equal(cardPeriodFor(cards, { type: "transfer", accountId: "bank", counterpartyId: "usd", date: "2026-10-04", cardPeriod: "2026-09" }), "");
    assert.equal(cardPeriodFor(cards, { type: "transfer", accountId: "bank", counterpartyId: "visa-ars", date: "2026-10-04" }), "");
  });

  it("estimated interest: TNA by days, plus IVA", () => {
    const e = estimatedInterest(100_000, 73, "2026-10-05", "2026-10-22");
    assert.equal(e.days, 17);
    assert.equal(e.interest, 3_400);
    assert.equal(e.iva, 714);
    assert.equal(e.total, 4_114);
    assert.equal(estimatedInterest(100_000, 0, "2026-10-05", "2026-10-22").total, 0);
  });

  it("periodName", () => {
    assert.equal(periodName("2026-09"), "septiembre 2026");
    assert.equal(periodName("2027-01"), "enero 2027");
  });
});

describe("old Crédito expenses → card", () => {
  const old = [
    tx({ id: "a", amount: 5_000, date: "2026-08-10", accountId: "bank" }),
    tx({ id: "b", amount: 3_000, date: "2026-10-01", accountId: "bank" }),
    tx({ id: "c", amount: 10, currency: "USD", date: "2026-09-10", accountId: "usd" }),
    tx({ id: "d", amount: 999, date: "2026-09-10", accountId: "bank", method: "debito" }),
    tx({ id: "e", amount: 999, date: "2026-06-10", accountId: "bank" }),
    tx({ id: "f", amount: 999, date: "2026-09-10", accountId: "bank", purchaseId: "p1" }),
    tx({ id: "g", amount: 999, date: "2026-09-10", accountId: "visa-ars" }),
    tx({ id: "h", amount: 999, date: "2026-09-10", accountId: "bank", bookId: "negocio" }),
  ];

  it("finds only Crédito expenses on normal cajas since the date", () => {
    const plan = planCreditMove(card, old, accounts, "2026-08-01", "2026-10-08");
    assert.deepEqual(plan.moves.map((m) => m.id).sort(), ["a", "b", "c"]);
    assert.equal(plan.ars, 8_000);
    assert.equal(plan.usd, 10);
    assert.deepEqual(plan.moves.find((m) => m.id === "a"), { id: "a", accountId: "visa-ars", cardPeriod: "2026-08" });
    assert.deepEqual(plan.moves.find((m) => m.id === "c"), { id: "c", accountId: "visa-usd", cardPeriod: "2026-09" });
    assert.equal(plan.pendingArs, 3_000);
    assert.equal(plan.settle.length, 2);
    assert.deepEqual(
      plan.settle.map((s) => [s.date, s.currency, s.amount, s.accountId, s.counterpartyId, s.cardPeriod]),
      [
        ["2026-09-05", "ARS", 5_000, "bank", "visa-ars", "2026-08"],
        ["2026-10-05", "USD", 10, "usd", "visa-usd", "2026-09"],
      ],
    );
  });

  it("moving + settling keeps paid statements' balances; only what is not due yet becomes card debt", () => {
    const plan = planCreditMove(card, old, accounts, "2026-08-01", "2026-10-08");
    const moved = old.map((t) => {
      const m = plan.moves.find((x) => x.id === t.id);
      return m ? { ...t, accountId: m.accountId, cardPeriod: m.cardPeriod } : t;
    });
    const after = [...moved, ...plan.settle.map(asTx)];
    const acc = (id: string) => accounts.find((a) => a.id === id)!;
    assert.equal(accountBalance(acc("bank"), after) - accountBalance(acc("bank"), old), 3_000);
    assert.equal(accountBalance(acc("usd"), after), accountBalance(acc("usd"), old));
    assert.equal(accountBalance(acc("visa-ars"), after) - accountBalance(acc("visa-ars"), old), -3_000);
    assert.equal(statementBalance(card, after, "2026-08", "2026-10-08").status, "pagado");
  });
});

describe("bank charges category", () => {
  const ids = new Set(["impuestos", "intereses", "otros"]);
  it("interest and fees go to Intereses y comisiones, taxes to Impuestos", () => {
    assert.equal(chargeCategory("INTERESES FINANCIACION", "impuestos", ids), "intereses");
    assert.equal(chargeCategory("IVA S/INTERESES", "impuestos", ids), "intereses");
    assert.equal(chargeCategory("COMISION MANT CUENTA", "otros", ids), "intereses");
    assert.equal(chargeCategory("IMPUESTO DE SELLOS", "impuestos", ids), "impuestos");
    assert.equal(chargeCategory("PERCEPCION RG 5617", "intereses", ids), "impuestos");
    assert.equal(chargeCategory("IVA RG 4240 21% SERV DIGITALES", "nope", ids), "impuestos");
    assert.equal(chargeCategory("INTERESES", "impuestos", new Set(["impuestos"])), "impuestos");
  });
});
