import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  AI_GLOBAL_CAP,
  AI_GLOBAL_CAP_NOTE,
  DEFAULT_AI_GLOBAL_DAILY_USD,
  MAX_AI_GLOBAL_DAILY_USD,
  PDF_GLOBAL_CAP,
  aiGlobalDailyUsd,
  callLog,
  capLog,
  costSummary,
  daysBefore,
  estimateUsd,
  isOwner,
  monthStart,
  usageFromBody,
  type AiCallLog,
} from "./ai-cost.ts";
import {
  costRowsSince,
  forgetUser,
  insertCallLogs,
  lastDays,
  purgeCallLog,
  spentSince,
  usersOn,
} from "./ai-cost-db.ts";
import type { Sql } from "./db.ts";

const gateway = { id: "gateway" as const, model: "spacexai/grok-4.1-fast-non-reasoning" };
const groq = { id: "groq" as const, model: "openai/gpt-oss-120b" };

describe("AI cost: one call", () => {
  it("uses the Gateway's own usage.cost when it comes", () => {
    const l = callLog(
      "asistente",
      gateway,
      { ok: true, body: { usage: { prompt_tokens: 4000, completion_tokens: 300, cost: 0.00095 } } },
      1234.4,
    );
    assert.deepEqual(l, {
      kind: "asistente",
      provider: "gateway",
      model: "spacexai/grok-4.1-fast-non-reasoning",
      inputTokens: 4000,
      outputTokens: 300,
      costUsd: 0.00095,
      costSource: "gateway",
      latencyMs: 1234,
      result: "ok",
    });
    // Also as a string, or in providerMetadata.
    assert.equal(usageFromBody({ usage: { cost: "0.002" } }).cost, 0.002);
    assert.equal(usageFromBody({ providerMetadata: { gateway: { cost: 0.003 } } }).cost, 0.003);
  });

  it("without it, the price table: Grok on the Gateway, gpt-oss on Groq, unknown models priced high", () => {
    // 4000 × 0.20 + 300 × 0.50 per million.
    assert.equal(estimateUsd("gateway", gateway.model, 4000, 300), 0.00095);
    const g = callLog(
      "pdf",
      groq,
      { ok: true, body: { usage: { prompt_tokens: 10_000, completion_tokens: 2_000 } } },
      9000,
    );
    assert.equal(g.costSource, "tabla");
    assert.equal(g.costUsd, (10_000 * 0.15 + 2_000 * 0.6) / 1_000_000);
    assert.ok(
      estimateUsd("gateway", "nuevo/modelo", 1000, 1000) >
        estimateUsd("gateway", gateway.model, 1000, 1000) * 10,
    );
    // A cost from Groq's body is not trusted as Gateway billing.
    assert.equal(
      callLog(
        "movimiento",
        groq,
        { ok: true, body: { usage: { prompt_tokens: 0, completion_tokens: 0, cost: 9 } } },
        1,
      ).costUsd,
      0,
    );
  });

  it("failures: 429, credit, timeout, error; no tokens, no cost", () => {
    const f = (failure: "busy" | "credit" | "timeout" | "auth" | "other") =>
      callLog("asistente", gateway, { ok: false, failure }, 50).result;
    assert.deepEqual(
      [f("busy"), f("credit"), f("timeout"), f("auth"), f("other")],
      ["429", "credito", "timeout", "error", "error"],
    );
    const l = callLog("asistente", gateway, { ok: false, failure: "busy" }, 50);
    assert.equal(l.costUsd, 0);
    assert.equal(l.costSource, null);
  });

  it("only metadata: no field could carry the question, the answer or an amount", () => {
    const body = {
      choices: [{ message: { content: "Gastaste $ 810.000 en el super" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    };
    const l = callLog("asistente", gateway, { ok: true, body }, 1);
    assert.deepEqual(Object.keys(l).sort(), [
      "costSource",
      "costUsd",
      "inputTokens",
      "kind",
      "latencyMs",
      "model",
      "outputTokens",
      "provider",
      "result",
    ]);
    assert.doesNotMatch(JSON.stringify(l), /810|super|Gastaste/);
  });
});

describe("AI cost: global daily cap", () => {
  it("defaults under the free credit pace ($5 / 30 days) and can only go down", () => {
    assert.ok(DEFAULT_AI_GLOBAL_DAILY_USD * 30 <= 5 * 0.75, "keeps at least 25 % margin");
    assert.ok(MAX_AI_GLOBAL_DAILY_USD * 30 <= 5);
    assert.equal(aiGlobalDailyUsd(undefined), DEFAULT_AI_GLOBAL_DAILY_USD);
    assert.equal(aiGlobalDailyUsd(""), DEFAULT_AI_GLOBAL_DAILY_USD);
    assert.equal(aiGlobalDailyUsd("abc"), DEFAULT_AI_GLOBAL_DAILY_USD);
    assert.equal(aiGlobalDailyUsd("-1"), DEFAULT_AI_GLOBAL_DAILY_USD);
    assert.equal(aiGlobalDailyUsd("0,05"), 0.05);
    assert.equal(aiGlobalDailyUsd("0"), 0, "0 = AI off");
    assert.equal(aiGlobalDailyUsd("50"), MAX_AI_GLOBAL_DAILY_USD, "a typo cannot burn the credit");
  });

  it("kind messages: friendly, no numbers to worry about", () => {
    for (const m of [AI_GLOBAL_CAP, AI_GLOBAL_CAP_NOTE, PDF_GLOBAL_CAP]) {
      assert.match(m, /tope/);
      assert.match(m, /[Mm]añana|números de Cifra/);
      assert.doesNotMatch(m, /\$|USD|\d/);
    }
    assert.match(PDF_GLOBAL_CAP, /a mano/);
    assert.equal(capLog("pdf").result, "tope");
    assert.equal(capLog("pdf").costUsd, 0);
  });
});

describe("AI cost: owner view", () => {
  it("only the verified owner mail", () => {
    assert.equal(isOwner("IraolaDamian@gmail.com ", true), true);
    assert.equal(isOwner("iraoladamian@gmail.com", false), false);
    assert.equal(isOwner("otro@gmail.com", true), false);
    assert.equal(isOwner(undefined, true), false);
  });

  it("sums by kind; 'tope' rows are blocked requests, not calls", () => {
    const s = costSummary([
      { kind: "asistente", result: "ok", n: 3, usd: 0.003, input: 9000, output: 600 },
      { kind: "asistente", result: "plantilla", n: 1, usd: 0.001, input: 3000, output: 200 },
      { kind: "pdf", result: "ok", n: 1, usd: 0.006, input: 12000, output: 3000 },
      { kind: "asistente", result: "tope", n: 2, usd: 0, input: 0, output: 0 },
    ]);
    assert.equal(s.calls, 5);
    assert.equal(s.blocked, 2);
    assert.equal(Math.round(s.usd * 1e6), 10000);
    assert.equal(s.input, 24000);
    assert.deepEqual(
      s.byKind.map((k) => [k.kind, k.calls]),
      [
        ["pdf", 1],
        ["asistente", 4],
      ],
    );
    assert.deepEqual(s.byResult[0], { result: "ok", n: 4 });
    assert.equal(monthStart("2026-10-08"), "2026-10-01");
    assert.equal(daysBefore("2026-10-08", 29), "2026-09-09");
    assert.equal(daysBefore("2026-03-01", 1), "2026-02-28");
  });
});

/** PGLite behind the same `sql` tag the app uses. */
async function testDb(): Promise<Sql> {
  const pg = new PGlite();
  await pg.exec(
    await readFile(new URL("../../migrations/0017_ai_usage_cost.sql", import.meta.url), "utf8"),
  );
  const tag = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + (i ? `$${i}` : "") + s, "");
    return (await pg.query(text, values)).rows;
  }) as Sql;
  tag.query = (async (text: string, params?: unknown[]) =>
    (await pg.query(text, params)).rows) as Sql["query"];
  return tag;
}

const log = (o: Partial<AiCallLog>): AiCallLog => ({
  kind: "asistente",
  provider: "gateway",
  model: gateway.model,
  inputTokens: 1000,
  outputTokens: 100,
  costUsd: 0.01,
  costSource: "gateway",
  latencyMs: 900,
  result: "ok",
  ...o,
});

describe("AI cost: the log in Postgres (migration 0017)", () => {
  it("saves calls, adds up today, groups for the owner, purges after 90 days and forgets deleted users", async () => {
    const sql = await testDb();
    await insertCallLogs(sql, "u1", "2026-10-08", [
      log({}),
      log({ kind: "informe", costUsd: 0.02 }),
      log({ result: "tope", costUsd: 0 }),
    ]);
    await insertCallLogs(sql, "u2", "2026-10-08", [
      log({ kind: "pdf", costUsd: 0.05, result: "error" }),
    ]);
    await insertCallLogs(sql, "u1", "2026-10-01", [log({ costUsd: 0.1 })]);
    await insertCallLogs(sql, "u1", "2026-07-09", [log({ costUsd: 1 })]); // 91 days before oct 8
    await insertCallLogs(sql, "u1", "2026-07-10", [log({ costUsd: 1 })]); // 90 days: stays

    assert.equal(Math.round((await spentSince(sql, "2026-10-08")) * 1000), 80);
    assert.equal(Math.round((await spentSince(sql, "2026-10-01")) * 1000), 180);
    assert.equal(await usersOn(sql, "2026-10-08"), 2);
    const today = costSummary(await costRowsSince(sql, "2026-10-08"));
    assert.equal(today.calls, 3);
    assert.equal(today.blocked, 1);
    assert.deepEqual(
      today.byKind.map((k) => k.kind),
      ["pdf", "informe", "asistente"],
    );
    const days = await lastDays(sql, "2026-10-08", 14);
    assert.deepEqual(
      days.map((d) => [d.day, d.calls]),
      [
        ["2026-10-08", 3],
        ["2026-10-01", 1],
      ],
    );

    assert.equal(await purgeCallLog(sql, "2026-10-08"), 1);
    assert.equal(await purgeCallLog(sql, "2026-10-08"), 0);
    assert.equal(Math.round(await spentSince(sql, "2026-01-01")), 1);

    await forgetUser(sql, "u1");
    const left = await sql<{
      n: number;
    }>`select count(*)::int as n from ai_call_log where user_id = 'u1'`;
    assert.equal(left[0]!.n, 0);
    assert.equal(
      Math.round((await spentSince(sql, "2026-10-08")) * 1000),
      80,
      "the cost still counts",
    );
    // Nothing but metadata in the table.
    const cols = await sql<{ column_name: string }>`
      select column_name from information_schema.columns where table_name = 'ai_call_log' order by ordinal_position
    `;
    assert.deepEqual(
      cols.map((c) => c.column_name),
      [
        "id",
        "at",
        "day",
        "user_id",
        "kind",
        "provider",
        "model",
        "input_tokens",
        "output_tokens",
        "cost_usd",
        "cost_source",
        "latency_ms",
        "result",
      ],
    );
  });
});
