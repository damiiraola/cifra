import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readPdfItems } from "./statement-pdf.ts";
import {
  amountInText,
  buildImport,
  checkTotals,
  cleanPdfInput,
  holderNameTokens,
  isPdf,
  itemsToLines,
  parseModelStatement,
  redactLine,
  reviewLines,
  statementDates,
  statementSchema,
  textForModel,
  type ImportChoice,
  type ParsedStatement,
} from "./statement-import.ts";
import { closingOf, deriveInstallments, dueOf, periodForCard } from "./card-math.ts";
import type { BankStatement, Card, CardPurchase, Transaction } from "./types.ts";

const DIR = new URL("../../test-fixtures/statements/", import.meta.url);
const pdf = (name: string) => new Uint8Array(readFileSync(new URL(`${name}.pdf`, DIR)));
const expected = JSON.parse(readFileSync(new URL("expected.json", DIR), "utf8")) as Record<string, ParsedStatement>;
const FORMATS = ["visa-galicia", "mastercard-santander", "amex-galicia", "visa-nacion"];
const CATS = ["alimentos", "transporte", "servicios", "salud", "ocio", "compras", "suscripciones", "impuestos", "otros"];

async function textOf(name: string, password = "") {
  const r = await readPdfItems(pdf(name), password);
  assert.ok(r.ok, `could not read ${name}`);
  return textForModel(itemsToLines(r.items), "Martina Ficticia");
}

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
  tna: 0,
  archived: false,
};

const tx = (extra: Partial<Transaction>): Transaction => ({
  id: "t",
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

describe("statement PDF text", () => {
  for (const name of FORMATS) {
    it(`${name}: keeps movements and totals, drops personal data`, async () => {
      const { text, amountLines } = await textOf(name);
      assert.ok(amountLines >= 10, `amount lines ${amountLines}`);
      for (const bad of ["MARTINA", "FICTICIA", "SOSA", "27-30111222-4", "30111222", "SIEMPRE VIVA", "martina.ficticia", "(1405)", "0123456789"]) {
        assert.ok(!text.includes(bad), `${bad} leaked`);
      }
      assert.ok(!/\b\d{4} [X*]{4}/.test(text), "card number leaked");
      assert.match(text, /CIERRE ACTUAL/);
      assert.match(text, /SALDO ANTERIOR/);
      assert.match(text, /PAGO MINIMO/);
      // Every amount the right reading has is printed in what the model sees.
      for (const l of expected[name]!.lines) assert.ok(amountInText(l.amount, text), `${l.description} ${l.amount}`);
    });
  }

  it("tags amounts in the dollars column", async () => {
    const { text } = await textOf("visa-galicia");
    assert.match(text, /NETFLIX\.COM USD 9,99 {2}U\$S 9,99/);
    assert.match(text, /COTO SUC 123 {2}45\.300,50$/m);
    assert.match(text, /SALDO ANTERIOR {2}210\.000,00 {2}U\$S 15,00/);
  });

  it("asks for the password, rejects a wrong one, opens with the right one", async () => {
    assert.deepEqual(await readPdfItems(pdf("visa-galicia-clave")), { ok: false, error: "password" });
    assert.deepEqual(await readPdfItems(pdf("visa-galicia-clave"), "1234"), { ok: false, error: "badPassword" });
    const { amountLines } = await textOf("visa-galicia-clave", "30111222");
    assert.ok(amountLines >= 10);
  });

  it("a scanned PDF has no text", async () => {
    const { amountLines } = await textOf("escaneado");
    assert.equal(amountLines, 0);
  });

  it("garbage is not a PDF", async () => {
    assert.equal(isPdf(new TextEncoder().encode("hola")), false);
    assert.equal(isPdf(pdf("visa-galicia")), true);
    assert.deepEqual(await readPdfItems(new TextEncoder().encode("%PDF-1.4 roto")), { ok: false, error: "unreadable" });
  });

  it("redacts cards, CUITs, mails, long numbers and the holder's name", () => {
    const names = holderNameTokens(["JUAN CARLOS PEREZ  CUIT 20-12345678-9"], "");
    assert.deepEqual(names.sort(), ["CARLOS", "JUAN", "PEREZ"]);
    assert.equal(
      redactLine("TOTAL CONSUMOS DE JUAN CARLOS PEREZ 1.000,00 tarjeta 4509 1234 5678 9012 cuit 20-12345678-9 a@b.com 12345678", names),
      "TOTAL CONSUMOS DE [titular] 1.000,00 tarjeta [tarjeta] cuit [cuit] [mail] [nro]",
    );
    assert.equal(redactLine("FRAVEGA C.03/12 50.000,00", names), "FRAVEGA C.03/12 50.000,00");
  });
});

describe("model answer", () => {
  it("every synthetic format adds up to the bank's totals", () => {
    for (const name of FORMATS) {
      const st = parseModelStatement(JSON.stringify(expected[name]), CATS)!;
      assert.ok(st, name);
      const c = checkTotals(st);
      assert.equal(c.ars.status, "ok", `${name} ARS ${c.ars.expected} vs ${c.ars.bank}`);
      assert.equal(c.usd.status, "ok", `${name} USD ${c.usd.expected} vs ${c.usd.bank}`);
    }
  });

  it("a missing line shows up as a mismatch", () => {
    const st = parseModelStatement(expected["visa-nacion"], CATS)!;
    st.lines.splice(1, 1);
    const c = checkTotals(st);
    assert.equal(c.ars.status, "mismatch");
    assert.equal(c.ok, false);
    assert.equal(c.ars.diff, -23410);
  });

  it("rejects garbage and normalizes fields", () => {
    assert.equal(parseModelStatement("no json"), null);
    assert.equal(parseModelStatement({ lines: "x" }), null);
    const st = parseModelStatement(
      "```json\n" +
        JSON.stringify({
          closingDate: "2026-02-30",
          dueDate: "2026-10-06",
          totalArs: -1000,
          lines: [
            { date: "2026-09-01", description: "  A   B ", installmentNo: 5, installmentCount: 3, currency: "EUR", amount: -10, kind: "x", categoryId: "nope" },
            { date: "x", description: "", amount: 0 },
            { date: null, description: "SELLOS", amount: 5, kind: "charge", categoryId: "nope" },
          ],
        }) +
        "\n```",
      CATS,
    )!;
    assert.equal(st.closingDate, null, "invalid date");
    assert.equal(st.totalArs, 1000);
    assert.equal(st.lines.length, 2);
    assert.deepEqual(st.lines[0], {
      date: "2026-09-01",
      description: "A B",
      installmentNo: null,
      installmentCount: null,
      currency: "ARS",
      amount: 10,
      kind: "purchase",
      categoryId: "otros",
    });
    assert.equal(st.lines[1]!.categoryId, "impuestos");
  });

  it("an amount not printed in the PDF is flagged", () => {
    const text = "COTO 45.300,50\nYPF 38.250,00\nX 9,99";
    assert.equal(amountInText(45300.5, text), true);
    assert.equal(amountInText(38250, text), true);
    assert.equal(amountInText(9.99, text), true);
    assert.equal(amountInText(38200, text), false);
    assert.equal(amountInText(45300.5, "COTO 45300,50"), true, "without thousands separator");
  });

  it("schema is strict: every field required, no extras", () => {
    const s = statementSchema(CATS) as { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean };
    assert.equal(s.additionalProperties, false);
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
    const item = (s.properties.lines as { items: { required: string[]; properties: Record<string, unknown> } }).items;
    assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
  });

  it("validates the upload", () => {
    assert.throws(() => cleanPdfInput({}), /tarjeta/);
    assert.throws(() => cleanPdfInput({ cardId: "c" }), /PDF/);
    assert.throws(() => cleanPdfInput({ cardId: "c", pdf: "no base64!" }), /dañado/);
    assert.throws(() => cleanPdfInput({ cardId: "c", pdf: "A".repeat(4_300_000) }), /grande/);
    const ok = cleanPdfInput({ cardId: "c", pdf: "JVBERi0=", password: 12, categories: [{ id: "x", name: "X", kind: "expense" }, 3] });
    assert.deepEqual(ok, { cardId: "c", pdf: "JVBERi0=", password: "", categories: [{ id: "x", name: "X", kind: "expense" }] });
  });
});

describe("matching and import", () => {
  const st = parseModelStatement(expected["visa-galicia"], CATS)!;
  const fravega: CardPurchase = {
    id: "fr",
    bookId: "p",
    cardId: "visa",
    date: "2026-09-10",
    merchant: "Fravega",
    categoryId: "compras",
    currency: "ARS",
    installments: 12,
    installmentAmount: 50_000,
    total: 600_000,
    interestFree: true,
    cashPrice: 0,
    paidBefore: 2,
    note: "",
  };
  const txs = [
    tx({ id: "coto", amount: 45300.5, date: "2026-08-29", merchant: "Coto", cardPeriod: "2026-09" }),
    tx({ id: "ypf", amount: 38000, date: "2026-09-05", merchant: "YPF", cardPeriod: "2026-09" }),
    tx({ id: "farma", amount: 12890, date: "2026-09-19", merchant: "Farmacity", cardPeriod: "2026-10" }),
    tx({ id: "other-card", amount: 4.5, currency: "USD", accountId: "amex-usd", date: "2026-09-15" }),
    ...deriveInstallments(fravega, card),
  ];
  const review = reviewLines(st, card, txs, "");
  const by = (d: string) => review.find((r) => r.line.description.startsWith(d))!;

  it("same, diff and new", () => {
    assert.equal(by("COTO").status, "same");
    assert.equal(by("COTO").matchId, "coto");
    assert.equal(by("YPF").status, "diff", "within 1 % but not the same amount");
    assert.equal(by("YPF").matchAmount, 38000);
    assert.equal(by("FRAVEGA").status, "same", "cuota 3/12 matches by number");
    assert.equal(by("FRAVEGA").matchIsCuota, true);
    assert.equal(by("FARMACITY").status, "same");
    assert.equal(by("SPOTIFY").status, "new", "other card does not count");
    assert.equal(by("NETFLIX").status, "new");
    assert.equal(by("DEVOLUCION").status, "new");
    assert.equal(review.filter((r) => r.status === "new").length, 5);
  });

  it("a cuota that is not loaded becomes a purchase from that cuota on", () => {
    const fresh = reviewLines(st, card, [], "");
    const dates = statementDates(st, card, [], "2026-10-04");
    assert.deepEqual(dates, {
      period: "2026-09",
      closing: "2026-09-24",
      due: "2026-10-06",
      nextClosing: "2026-10-22",
      nextDue: "2026-11-04",
      guessed: false,
    });
    const choices = Object.fromEntries(fresh.map((r) => [r.key, { include: true }]));
    const plan = buildImport({ st, review: fresh, choices, card, txs: [], dates, statementId: "s1" });
    assert.equal(plan.purchases.length, 1);
    const p = plan.purchases[0]!;
    assert.equal(p.installments, 12);
    assert.equal(p.paidBefore, 2);
    assert.equal(p.installmentAmount, 50_000);
    assert.equal(p.total, 600_000);
    assert.equal(p.date, "2026-09-24");
    assert.match(p.note, /compra del 02\/09\/26/);
    // With the statement saved, its cuota 3 lands in September's statement (closing 24, not 23).
    const cuotas = deriveInstallments({ ...p, id: "np", bookId: "p" }, card, [plan.statement]);
    assert.equal(cuotas[0]!.installmentNo, 3);
    assert.equal(cuotas[0]!.cardPeriod, "2026-09");
    assert.equal(cuotas[1]!.cardPeriod, "2026-10");

    assert.equal(plan.adds.length, 8);
    const usd = plan.adds.find((a) => a.merchant === "NETFLIX.COM")!;
    assert.equal(usd.accountId, "visa-usd");
    assert.equal(usd.currency, "USD");
    assert.equal(usd.cardPeriod, "2026-09");
    const refund = plan.adds.find((a) => a.merchant.startsWith("DEVOLUCION"))!;
    assert.equal(refund.type, "income");
    assert.equal(refund.categoryId, "otros-ing");
    assert.equal(plan.statement.totalArs, 150014.6);
    assert.equal(plan.statement.totalUsd, 14.49);
    assert.equal(plan.statement.minimumArs, 41000);
    assert.equal(plan.statement.chargesArs, 5574.1);
  });

  it("only approved lines go in; fixes and statement moves for matches", () => {
    const choices: Record<string, ImportChoice> = Object.fromEntries(review.map((r) => [r.key, { include: false }]));
    choices[by("NETFLIX").key] = { include: true, categoryId: "ocio" };
    choices[by("YPF").key] = { include: true };
    const dates = statementDates(st, card, [], "2026-10-04");
    const plan = buildImport({ st, review, choices, card, txs, dates, statementId: "s1" });
    assert.equal(plan.adds.length, 1);
    assert.equal(plan.adds[0]!.categoryId, "ocio");
    assert.deepEqual(plan.fixes, [{ id: "ypf", amount: 38250 }]);
    assert.deepEqual(plan.moves, [{ id: "farma", cardPeriod: "2026-09" }], "Cifra had it in October");
    assert.equal(plan.purchases.length, 0);
  });
});

describe("real dates from the bank", () => {
  const st: BankStatement = {
    id: "s",
    bookId: "p",
    cardId: "visa",
    period: "2026-09",
    closingDate: "2026-09-26",
    dueDate: "2026-10-08",
    nextClosingDate: "2026-10-21",
    nextDueDate: "2026-11-03",
    totalArs: 0,
    totalUsd: 0,
    minimumArs: 0,
    chargesArs: 0,
    importedAt: "",
  };

  it("uses the statement's closing and the next one it announces", () => {
    assert.equal(closingOf(card, "2026-09", [st]), "2026-09-26");
    assert.equal(dueOf(card, "2026-09", [st]), "2026-10-08");
    assert.equal(closingOf(card, "2026-10", [st]), "2026-10-21");
    assert.equal(dueOf(card, "2026-10", [st]), "2026-11-03");
    assert.equal(closingOf(card, "2026-11", [st]), "2026-11-23", "default after that");
  });

  it("moves the boundary both ways", () => {
    assert.equal(periodForCard("2026-09-25", card, []), "2026-10");
    assert.equal(periodForCard("2026-09-25", card, [st]), "2026-09", "closes on the 26th this time");
    assert.equal(periodForCard("2026-10-22", card, [st]), "2026-11", "closes on the 21st next");
    assert.equal(periodForCard("2026-10-21", card, [st]), "2026-10");
    assert.equal(periodForCard("2026-12-10", card, [st]), "2026-12");
  });
});
