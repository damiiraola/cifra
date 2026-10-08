/**
 * Connection hiccups with Neon on Vercel (pure, no `pg` import so it is testable).
 *
 * What happened: the first sign-up after a quiet spell failed with
 * "Connection terminated unexpectedly" (Better Auth then says "Could not
 * validate the database schema") and the second try worked. A Vercel
 * instance that was suspended keeps idle pool clients whose sockets Neon
 * already closed (compute suspended, pooler idle timeout); the first query on
 * one of those fails. Fix: close idle clients before suspension
 * (`attachDatabasePool`, short idle timeout), check a client that sat idle
 * before handing it out, and retry once when the error is a dropped
 * connection — never on SQL errors.
 */

const TRANSIENT_CODES = new Set([
  "57P01", // admin_shutdown (Neon compute suspended)
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
]);

const TRANSIENT_TEXT =
  /connection terminated|timeout exceeded when trying to connect|client has encountered a connection error|server closed the connection unexpectedly|terminating connection due to (administrator command|idle)|couldn't connect to compute node|ECONNRESET|EPIPE|ETIMEDOUT/i;

/** A dropped or refused connection (safe to try again on a new one), not a SQL error. */
export function isTransientPgError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; cause?: unknown };
  if (typeof e.code === "string" && TRANSIENT_CODES.has(e.code)) return true;
  if (typeof e.message === "string" && TRANSIENT_TEXT.test(e.message)) return true;
  return e.cause ? isTransientPgError(e.cause) : false;
}

export type AcquireOptions<C> = {
  acquire: () => Promise<C>;
  /** When the client went back to the pool (ms), undefined if it is brand new. */
  idleSince: (client: C) => number | undefined;
  /** Cheap round trip (`select 1`). */
  ping: (client: C) => Promise<void>;
  /** Drop a broken client from the pool. */
  destroy: (client: C, err: unknown) => void;
  /** Clients idle at least this long get a ping before use. */
  staleMs?: number;
  tries?: number;
  now?: () => number;
};

/** A pool client that answers: pings clients that sat idle, replaces dead ones. */
export async function acquireHealthy<C>(o: AcquireOptions<C>): Promise<C> {
  const tries = o.tries ?? 3;
  const staleMs = o.staleMs ?? 2000;
  const now = o.now ?? Date.now;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    let client: C;
    try {
      client = await o.acquire();
    } catch (err) {
      if (!isTransientPgError(err) || i === tries - 1) throw err;
      last = err;
      continue;
    }
    const since = o.idleSince(client);
    if (since === undefined || now() - since < staleMs) return client;
    try {
      await o.ping(client);
      return client;
    } catch (err) {
      o.destroy(client, err);
      if (!isTransientPgError(err)) throw err;
      last = err;
    }
  }
  throw last;
}

/** Runs `fn` again (once by default) only when it failed on a dropped connection. */
export async function retryTransient<T>(fn: () => Promise<T>, retries = 1, waitMs = 100): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= retries || !isTransientPgError(err)) throw err;
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}
