import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cardDebt,
  committedForMonth,
  cuotaId,
  deriveInstallments,
  financedInMonth,
  financingCost,
  installmentAmounts,
  limitUse,
  purchaseProgress,
  staleCuotaIds,
  upcomingStatements,
  cardForAccount,
  cardPeriodFor,
  closingDate,
  dueDate,
  lastClosedStatement,
  missingVaultCards,
  openStatement,
  periodFor,
  statementTotals,
  validLast4,
} from "./card-math.ts";
import { accountBalance, accountLabel, inferAccount } from "./books.ts";
import type { Account, Card, CardPurchase, Recurring, Transaction } from "./types.ts";

const card: Card = {
  id: "visa",
  bookId: "p",
  name: "Visa Galicia",
  bank: "Galicia",
  network: "visa",
  last4: "1234",
  closingDay: 23,
  dueDay: 5,
  limitArs: 0,
  accountArsId: "visa-ars",
  accountUsdId: "visa-usd",
  payAccountId: "bank",
  usdPerceptionPct: 30,
  tna: 0,
  archived: false,
};

const accounts: Account[] = [
  { id: "cash", bookId: "p", name: "Efectivo", kind: "cash", currency: "ARS", opening: 0, archived: false },
  { id: "bank", bookId: "p", name: "Banco", kind: "bank", currency: "ARS", opening: 100_000, archived: false },
  { id: "usd", bookId: "p", name: "Dólares", kind: "cash", currency: "USD", opening: 0, archived: false },
  { id: "visa-ars", bookId: "p", name: "Visa Galicia", kind: "card", currency: "ARS", opening: 0, archived: false },
  { id: "visa-usd", bookId: "p", name: "Visa Galicia USD", kind: "card", currency: "USD", opening: 0, archived: false },
];

const tx = (extra: Partial<Transaction>): Transaction => ({
  id: "t",
  type: "expense",
  amount: 1000,
  currency: "ARS",
  categoryId: "alimentos",
  note: "",
  merchant: "",
  date: "2026-10-10",
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

describe("card periods", () => {
  it("a purchase goes to the first closing on or after its date", () => {
    assert.equal(periodFor("2026-10-10", 23), "2026-10");
    assert.equal(periodFor("2026-10-23", 23), "2026-10", "closing day itself goes into that statement");
    assert.equal(periodFor("2026-10-24", 23), "2026-11");
    assert.equal(periodFor("2026-12-28", 23), "2027-01", "crosses the year");
  });

  it("closing days past the end of a short month use its last day", () => {
    assert.equal(periodFor("2026-02-28", 30), "2026-02");
    assert.equal(closingDate("2026-02", 30), "2026-02-28");
    assert.equal(periodFor("2026-03-01", 30), "2026-03");
  });

  it("the due date is the first due day after the closing", () => {
    assert.equal(dueDate("2026-10", 23, 5), "2026-11-05");
    assert.equal(dueDate("2026-10", 5, 15), "2026-10-15", "due later the same month");
    assert.equal(dueDate("2026-12", 23, 5), "2027-01-05");
    assert.equal(dueDate("2026-01", 28, 31), "2026-01-31");
    assert.equal(dueDate("2026-01", 31, 31), "2026-02-28", "same day = next month, clamped");
  });

  it("only expenses and refunds on a card caja get a period", () => {
    assert.equal(cardPeriodFor([card], tx({ date: "2026-10-24" })), "2026-11");
    assert.equal(cardPeriodFor([card], tx({ accountId: "bank" })), "");
    assert.equal(cardPeriodFor([card], tx({ type: "transfer", counterpartyId: "visa-ars", accountId: "bank" })), "");
    assert.equal(cardPeriodFor([card], tx({ type: "income", accountId: "visa-usd" })), "2026-10");
  });

  it("keeps a hand-set period while the date and card stay the same", () => {
    const prev = tx({ cardPeriod: "2026-11" });
    assert.equal(cardPeriodFor([card], tx({ cardPeriod: "2026-11" }), prev), "2026-11");
    assert.equal(cardPeriodFor([card], tx({ cardPeriod: "2026-11", date: "2026-10-11" }), prev), "2026-10");
  });

  it("finds the card behind a caja", () => {
    assert.equal(cardForAccount([card], "visa-usd")?.id, "visa");
    assert.equal(cardForAccount([card], "bank"), undefined);
    assert.equal(cardForAccount([card], ""), undefined);
  });
});

describe("statements", () => {
  const txs = [
    tx({ id: "a", amount: 30_000, date: "2026-10-02" }),
    tx({ id: "b", amount: 12_500.5, date: "2026-10-23" }),
    tx({ id: "c", amount: 8_000, date: "2026-10-24" }),
    tx({ id: "d", amount: 20, currency: "USD", accountId: "visa-usd", date: "2026-10-05" }),
    tx({ id: "e", type: "income", amount: 2_000, date: "2026-10-12", categoryId: "otros-ing" }),
    tx({ id: "f", amount: 5_000, date: "2026-09-20" }),
    tx({ id: "g", amount: 999, accountId: "bank", method: "debito" }),
    tx({ id: "h", amount: 700, date: "2026-10-01", cardPeriod: "2026-11" }),
  ];

  it("sums expenses minus refunds per currency, by stored or computed period", () => {
    const oct = statementTotals(card, txs, "2026-10");
    assert.equal(oct.ars, 30_000 + 12_500.5 - 2_000);
    assert.equal(oct.usd, 20);
    assert.equal(oct.closing, "2026-10-23");
    assert.equal(oct.due, "2026-11-05");
    assert.equal(statementTotals(card, txs, "2026-11").ars, 8_000 + 700, "hand-moved h counts in November");
  });

  it("open and last closed statement depend on today", () => {
    assert.equal(openStatement(card, txs, "2026-10-20").period, "2026-10");
    assert.equal(openStatement(card, txs, "2026-10-25").period, "2026-11");
    assert.equal(lastClosedStatement(card, txs, "2026-10-25").ars, 40_500.5);
    assert.equal(lastClosedStatement(card, txs, "2026-10-20").ars, 5_000);
  });

  it("a card caja balance is debt; paying the statement is a Cambio, not an expense", () => {
    const ars = accounts.find((a) => a.id === "visa-ars")!;
    const bank = accounts.find((a) => a.id === "bank")!;
    const pay = tx({ id: "p", type: "transfer", accountId: "bank", counterpartyId: "visa-ars", amount: 30_000, method: "transferencia" });
    const all = [tx({ id: "x", amount: 50_000 }), pay];
    assert.equal(accountBalance(bank, [tx({ id: "x", amount: 50_000 })]), 100_000, "buying on credit does not touch the bank");
    assert.equal(cardDebt(ars, accountBalance(ars, all)), 20_000);
    assert.equal(accountBalance(bank, all), 70_000);
    assert.equal(cardDebt(ars, 500), 0, "credit in favour is not debt");
    assert.equal(cardDebt(bank, -500), 0, "only card cajas carry debt");
  });
});

describe("crédito goes to the card, not the bank", () => {
  it("picks the card caja in that currency", () => {
    assert.equal(inferAccount(accounts, "p", "credito", "ARS"), "visa-ars");
    assert.equal(inferAccount(accounts, "p", "credito", "USD"), "visa-usd");
  });

  it("without a card it falls back to the bank, as before", () => {
    const noCard = accounts.filter((a) => a.kind !== "card");
    assert.equal(inferAccount(noCard, "p", "credito", "ARS"), "bank");
  });

  it("other methods never land on a card caja", () => {
    assert.equal(inferAccount(accounts, "p", "debito", "ARS"), "bank");
    assert.equal(inferAccount(accounts, "p", "efectivo", "USD"), "usd");
    assert.equal(inferAccount(accounts, "p", "debito", "USDT"), "cash", "no USDT caja: first money caja, not a card");
    const onlyCards = accounts.filter((a) => a.kind === "card");
    assert.equal(inferAccount(onlyCards, "p", "debito", "ARS"), "");
  });

  it("archived cards are skipped", () => {
    const archived = accounts.map((a) => (a.kind === "card" ? { ...a, archived: true } : a));
    assert.equal(inferAccount(archived, "p", "credito", "ARS"), "bank");
  });
});

describe("helpers", () => {
  it("labels cajas without repeating the currency", () => {
    assert.equal(accountLabel(accounts[1]!), "Banco · ARS");
    assert.equal(accountLabel(accounts[4]!), "Visa Galicia USD");
    assert.equal(accountLabel(accounts[3]!), "Visa Galicia · ARS");
  });

  it("keeps only 4 digits", () => {
    assert.equal(validLast4("1234"), "1234");
    assert.equal(validLast4("12 34"), "1234");
    assert.equal(validLast4("4509 1234 5678 9012"), "", "never a full number");
    assert.equal(validLast4(""), "");
  });

  it("brings back cards a backup has and the server lost, onto the current books", () => {
    const vault = {
      books: [{ id: "old-p", name: "Personal", kind: "personal" as const }],
      accounts: accounts.map((a) => ({ ...a, bookId: "old-p" })),
      cards: [{ ...card, bookId: "old-p" }],
    };
    const books = [{ id: "new-p", name: "Personal", kind: "personal" as const }];
    const lost = missingVaultCards(vault, books, [], []);
    assert.equal(lost.cards.length, 1);
    assert.equal(lost.cards[0]!.bookId, "new-p");
    assert.deepEqual(lost.accounts.map((a) => [a.id, a.bookId, a.kind]), [
      ["visa-ars", "new-p", "card"],
      ["visa-usd", "new-p", "card"],
    ]);
    assert.equal(missingVaultCards(vault, books, [card], []).cards.length, 0, "already there");
  });
});

const purchase = (extra: Partial<CardPurchase>): CardPurchase => ({
  id: "p1",
  bookId: "p",
  cardId: "visa",
  date: "2026-10-10",
  merchant: "Heladera",
  categoryId: "hogar",
  currency: "ARS",
  installments: 12,
  installmentAmount: 50_000,
  total: 600_000,
  interestFree: true,
  cashPrice: 0,
  paidBefore: 0,
  note: "",
  ...extra,
});

describe("cuotas", () => {
  it("interest-free cuotas add up to the total, rounding on the last", () => {
    const a = installmentAmounts({ installments: 3, installmentAmount: 0, total: 100, interestFree: true });
    assert.deepEqual(a, [33.33, 33.33, 33.34]);
    assert.equal(a.reduce((x, y) => x + y, 0).toFixed(2), "100.00");
    const b = installmentAmounts({ installments: 6, installmentAmount: 12_345.67, total: 0, interestFree: false });
    assert.equal(b.length, 6);
    assert.ok(b.every((x) => x === 12_345.67));
  });

  it("12 cuotas: one per month, one per statement, starting at the purchase", () => {
    const cs = deriveInstallments(purchase({}), card);
    assert.equal(cs.length, 12);
    assert.equal(cs[0]!.id, cuotaId("p1", 1));
    assert.equal(cs[0]!.date, "2026-10-10");
    assert.equal(cs[0]!.cardPeriod, "2026-10");
    assert.equal(cs[1]!.date, "2026-11-01");
    assert.equal(cs[1]!.cardPeriod, "2026-11");
    assert.equal(cs[11]!.date, "2027-09-01");
    assert.equal(cs[11]!.cardPeriod, "2027-09");
    assert.ok(cs.every((t) => t.accountId === "visa-ars" && t.method === "credito" && t.amount === 50_000));
    assert.equal(cs[3]!.installmentNo, 4);
    assert.equal(cs[3]!.installmentCount, 12);
    assert.match(cs[3]!.note, /^Cuota 4\/12/);
  });

  it("bought after the closing: first cuota goes to the next statement", () => {
    const cs = deriveInstallments(purchase({ date: "2026-10-25", installments: 3, total: 300 }), card);
    assert.deepEqual(cs.map((t) => t.cardPeriod), ["2026-11", "2026-12", "2027-01"]);
    assert.deepEqual(cs.map((t) => t.date), ["2026-10-25", "2026-11-01", "2026-12-01"]);
  });

  it("a purchase already running loads only from the current cuota", () => {
    const cs = deriveInstallments(purchase({ paidBefore: 4 }), card);
    assert.equal(cs.length, 8);
    assert.equal(cs[0]!.installmentNo, 5);
    assert.equal(cs[0]!.date, "2026-10-10");
    assert.equal(cs[7]!.installmentNo, 12);
  });

  it("USD purchases go to the USD caja of the card", () => {
    const cs = deriveInstallments(purchase({ currency: "USD", installments: 2, total: 200 }), card);
    assert.ok(cs.every((t) => t.accountId === "visa-usd" && t.currency === "USD"));
  });

  it("cuotas keep their statement even if dated before the closing", () => {
    const [, second] = deriveInstallments(purchase({ date: "2026-10-25", installments: 2, total: 2 }), card);
    assert.equal(cardPeriodFor([card], second!), "2026-12");
  });

  it("an edit to fewer cuotas drops the extra ones", () => {
    const now = deriveInstallments(purchase({}), card);
    const next = deriveInstallments(purchase({ installments: 6, total: 300_000 }), card);
    const stale = staleCuotaIds([...now, tx({ id: "other" })], "p1", next);
    assert.deepEqual(stale, [7, 8, 9, 10, 11, 12].map((k) => cuotaId("p1", k)));
  });

  it("progress: cuota you are on and what is left", () => {
    const cs = deriveInstallments(purchase({}), card);
    const pr = purchaseProgress(purchase({}), cs, "2026-12-15");
    assert.equal(pr.current, 3);
    assert.equal(pr.left, 450_000);
  });
});

describe("financing cost", () => {
  it("no cost when cuotas add up to the cash price", () => {
    const c = financingCost(120_000, 10_000, 12);
    assert.equal(c.extra, 0);
    assert.equal(c.tea, 0);
  });

  it("finds the implicit rate", () => {
    // 12 cuotas at 1 % monthly over 100.000: cuota ≈ 8884.88.
    const c = financingCost(100_000, 8884.88, 12);
    assert.ok(Math.abs(c.monthly - 0.01) < 1e-4, String(c.monthly));
    assert.ok(Math.abs(c.tea - 0.1268) < 1e-3, String(c.tea));
    assert.equal(c.extra, 6618.56);
  });
});

describe("next statements", () => {
  const fijo: Recurring = {
    id: "netflix",
    bookId: "p",
    type: "expense",
    name: "Netflix",
    amount: 9000,
    currency: "ARS",
    categoryId: "ocio",
    accountId: "visa-ars",
    method: "credito",
    day: 15,
    note: "",
    active: true,
  };

  it("adds cuotas, unposted fijos on the card and cuotas that end", () => {
    const cs = deriveInstallments(purchase({ installments: 3, total: 300_000 }), card);
    const txs = [...cs, tx({ id: "super", amount: 20_000, date: "2026-10-12" })];
    const up = upcomingStatements(card, txs, [fijo], "2026-10-12", 4);
    assert.deepEqual(up.map((u) => u.period), ["2026-10", "2026-11", "2026-12", "2027-01"]);
    // October: cuota 1 + super + Netflix of 15/10 (not posted yet).
    assert.equal(up[0]!.ars, 100_000 + 20_000 + 9000);
    assert.equal(up[0]!.cuotasArs, 100_000);
    assert.equal(up[0]!.fijosArs, 9000);
    assert.equal(up[2]!.ending.count, 1);
    assert.equal(up[2]!.ending.ars, 100_000);
    assert.equal(up[3]!.ars, 9000, "only the fijo after cuotas end");
  });

  it("a posted fijo is not counted twice", () => {
    const posted = tx({ id: "rec_netflix_2026-10", recurringId: "netflix", amount: 9000, date: "2026-10-15" });
    const up = upcomingStatements(card, [posted], [fijo], "2026-10-16", 1);
    assert.equal(up[0]!.ars, 9000);
    assert.equal(up[0]!.fijosArs, 0);
  });
});

describe("limit and commitments", () => {
  it("limit use counts USD at the rate", () => {
    assert.equal(limitUse(card, 100, 0, 1000), null, "no limit set");
    const u = limitUse({ ...card, limitArs: 1_000_000 }, 400_000, 100, 1000)!;
    assert.equal(u.used, 500_000);
    assert.equal(u.pct, 0.5);
    assert.equal(u.free, 500_000);
  });

  it("committed for a month: cuotas dated that month + fijos not loaded", () => {
    const cs = deriveInstallments(purchase({}), card);
    const usd = deriveInstallments(purchase({ id: "p2", currency: "USD", installments: 2, total: 20 }), card).map((t) => ({ ...t, rateArs: 1000 }));
    const r: Recurring = { id: "gym", bookId: "p", type: "expense", name: "Gym", amount: 30_000, currency: "ARS", categoryId: "salud", accountId: "bank", method: "debito", day: 5, note: "", active: true };
    const c = committedForMonth([...cs, ...usd], [r], "2026-11", 1200);
    assert.equal(c.cuotas, 50_000 + 10 * 1000);
    assert.equal(c.fijos, 30_000);
    assert.equal(c.total, 90_000);
  });

  it("financed this month: new purchases only", () => {
    const f = financedInMonth(
      [purchase({}), purchase({ id: "old", paidBefore: 3 }), purchase({ id: "usd", currency: "USD", total: 100 }), purchase({ id: "nov", date: "2026-11-02" })],
      "2026-10",
      1000,
    );
    assert.equal(f.count, 2);
    assert.equal(f.total, 600_000 + 100_000);
  });
});

describe("imported movements", () => {
  it("a new movement that already knows its statement keeps it", () => {
    assert.equal(cardPeriodFor([card], { type: "expense", accountId: "visa-ars", date: "2026-08-20", cardPeriod: "2026-09" }), "2026-09");
    assert.equal(cardPeriodFor([card], { type: "expense", accountId: "visa-ars", date: "2026-08-20", cardPeriod: "" }), "2026-08");
  });
});
