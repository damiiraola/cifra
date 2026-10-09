import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { Sql } from "./db.ts";
import {
  FEEDBACK_PER_DAY,
  betaMetrics,
  feedbackMail,
  normalizeFeedback,
  saveFeedback,
} from "./beta-feedback.ts";

function wrap(run: (text: string, params: unknown[]) => Promise<unknown[]>): Sql {
  const tag = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + (i ? `$${i}` : "") + s, "");
    return run(text, values);
  }) as Sql;
  tag.query = ((text: string, params?: unknown[]) => run(text, params ?? [])) as Sql["query"];
  return tag;
}

/** Every real migration, in order, like production (0019 twice: it must be re-runnable). */
async function db() {
  const pg = new PGlite();
  const dir = new URL("../../migrations/", import.meta.url);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) await pg.exec(readFileSync(new URL(f, dir), "utf8"));
  await pg.exec(readFileSync(new URL("0019_beta_feedback.sql", dir), "utf8"));
  return { pg, sql: wrap(async (t, p) => (await pg.query(t, p)).rows) };
}

const user = (id: string, email: string, extra = "") =>
  `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('${id}', 'X', '${email}', true, now() ${extra}, now());`;

describe("Contanos", () => {
  it("normalizes what comes from the client", () => {
    assert.equal(normalizeFeedback({ message: "   " }), null);
    assert.deepEqual(
      normalizeFeedback({
        kind: "otra",
        message: " hola ",
        page: "/tarjetas?token=x#y",
        contactOk: "si",
      }),
      {
        kind: "comentario",
        message: "hola",
        page: "/tarjetas",
        contactOk: false,
      },
    );
    assert.equal(normalizeFeedback({ message: "x".repeat(5000) })!.message.length, 2000);
    assert.equal(normalizeFeedback({ message: "x", page: "https://evil" })!.page, null);
  });

  it("puts the sender's mail in the owner's notice only if they said so", () => {
    const fb = {
      kind: "problema" as const,
      message: "No carga el PDF",
      page: "/tarjetas",
      contactOk: false,
    };
    const a = feedbackMail(fb, "duenio@x.com", "ana@mail.com");
    assert.equal(a.to, "duenio@x.com");
    assert.ok(!JSON.stringify(a).includes("ana@mail.com"));
    const b = feedbackMail({ ...fb, contactOk: true }, "duenio@x.com", "ana@mail.com");
    assert.ok(JSON.stringify(b.ledger).includes("ana@mail.com"));
    assert.match(b.subject, /problema/);
  });

  it("saves, brakes after the daily limit and goes away with the account", async () => {
    const { pg, sql } = await db();
    await pg.exec(user("u1", "ana@mail.com"));
    assert.equal((await saveFeedback(sql, "u1", { message: "" })).result, "vacio");
    for (let i = 0; i < FEEDBACK_PER_DAY; i++)
      assert.equal((await saveFeedback(sql, "u1", { message: `m${i}` })).result, "ok");
    assert.equal((await saveFeedback(sql, "u1", { message: "uno más" })).result, "tope");
    await pg.exec(`delete from "user" where id = 'u1'`);
    const left = (await pg.query<{ n: number }>("select count(*)::int n from beta_feedback"))
      .rows[0]!.n;
    assert.equal(left, 0, "on delete cascade");
  });
});

describe("números de /panel", () => {
  it("counts only aggregates, and only accounts that still exist", async () => {
    const { pg, sql } = await db();
    await pg.exec(`
      ${user("u1", "a@x.com")}
      ${user("u2", "b@x.com", "- interval '30 days'")}
      update "user" set "emailVerified" = false where id = 'u2';
      insert into "session" (id, "expiresAt", token, "updatedAt", "userId") values ('s1', now() + interval '1 day', 't1', now(), 'u1');
      insert into ledger_cards (id, user_id, book_id, name, closing_day, due_day, account_ars_id, account_usd_id) values ('c1', 'u1', 'b', 'Visa', 1, 10, 'a', 'b'), ('c2', 'borrado', 'b', 'Visa', 1, 10, 'a', 'b');
      insert into ai_call_log (day, user_id, kind, result, cost_usd) values (current_date, 'u2', 'asistente', 'ok', 0.001), (current_date, 'u2', 'asistente', 'ok', 0.002), (current_date, null, 'pdf', 'ok', 0.01);
      insert into ledger_settings (user_id, budgets, global_budget, usd_rate, goals) values ('u2', '{}', 0, 1, '[{"id":"g"}]');
      insert into beta_invites (code, max_uses, uses) values ('AAAA2222', 1, 1), ('BBBB3333', 3, 1), ('CCCC4444', 1, 0);
      insert into beta_waitlist (email) values ('w@x.com');
      insert into beta_feedback (user_id, kind, message, page, contact_ok) values ('u1', 'idea', 'Modo claro', '/', true);
    `);
    const m = await betaMetrics(sql);
    assert.deepEqual(m.invites, { codes: 3, usable: 2, used: 2, waitlist: 1 });
    assert.deepEqual(m.users, { total: 2, verified: 1, new7: 1, active7: 1 });
    const f = Object.fromEntries(m.features.map((x) => [x.key, x]));
    assert.equal(f.tarjetas!.users, 1, "the deleted account's card does not count");
    assert.equal(f.asistente!.users, 1);
    assert.equal(f.asistente!.uses30, 2);
    assert.equal(f.pdf!.uses30, 1);
    assert.equal(f.metas!.users, 1);
    assert.equal(m.feedback.total, 1);
    assert.deepEqual(Object.keys(m.feedback.recent[0]!).sort(), [
      "contactOk",
      "createdAt",
      "kind",
      "message",
      "page",
    ]);
  });
});
