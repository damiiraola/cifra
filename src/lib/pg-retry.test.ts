import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { acquireHealthy, isTransientPgError, retryTransient } from "./pg-retry.ts";

describe("isTransientPgError", () => {
  it("recognises dropped connections", () => {
    assert.equal(isTransientPgError(new Error("Connection terminated unexpectedly")), true);
    assert.equal(isTransientPgError(Object.assign(new Error("x"), { code: "57P01" })), true);
    assert.equal(isTransientPgError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })), true);
    assert.equal(isTransientPgError(new Error("timeout exceeded when trying to connect")), true);
    assert.equal(isTransientPgError(new Error("wrapped", { cause: new Error("Connection terminated unexpectedly") })), true);
  });

  it("does not retry SQL errors", () => {
    assert.equal(isTransientPgError(Object.assign(new Error("duplicate key"), { code: "23505" })), false);
    assert.equal(isTransientPgError(new Error('relation "x" does not exist')), false);
    assert.equal(isTransientPgError(null), false);
    assert.equal(isTransientPgError("Connection terminated"), false);
  });
});

type Fake = { id: number; dead: boolean; idle?: number };

function fakePool(clients: Fake[]) {
  const destroyed: number[] = [];
  let pings = 0;
  let i = 0;
  return {
    destroyed,
    pings: () => pings,
    opts: {
      acquire: async () => clients[i++]!,
      idleSince: (c: Fake) => c.idle,
      ping: async (c: Fake) => {
        pings++;
        if (c.dead) throw new Error("Connection terminated unexpectedly");
      },
      destroy: (c: Fake) => destroyed.push(c.id),
      now: () => 10_000,
    },
  };
}

describe("acquireHealthy", () => {
  it("hands out new and recently used clients without a ping", async () => {
    const p = fakePool([{ id: 1, dead: false }]);
    assert.equal((await acquireHealthy(p.opts)).id, 1);
    const q = fakePool([{ id: 2, dead: false, idle: 9_500 }]);
    assert.equal((await acquireHealthy(q.opts)).id, 2);
    assert.equal(p.pings() + q.pings(), 0);
  });

  it("pings a client that sat idle and replaces it when the connection is gone", async () => {
    const p = fakePool([
      { id: 1, dead: true, idle: 1_000 },
      { id: 2, dead: false },
    ]);
    assert.equal((await acquireHealthy(p.opts)).id, 2);
    assert.deepEqual(p.destroyed, [1]);
    assert.equal(p.pings(), 1);
  });

  it("gives up after the tries and throws the connection error", async () => {
    const p = fakePool([
      { id: 1, dead: true, idle: 0 },
      { id: 2, dead: true, idle: 0 },
      { id: 3, dead: true, idle: 0 },
    ]);
    await assert.rejects(acquireHealthy(p.opts), /Connection terminated/);
    assert.deepEqual(p.destroyed, [1, 2, 3]);
  });

  it("retries when connecting fails transiently, not on other errors", async () => {
    let n = 0;
    const client = await acquireHealthy({
      acquire: async () => {
        if (n++ === 0) throw new Error("Connection terminated due to connection timeout");
        return { id: 9 };
      },
      idleSince: () => undefined,
      ping: async () => undefined,
      destroy: () => undefined,
    });
    assert.equal(client.id, 9);
    await assert.rejects(
      acquireHealthy({
        acquire: async () => {
          throw new Error("password authentication failed");
        },
        idleSince: () => undefined,
        ping: async () => undefined,
        destroy: () => undefined,
      }),
      /password authentication failed/,
    );
  });
});

describe("retryTransient", () => {
  it("retries once on a dropped connection", async () => {
    let n = 0;
    const out = await retryTransient(async () => {
      if (n++ === 0) throw new Error("Connection terminated unexpectedly");
      return "ok";
    }, 1, 0);
    assert.equal(out, "ok");
    assert.equal(n, 2);
  });

  it("does not retry SQL errors, and stops after the retries", async () => {
    let n = 0;
    await assert.rejects(
      retryTransient(async () => {
        n++;
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }, 1, 0),
      /duplicate key/,
    );
    assert.equal(n, 1);
    let m = 0;
    await assert.rejects(
      retryTransient(async () => {
        m++;
        throw new Error("Connection terminated unexpectedly");
      }, 1, 0),
    );
    assert.equal(m, 2);
  });
});
