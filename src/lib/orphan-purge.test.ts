import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { ORPHAN_TABLES, purgeOrphans } from "./orphan-purge.ts";

function wrap(run: (text: string, params: unknown[]) => Promise<unknown[]>): Sql {
  const tag = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + (i ? `$${i}` : "") + s, "");
    return run(text, values);
  }) as Sql;
  tag.query = ((text: string, params?: unknown[]) => run(text, params ?? [])) as Sql["query"];
  return tag;
}

async function db() {
  const pg = new PGlite();
  await pg.exec(`create table "user" (id text primary key);
    create table ai_usage (user_id text not null, day date not null, n int);
    ${ORPHAN_TABLES.map((t) => `create table ${t} (n serial, user_id text);`).join("\n")}`);
  const sql = wrap(async (t, p) => (await pg.query(t, p)).rows);
  const withTx = <T>(fn: (tx: Sql) => Promise<T>) =>
    pg.transaction((tx) => fn(wrap(async (t, p) => (await tx.query(t, p)).rows)));
  const count = async (t: string, where = "true") =>
    Number(
      ((await pg.query(`select count(*)::int n from ${t} where ${where}`)).rows[0] as { n: number })
        .n,
    );
  return { pg, sql, withTx, count };
}

describe("purga de filas sin dueño", () => {
  it("borra solo las filas de cuentas que ya no existen", async () => {
    const { pg, sql, withTx, count } = await db();
    await pg.exec(`insert into "user" values ('vivo');
      insert into ledger_backups (user_id) values ('vivo'), ('vivo'), ('borrado'), ('borrado'), ('otro-borrado'), (null);
      insert into ledger_transactions (user_id) values ('vivo'), ('borrado');
      insert into ai_usage values ('borrado', '2026-10-08', 1);`);
    const lines: string[] = [];
    const r = await purgeOrphans(sql, withTx, { log: (l) => lines.push(l) });
    assert.deepEqual(r.deleted, { ledger_transactions: 1, ledger_backups: 3 });
    assert.equal(r.total, 4);
    assert.equal(r.capped, false);
    assert.equal(await count("ledger_backups", "user_id = 'vivo'"), 2, "rows with an owner stay");
    assert.equal(
      await count("ledger_backups", "user_id is null"),
      1,
      "a row without user_id is not guessed",
    );
    assert.equal(await count("ledger_transactions", "user_id = 'vivo'"), 1);
    assert.equal(await count("ai_usage"), 1, "ai_usage is never touched");
    assert.match(
      lines.join("\n"),
      /filas sin dueño borradas: 4 · ledger_transactions=1 ledger_backups=3/,
    );
    // Nothing left: a second run deletes nothing.
    assert.equal((await purgeOrphans(sql, withTx, { log: () => {} })).total, 0);
  });

  it("en lotes y con tope por corrida", async () => {
    const { pg, sql, withTx, count } = await db();
    await pg.exec(`insert into "user" values ('vivo');
      insert into ledger_transactions (user_id) select 'borrado' from generate_series(1, 25);
      insert into ledger_backups (user_id) select 'borrado' from generate_series(1, 5);`);
    const r = await purgeOrphans(sql, withTx, { batch: 4, max: 10, log: () => {} });
    assert.equal(r.total, 10);
    assert.equal(r.capped, true);
    assert.deepEqual(r.deleted, { ledger_transactions: 10 });
    assert.equal(await count("ledger_transactions"), 15);
    assert.equal(await count("ledger_backups"), 5, "past the cap nothing else is touched");
    const rest = await purgeOrphans(sql, withTx, { batch: 4, max: 100, log: () => {} });
    assert.equal(rest.total, 20);
    assert.equal((await count("ledger_transactions")) + (await count("ledger_backups")), 0);
  });

  it("sin usuarios en la base no borra nada", async () => {
    const { pg, sql, withTx, count } = await db();
    await pg.exec(`insert into ledger_settings (user_id) values ('dev-user');`);
    const r = await purgeOrphans(sql, withTx, { log: () => {} });
    assert.equal(r.skipped, "sin usuarios");
    assert.equal(await count("ledger_settings"), 1);
  });

  it("si una tabla falla, esa tabla no queda a medias", async () => {
    const { pg, sql, withTx, count } = await db();
    await pg.exec(`insert into "user" values ('vivo');
      insert into ledger_transactions (user_id) select 'borrado' from generate_series(1, 6);`);
    let calls = 0;
    const failing = <T>(fn: (tx: Sql) => Promise<T>) =>
      withTx(async (tx) => {
        const out = await fn(tx);
        if (++calls === 1) throw new Error("se cortó");
        return out;
      });
    await assert.rejects(purgeOrphans(sql, failing, { batch: 2, log: () => {} }));
    assert.equal(await count("ledger_transactions"), 6, "rolled back");
  });
});
