import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import type { Sql } from "./db.ts";
import {
  CODE_LENGTH,
  WAITLIST_PER_HOUR,
  codeFromBytes,
  consumeInvite,
  createInvites,
  inviteLink,
  inviteUsable,
  joinWaitlist,
  listInvites,
  listWaitlist,
  normalizeCode,
  normalizeEmail,
  refundInvite,
  revokeInvite,
  signupMode,
} from "./beta-invites.ts";
import { gateSignUp, settleSignUp, userCreateAllowed, type Grants } from "./auth/invite-gate.ts";
import { isBetaOwner } from "./beta-owner.ts";

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
  await pg.exec(`create table "user" (id text primary key, email text not null);`);
  // The real migration, twice: it must be safe to re-run.
  const migration = readFileSync(
    new URL("../../migrations/0018_beta_invites.sql", import.meta.url),
    "utf8",
  );
  await pg.exec(migration);
  await pg.exec(migration);
  return { pg, sql: wrap(async (t, p) => (await pg.query(t, p)).rows) };
}

describe("beta: modo de registro", () => {
  it("is closed unless SIGNUP_MODE=abierto", () => {
    assert.equal(signupMode({}), "invitacion");
    assert.equal(signupMode({ SIGNUP_MODE: "" }), "invitacion");
    assert.equal(signupMode({ SIGNUP_MODE: "open" }), "invitacion");
    assert.equal(signupMode({ SIGNUP_MODE: " Abierto " }), "abierto");
  });
});

describe("beta: códigos", () => {
  it("are 8 readable characters and normalize what people paste", () => {
    const code = codeFromBytes(new Uint8Array(CODE_LENGTH).map((_, i) => i * 37));
    assert.match(code, /^[A-HJKMNP-Z2-9]{8}$/);
    assert.equal(normalizeCode(" abcd-efgh "), "ABCDEFGH");
    assert.equal(normalizeCode("ab"), "");
    assert.equal(normalizeCode(null), "");
    assert.equal(
      inviteLink("https://cifra.lol/", "ABCD2345"),
      "https://cifra.lol/login?modo=crear&invitacion=ABCD2345",
    );
    assert.equal(normalizeEmail(" Ana@Mail.COM "), "ana@mail.com");
    assert.equal(normalizeEmail("ana"), "");
  });

  it("a single-use code works once, can be refunded, revoked and expires", async () => {
    const { pg, sql } = await db();
    let n = 0;
    const [a, b] = await createInvites(
      sql,
      { count: 2, maxUses: 1, note: "facu" },
      () => `CODE000${++n}`,
    );
    assert.equal(await inviteUsable(sql, a!), true);
    assert.equal(await consumeInvite(sql, a!), true);
    assert.equal(await consumeInvite(sql, a!), false, "used up");
    await refundInvite(sql, a!);
    assert.equal(await consumeInvite(sql, a!), true, "refunded slot works again");
    await revokeInvite(sql, b!);
    assert.equal(await consumeInvite(sql, b!), false, "revoked");
    assert.equal(await consumeInvite(sql, "NOEXISTE"), false);
    assert.equal(await consumeInvite(sql, ""), false);
    await pg.exec(
      `insert into beta_invites (code, expires_at) values ('VIEJO234', now() - interval '1 day')`,
    );
    assert.equal(await consumeInvite(sql, "VIEJO234"), false, "expired");
    const list = await listInvites(sql);
    assert.equal(list.length, 3);
    assert.equal(list.find((i) => i.code === a)!.uses, 1);
    assert.equal(list.find((i) => i.code === b)!.revoked, true);
    assert.equal(list.find((i) => i.code === a)!.note, "facu");
  });

  it("a code with several uses can't go past its limit, even at the same time", async () => {
    const { sql } = await db();
    const [c] = await createInvites(sql, { count: 1, maxUses: 3 }, () => "GRUPO234");
    const tries = await Promise.all(Array.from({ length: 6 }, () => consumeInvite(sql, c!)));
    assert.equal(tries.filter(Boolean).length, 3);
  });

  it("clamps what the owner asks for", async () => {
    const { sql } = await db();
    let n = 0;
    const codes = await createInvites(
      sql,
      { count: 500, maxUses: 1000 },
      () => `C${String(++n).padStart(7, "0")}`,
    );
    assert.equal(codes.length, 20);
    assert.equal((await listInvites(sql))[0]!.maxUses, 100);
  });
});

describe("beta: lista de espera", () => {
  it("keeps one row per mail and brakes floods", async () => {
    const { pg, sql } = await db();
    assert.equal(await joinWaitlist(sql, "no-es-mail"), "invalido");
    assert.equal(await joinWaitlist(sql, "Ana@Mail.com"), "ok");
    assert.equal(await joinWaitlist(sql, "ana@mail.com"), "ok");
    assert.equal((await listWaitlist(sql)).length, 1);
    await pg.exec(
      `insert into beta_waitlist (email) select 'bot' || g || '@x.com' from generate_series(1, ${WAITLIST_PER_HOUR}) g`,
    );
    assert.equal(await joinWaitlist(sql, "otra@mail.com"), "ocupado");
  });
});

describe("beta: candado del registro en el servidor", () => {
  it("rejects sign-up without a usable code and lets a valid one in once", async () => {
    const { pg, sql } = await db();
    await pg.exec(`insert into beta_invites (code) values ('INVITA23')`);
    const grants: Grants = new Map();
    const gate = (body: unknown) => gateSignUp({ sql, mode: "invitacion", body, grants });
    assert.equal(await gate({ email: "ana@mail.com" }), "denied");
    assert.equal(await gate({ email: "ana@mail.com", invitation: "MALCODIGO" }), "denied");
    assert.equal(userCreateAllowed({ mode: "invitacion", email: "ana@mail.com", grants }), false);
    assert.equal(await gate({ email: "Ana@mail.com", invitation: "invita-23" }), "granted");
    assert.equal(userCreateAllowed({ mode: "invitacion", email: "ana@mail.com", grants }), true);
    await settleSignUp({ sql, body: { email: "ana@mail.com" }, failed: false, grants });
    assert.equal(
      userCreateAllowed({ mode: "invitacion", email: "ana@mail.com", grants }),
      false,
      "grant is per request",
    );
    assert.equal(
      await gate({ email: "beto@mail.com", invitation: "INVITA23" }),
      "denied",
      "single use",
    );
  });

  it("gives the slot back when the sign-up failed", async () => {
    const { pg, sql } = await db();
    await pg.exec(`insert into beta_invites (code) values ('INVITA23')`);
    const grants: Grants = new Map();
    assert.equal(
      await gateSignUp({
        sql,
        mode: "invitacion",
        body: { email: "a@b.co", invitation: "INVITA23" },
        grants,
      }),
      "granted",
    );
    await settleSignUp({ sql, body: { email: "a@b.co" }, failed: true, grants });
    assert.equal(await inviteUsable(sql, "INVITA23"), true);
  });

  it("doesn't spend a code on a mail that already has an account", async () => {
    const { pg, sql } = await db();
    await pg.exec(
      `insert into "user" values ('u1', 'ana@mail.com'); insert into beta_invites (code) values ('INVITA23')`,
    );
    const grants: Grants = new Map();
    assert.equal(
      await gateSignUp({
        sql,
        mode: "invitacion",
        body: { email: "ANA@mail.com", invitation: "INVITA23" },
        grants,
      }),
      "pass",
    );
    assert.equal(await inviteUsable(sql, "INVITA23"), true);
  });

  it("the owner's mail never needs a code", async () => {
    const { sql } = await db();
    const grants: Grants = new Map();
    const isOwnerEmail = (e: string) => e === "duenio@cifra.test";
    assert.equal(
      await gateSignUp({
        sql,
        mode: "invitacion",
        body: { email: "Duenio@cifra.test" },
        grants,
        isOwnerEmail,
      }),
      "granted",
    );
    assert.equal(
      userCreateAllowed({ mode: "invitacion", email: "duenio@cifra.test", grants }),
      true,
    );
    await settleSignUp({ sql, body: { email: "duenio@cifra.test" }, failed: true, grants });
    assert.equal(
      await gateSignUp({
        sql,
        mode: "invitacion",
        body: { email: "otro@cifra.test" },
        grants,
        isOwnerEmail,
      }),
      "denied",
    );
  });

  it("an old grant does not let a user row in", () => {
    const grants: Grants = new Map([["ana@mail.com", { code: "X", at: 0 }]]);
    assert.equal(
      userCreateAllowed({ mode: "invitacion", email: "ana@mail.com", grants, now: 10 * 60_000 }),
      false,
    );
  });

  it("open mode lets everyone in without touching the codes", async () => {
    const { sql } = await db();
    const grants: Grants = new Map();
    assert.equal(
      await gateSignUp({ sql, mode: "abierto", body: { email: "a@b.co" }, grants }),
      "pass",
    );
    assert.equal(userCreateAllowed({ mode: "abierto", email: "a@b.co", grants }), true);
  });
});

describe("beta: dueño", () => {
  it("DEV_OWNER_EMAIL only counts locally, never with a real database or on Vercel", () => {
    assert.equal(isBetaOwner("dev@local.test", false, { DEV_OWNER_EMAIL: "dev@local.test" }), true);
    assert.equal(
      isBetaOwner("dev@local.test", true, {
        DEV_OWNER_EMAIL: "dev@local.test",
        DATABASE_URL: "postgres://x",
      }),
      false,
    );
    assert.equal(
      isBetaOwner("dev@local.test", true, { DEV_OWNER_EMAIL: "dev@local.test", VERCEL: "1" }),
      false,
    );
    assert.equal(
      isBetaOwner("dev@local.test", true, {
        DEV_OWNER_EMAIL: "dev@local.test",
        NODE_ENV: "production",
      }),
      false,
    );
    assert.equal(isBetaOwner("otro@local.test", true, {}), false);
  });
});
