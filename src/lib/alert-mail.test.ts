import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  alertDigest,
  alertMailsEnabled,
  handleAlertCron,
  handleUnsubscribe,
  isMailAlert,
  ledgerAlerts,
  newMailAlerts,
  unsubscribeUrl,
} from "./alert-mail.ts";
import { renderMailHtml, renderMailText } from "./mail.ts";
import type { PlanAlert } from "./plan/alerts.ts";
import type { Account, Card, Transaction } from "./types.ts";
import type { Goal } from "./goals.ts";

const A = (id: string, tone: PlanAlert["tone"] = "warn", text = `aviso ${id}`): PlanAlert => ({
  id,
  tone,
  text,
  to: "/tarjetas",
});

describe("which alerts go by mail", () => {
  it("only due soon, overdue and goals behind", () => {
    assert.equal(isMailAlert(A("vence:visa:2026-09")), true);
    assert.equal(isMailAlert(A("vencido:visa:2026-09")), true);
    assert.equal(isMailAlert(A("meta:g1:2026-10")), true);
    for (const id of ["cierre:visa:2026-10", "limite:visa:2026-10", "tope:ocio:2026-10", "usd:visa:2026-09", "minimo:visa:2026-09"])
      assert.equal(isMailAlert(A(id)), false, id);
  });

  it("never repeats an alert already mailed, worst first", () => {
    const alerts = [A("meta:g1:2026-10"), A("vencido:visa:2026-09", "bad"), A("vence:master:2026-09"), A("cierre:visa:2026-10", "info")];
    const out = newMailAlerts(alerts, new Set(["vence:master:2026-09"]));
    assert.deepEqual(out.map((a) => a.id), ["vencido:visa:2026-09", "meta:g1:2026-10"]);
    assert.deepEqual(newMailAlerts(alerts, new Set(out.map((a) => a.id).concat("vence:master:2026-09"))), []);
  });

  it("caps the digest", () => {
    const many = Array.from({ length: 12 }, (_, i) => A(`meta:g${i}:2026-10`));
    assert.equal(newMailAlerts(many, new Set(), 8).length, 8);
  });
});

describe("feature flag", () => {
  it("needs ALERT_MAILS_ENABLED=1 and CRON_SECRET", () => {
    assert.equal(alertMailsEnabled({}), false);
    assert.equal(alertMailsEnabled({ ALERT_MAILS_ENABLED: "1" }), false);
    assert.equal(alertMailsEnabled({ CRON_SECRET: "x" }), false);
    assert.equal(alertMailsEnabled({ ALERT_MAILS_ENABLED: "true", CRON_SECRET: "x" }), false);
    assert.equal(alertMailsEnabled({ ALERT_MAILS_ENABLED: "1", CRON_SECRET: "x" }), true);
  });
});

describe("digest mail", () => {
  const token = "a".repeat(48);
  const mail = alertDigest({
    name: "Martina",
    alerts: [A("vencido:visa:2026-09", "bad", "Venció el resumen de septiembre de la Visa: quedan $ 30.000 <b>"), A("meta:g:2026-10")],
    origin: "https://cifra.lol/",
    token,
  });

  it("subject, heading and a link to the alerts", () => {
    assert.equal(mail.subject, "2 avisos de Cifra");
    assert.equal(mail.heading, "Tenés 2 avisos");
    assert.equal(mail.url, "https://cifra.lol/metas#avisos");
    assert.equal(mail.unsubscribeUrl, `https://cifra.lol/api/alertas/baja?t=${token}`);
    assert.match(mail.body, /^Hola Martina\./);
    assert.equal(alertDigest({ alerts: [A("meta:g:2026-10")], origin: "https://cifra.lol", token }).subject, "Un aviso de Cifra");
  });

  it("renders the black template: PNG icon, no SVG, items escaped, unsubscribe link", () => {
    const html = renderMailHtml(mail);
    assert.match(html, /\/mail\/bars\.png/);
    assert.doesNotMatch(html, /<svg|\.svg/i);
    assert.match(html, /color-scheme" content="dark"/);
    assert.match(html, /gmail-blend-screen/);
    assert.match(html, /quedan \$ 30\.000 &lt;b&gt;/);
    assert.doesNotMatch(html, /30\.000 <b>/);
    assert.match(html, /Dejar de recibir estos avisos/);
    assert.ok(html.includes(`/api/alertas/baja?t=${token}`));
    const text = renderMailText(mail);
    assert.match(text, /• Venció el resumen/);
    assert.match(text, /Dejar de recibir estos avisos: https:\/\/cifra\.lol\/api\/alertas\/baja/);
  });

  it("unsubscribe url encodes the token", () => {
    assert.equal(unsubscribeUrl("http://localhost:8095", "ab_c"), "http://localhost:8095/api/alertas/baja?t=ab_c");
  });
});

describe("cron handler", () => {
  const run = async () => ({ users: 1, sent: 1, skipped: 0, failed: 0 });
  const req = (auth?: string) =>
    new Request("https://cifra.lol/api/cron/alertas", { headers: auth ? { authorization: auth } : {} });

  it("does not exist while off", async () => {
    let ran = false;
    const deps = { enabled: false, secret: "s3cret", mailConfigured: () => true, run: async () => ((ran = true), run()) };
    assert.equal((await handleAlertCron(req("Bearer s3cret"), deps)).status, 404);
    assert.equal((await handleAlertCron(req("Bearer s3cret"), { ...deps, enabled: true, secret: " " })).status, 404);
    assert.equal(ran, false);
  });

  it("needs the secret", async () => {
    const deps = { enabled: true, secret: "s3cret", mailConfigured: () => true, run };
    assert.equal((await handleAlertCron(req(), deps)).status, 401);
    assert.equal((await handleAlertCron(req("Bearer nope"), deps)).status, 401);
    const ok = await handleAlertCron(req("Bearer s3cret"), deps);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, users: 1, sent: 1, skipped: 0, failed: 0 });
    assert.equal((await handleAlertCron(req("Bearer s3cret"), { ...deps, mailConfigured: () => false })).status, 500);
  });

  it("also purges the old AI call log, only with the secret, and a failed purge does not stop the mails", async () => {
    let purges = 0;
    const deps = { enabled: true, secret: "s3cret", mailConfigured: () => true, run, purge: async () => (purges++, 7) };
    assert.equal((await handleAlertCron(req("Bearer nope"), deps)).status, 401);
    assert.equal(purges, 0);
    const ok = await handleAlertCron(req("Bearer s3cret"), deps);
    assert.deepEqual(await ok.json(), { ok: true, users: 1, sent: 1, skipped: 0, failed: 0, aiLogPurged: 7 });
    const noMail = await handleAlertCron(req("Bearer s3cret"), { ...deps, mailConfigured: () => false });
    assert.equal(noMail.status, 500);
    assert.equal(purges, 2, "the purge runs even without RESEND_API_KEY");
    const broken = await handleAlertCron(req("Bearer s3cret"), {
      ...deps,
      purge: async () => {
        throw new Error("db");
      },
    });
    assert.equal(broken.status, 200);
    assert.equal((await broken.json()).aiLogPurged, -1);
  });
});

describe("unsubscribe handler", () => {
  const token = "b".repeat(48);
  const url = `https://cifra.lol/api/alertas/baja?t=${token}`;

  it("GET only shows the button (scanners open links)", async () => {
    let calls = 0;
    const res = await handleUnsubscribe(new Request(url), { unsubscribe: async () => (calls++, true) });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /<form method="post"/);
    assert.equal(calls, 0);
  });

  it("POST unsubscribes, also the one-click POST", async () => {
    const seen: string[] = [];
    const res = await handleUnsubscribe(
      new Request(url, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } }),
      { unsubscribe: async (t) => (seen.push(t), true) },
    );
    assert.equal(res.status, 200);
    assert.match(await res.text(), /No te mandamos más avisos/);
    assert.deepEqual(seen, [token]);
  });

  it("bad or unknown token", async () => {
    assert.equal((await handleUnsubscribe(new Request("https://cifra.lol/api/alertas/baja?t=x"), { unsubscribe: async () => true })).status, 400);
    assert.equal((await handleUnsubscribe(new Request(url, { method: "POST" }), { unsubscribe: async () => false })).status, 404);
  });
});

describe("ledgerAlerts", () => {
  const card: Card = {
    id: "visa",
    bookId: "p",
    name: "Visa",
    bank: "",
    network: "visa",
    last4: "",
    closingDay: 23,
    dueDay: 5,
    limitArs: 0,
    accountArsId: "visa-ars",
    accountUsdId: "visa-usd",
    payAccountId: "bank",
    usdPerceptionPct: 30,
    tna: 75,
    archived: false,
  };
  const accounts: Account[] = [
    { id: "bank", bookId: "p", name: "Banco", kind: "bank", currency: "ARS", opening: 100_000, archived: false },
    { id: "visa-ars", bookId: "p", name: "Visa", kind: "card", currency: "ARS", opening: 0, archived: false },
    { id: "visa-usd", bookId: "p", name: "Visa USD", kind: "card", currency: "USD", opening: 0, archived: false },
  ];
  const tx: Transaction = {
    id: "t1",
    type: "expense",
    amount: 30_000,
    currency: "ARS",
    categoryId: "compras",
    note: "",
    merchant: "",
    date: "2026-09-10",
    method: "credito",
    createdAt: "",
    bookId: "p",
    accountId: "visa-ars",
    counterpartyId: "",
    amountTo: 0,
    rateArs: 0,
    rateLocked: false,
    recurringId: "",
    cardPeriod: "",
    purchaseId: "",
    installmentNo: 0,
    installmentCount: 0,
  };
  const goal: Goal = {
    id: "g",
    bookId: "p",
    kind: "viaje",
    name: "Brasil",
    currency: "ARS",
    target: 5_000_000,
    saved: 0,
    deadline: "2026-12-20",
    priority: 2,
    active: true,
    createdAt: "",
    updatedAt: "",
  };

  it("builds the same alerts the app shows, per book", () => {
    const alerts = ledgerAlerts(
      {
        books: [
          { id: "p", name: "Personal", kind: "personal" },
          { id: "n", name: "Negocio", kind: "business" },
        ],
        transactions: [tx],
        accounts,
        cards: [card],
        statements: [],
        recurrings: [],
        goals: [goal],
        usdRate: 1000,
        usdtRate: 1000,
      },
      "2026-10-08",
    );
    const mail = newMailAlerts(alerts, new Set());
    assert.deepEqual(mail.map((a) => a.id), ["vencido:visa:2026-09", "meta:g:2026-10"]);
    assert.match(mail[0]!.text, /Venció el resumen de septiembre de la Visa/);
  });
});
