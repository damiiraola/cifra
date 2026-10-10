import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readPdfItems } from "./statement-pdf.ts";
import {
  buildImport,
  itemsToLines,
  parseModelStatement,
  reviewLines,
  type ImportChoice,
  type ParsedStatement,
} from "./statement-import.ts";
import {
  applyCardChanges,
  cardChanges,
  cardDraftFrom,
  debtFromBefore,
  EMPTY_CARD_INFO,
  extractCardInfo,
  firstDate,
  importedBefore,
  last4Of,
  matchCard,
  missingFields,
  withCardInfo,
  type StatementCardInfo,
} from "./statement-card.ts";
import {
  clearDraft,
  loadDraft,
  saveDraft,
  UPLOAD_DRAFT_KEY,
  type DraftStorage,
} from "./statement-draft.ts";
import type { BankStatement, Card, Transaction } from "./types.ts";

const DIR = new URL("../../test-fixtures/statements/", import.meta.url);
const expected = JSON.parse(readFileSync(new URL("expected.json", DIR), "utf8")) as Record<
  string,
  ParsedStatement
>;

async function infoOf(name: string) {
  const r = await readPdfItems(new Uint8Array(readFileSync(new URL(`${name}.pdf`, DIR))));
  assert.ok(r.ok, name);
  return extractCardInfo(itemsToLines(r.items));
}

const card = (extra: Partial<Card>): Card => ({
  id: "c1",
  bookId: "p",
  name: "Visa Galicia",
  bank: "Galicia",
  network: "visa",
  last4: "",
  closingDay: 23,
  dueDay: 5,
  limitArs: 0,
  accountArsId: "c1-ars",
  accountUsdId: "c1-usd",
  payAccountId: "",
  usdPerceptionPct: 30,
  tna: 0,
  archived: false,
  ...extra,
});

describe("the card, read from the PDF (no IA)", () => {
  it("Visa of a bank: issuer, network, last 4, limit, TNA, dates and totals", async () => {
    assert.deepEqual(await infoOf("visa-galicia"), {
      network: "visa",
      bank: "Galicia",
      last4: "6789",
      limitArs: 2_500_000,
      tna: 98.5,
      closingDate: "2026-09-24",
      dueDate: "2026-10-06",
      nextClosingDate: "2026-10-22",
      nextDueDate: "2026-11-04",
      totalArs: expected["visa-galicia"]!.totalArs,
      totalUsd: expected["visa-galicia"]!.totalUsd,
      minimumArs: 41_000,
    });
  });

  it("Mastercard with **** and dd/mm dates in the movements", async () => {
    const i = await infoOf("mastercard-santander");
    assert.equal(i.network, "master");
    assert.equal(i.bank, "Santander");
    assert.equal(i.last4, "4321");
    assert.equal(i.limitArs, 1_800_000);
    assert.equal(i.dueDate, "2026-10-08");
  });

  it("Amex with an odd mask; a limit that is not printed stays null", async () => {
    const i = await infoOf("amex-galicia");
    assert.equal(i.network, "amex");
    assert.equal(i.last4, "1005");
    assert.equal(i.limitArs, null);
    assert.equal(i.totalUsd, 210);
  });

  it("long issuer name → short name", async () => {
    const i = await infoOf("visa-nacion");
    assert.equal(i.bank, "Nación");
    assert.equal(i.last4, "2468");
  });

  it("other ways banks print it", () => {
    const i = extractCardInfo([
      "Tarjeta Naranja  Resumen de cuenta",
      "Tarjeta terminada en 4321",
      "Fecha de cierre: 24-09-2026   Vto.: 06/10/2026",
      "Prox. cierre 22 octubre 2026",
      "Límite de crédito $ 1.000.000,00",
      "TOTAL A PAGAR $ 5.000,00   TOTAL A PAGAR U$S 10,50",
      "Pago mínimo $ 900,00   TNA: 120,00 %",
      "FECHA  DETALLE  IMPORTE",
    ]);
    assert.equal(i.network, "naranja");
    assert.equal(i.bank, "Naranja X");
    assert.equal(i.last4, "4321");
    assert.equal(i.closingDate, "2026-09-24");
    assert.equal(i.dueDate, "2026-10-06");
    assert.equal(i.nextClosingDate, "2026-10-22");
    assert.equal(i.limitArs, 1_000_000);
    assert.equal(i.totalArs, 5_000);
    assert.equal(i.totalUsd, 10.5);
    assert.equal(i.minimumArs, 900);
    assert.equal(i.tna, 120);
  });

  it("nothing recognisable → nulls, never a guess", () => {
    assert.deepEqual(extractCardInfo(["Resumen", "COMPRA 1.000,00"]), EMPTY_CARD_INFO);
  });

  it("last 4: only from a masked number, never from an amount or a full number", () => {
    assert.equal(last4Of(["Tarjeta 4509 XXXX XXXX 6789"]), "6789");
    assert.equal(last4Of(["Nro XXXX-XXXX-XXXX-1234"]), "1234");
    assert.equal(last4Of(["SALDO 1.234,56  4.567,89"]), null);
    assert.equal(last4Of(["Cuenta N 0123456789"]), null);
  });

  it("dates", () => {
    assert.equal(firstDate("24 sep 26"), "2026-09-24");
    assert.equal(firstDate("24/09/2026"), "2026-09-24");
    assert.equal(firstDate("31/02/26"), null);
    assert.equal(firstDate("06 setiem 2026"), "2026-09-06");
  });

  it("fills what the model missed, keeps what it read", () => {
    const st = parseModelStatement({
      ...expected["amex-galicia"],
      closingDate: null,
      minimumArs: null,
    })!;
    const info: StatementCardInfo = {
      ...EMPTY_CARD_INFO,
      closingDate: "2026-09-25",
      minimumArs: 9_500,
      totalArs: 1,
    };
    const merged = withCardInfo(st, info);
    assert.equal(merged.closingDate, "2026-09-25");
    assert.equal(merged.minimumArs, 9_500);
    assert.equal(merged.totalArs, st.totalArs, "the model's total wins");
  });
});

describe("which card it is", () => {
  const info: StatementCardInfo = {
    ...EMPTY_CARD_INFO,
    network: "visa",
    bank: "Galicia",
    last4: "6789",
  };

  it("same last 4 = that card", () => {
    const m = matchCard(info, [
      card({ id: "a", last4: "1111" }),
      card({ id: "b", last4: "6789", name: "Mi Visa" }),
    ]);
    assert.deepEqual([m?.card.id, m?.how], ["b", "exacta"]);
  });

  it("different last 4 is never the same card, even with the same bank and network", () => {
    assert.equal(matchCard(info, [card({ last4: "1111" })]), null);
  });

  it("a card loaded without last 4: same network and issuer → probably it", () => {
    const m = matchCard(info, [card({ id: "x", bank: "", name: "Visa del Galicia" })]);
    assert.deepEqual([m?.card.id, m?.how], ["x", "probable"]);
  });

  it("two possible cards → ask (no match); archived cards don't count", () => {
    assert.equal(matchCard(info, [card({ id: "a" }), card({ id: "b" })]), null);
    assert.equal(matchCard(info, [card({ id: "a", last4: "6789", archived: true })]), null);
    assert.equal(matchCard({ ...info, network: "master" }, [card({})]), null);
  });

  it("no cards at all (empty state) → a new card", () => {
    assert.equal(matchCard(info, []), null);
  });
});

describe("a new card from the statement", () => {
  it("prefilled with the PDF's data", async () => {
    const info = await infoOf("visa-galicia");
    const st = withCardInfo(parseModelStatement(expected["visa-galicia"])!, info);
    assert.deepEqual(cardDraftFrom(info, st), {
      name: "Visa Galicia",
      bank: "Galicia",
      network: "visa",
      last4: "6789",
      closingDay: 24,
      dueDay: 6,
      limitArs: 2_500_000,
      tna: 98.5,
      usdPerceptionPct: 30,
    });
    assert.deepEqual(missingFields(info, st), []);
  });

  it("what the PDF does not say is marked to complete", async () => {
    const info = await infoOf("amex-galicia");
    const st = parseModelStatement(expected["amex-galicia"])!;
    assert.deepEqual(missingFields(info, st), ["limitArs"]);
    const none = parseModelStatement({
      ...expected["amex-galicia"],
      closingDate: null,
      dueDate: null,
    })!;
    const d = cardDraftFrom(EMPTY_CARD_INFO, none);
    assert.equal(d.network, "otra");
    assert.equal(d.closingDay, null);
    assert.deepEqual(missingFields(EMPTY_CARD_INFO, none), [
      "network",
      "bank",
      "last4",
      "closingDay",
      "dueDay",
      "limitArs",
      "tna",
    ]);
  });

  it("a name that is taken gets the last 4", () => {
    const info: StatementCardInfo = {
      ...EMPTY_CARD_INFO,
      network: "visa",
      bank: "Galicia",
      last4: "6789",
    };
    const st = parseModelStatement(expected["visa-galicia"])!;
    assert.equal(cardDraftFrom(info, st, [card({ last4: "1111" })]).name, "Visa Galicia 6789");
  });

  it("debt that came from before (saldo anterior − pagos) is not a spending of this month", () => {
    assert.deepEqual(debtFromBefore(parseModelStatement(expected["visa-nacion"])!), {
      ars: 30_000,
      usd: 0,
    });
    assert.deepEqual(debtFromBefore(parseModelStatement(expected["visa-galicia"])!), {
      ars: 0,
      usd: 0,
    });
  });

  it("an existing card: offers to update only what changed", () => {
    const st = parseModelStatement(expected["visa-galicia"])!;
    const info: StatementCardInfo = {
      ...EMPTY_CARD_INFO,
      network: "visa",
      bank: "Galicia",
      last4: "6789",
      limitArs: 2_500_000,
    };
    const c = card({ last4: "", closingDay: 24, dueDay: 6 });
    const draft = cardDraftFrom(info, st);
    const changes = cardChanges(c, draft);
    assert.deepEqual(
      changes.map((x) => x.field),
      ["limitArs", "last4"],
    );
    const next = applyCardChanges(c, draft, changes);
    assert.equal(next.limitArs, 2_500_000);
    assert.equal(next.last4, "6789");
    assert.equal(next.id, c.id);
  });
});

describe("the same statement twice", () => {
  const st = parseModelStatement(expected["visa-galicia"])!;
  const c = card({ last4: "6789", closingDay: 24, dueDay: 6 });
  const dates = {
    period: "2026-09",
    closing: "2026-09-24",
    due: "2026-10-06",
    nextClosing: "",
    nextDue: "",
  };
  const choose = (review: ReturnType<typeof reviewLines>): Record<string, ImportChoice> =>
    Object.fromEntries(review.map((r) => [r.key, { include: r.status === "new" }]));

  it("second upload: everything is already loaded, nothing is added again", () => {
    const first = reviewLines(st, c, []);
    assert.ok(first.every((r) => r.status === "new"));
    const plan = buildImport({
      st,
      review: first,
      choices: choose(first),
      card: c,
      txs: [],
      dates,
      statementId: "s1",
    });
    assert.equal(plan.purchases.length, 1, "FRAVEGA 3/12 becomes a purchase in cuotas");
    // What the first import left in the book: plain movements and the purchase's cuota for this statement.
    const txs: Transaction[] = plan.adds.map((a, i) => ({
      ...a,
      id: `t${i}`,
      createdAt: "",
      purchaseId: "",
      installmentNo: 0,
      installmentCount: 0,
    }));
    const p = plan.purchases[0]!;
    txs.push({
      ...plan.adds[0]!,
      id: "cuota3",
      createdAt: "",
      amount: p.installmentAmount,
      merchant: p.merchant,
      purchaseId: "p1",
      installmentNo: 3,
      installmentCount: 12,
      cardPeriod: "2026-09",
    });
    const second = reviewLines(st, c, txs);
    assert.ok(
      second.every((r) => r.status === "same"),
      JSON.stringify(second.map((r) => [r.line.description, r.status])),
    );
    const again = buildImport({
      st,
      review: second,
      choices: choose(second),
      card: c,
      txs,
      dates,
      statementId: "s1",
    });
    assert.equal(again.adds.length + again.purchases.length + again.fixes.length, 0);
    const saved: BankStatement[] = [{ ...plan.statement, importedAt: "2026-10-09" }];
    assert.ok(importedBefore(saved, c.id, "2026-09"), "the review warns it was imported");
    assert.equal(importedBefore(saved, c.id, "2026-10"), null);
  });

  it("a review read without a card survives a reload under its own key", () => {
    const mem = new Map<string, string>();
    const storage: DraftStorage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
    saveDraft(storage, UPLOAD_DRAFT_KEY, { statement: st, card: EMPTY_CARD_INFO });
    assert.ok(loadDraft(storage, UPLOAD_DRAFT_KEY));
    clearDraft(storage, UPLOAD_DRAFT_KEY);
    assert.equal(loadDraft(storage, UPLOAD_DRAFT_KEY), null);
  });
});
