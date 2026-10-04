import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cardDebt,
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
import type { Account, Card, Transaction } from "./types.ts";

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
