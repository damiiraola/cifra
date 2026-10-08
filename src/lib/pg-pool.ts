/**
 * The one way to open a Postgres pool on Neon (app data in `db.ts` and Better
 * Auth in `auth/server.ts`). Server-only. See `pg-retry.ts` for why.
 */
import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { acquireHealthy } from "./pg-retry";

type Done = (release?: boolean | Error) => void;
type ConnectCallback = (err: Error | undefined, client: pg.PoolClient | undefined, done: Done) => void;

/** A `pg.Pool` that checks clients that sat idle before handing them out. */
export class ResilientPool extends pg.Pool {
  private readonly lastRelease = new WeakMap<object, number>();

  constructor(config: pg.PoolConfig) {
    super(config);
    this.on("release", (_err, client) => {
      this.lastRelease.set(client, Date.now());
    });
    // A checked-out client whose socket dies emits "error" too; its queries
    // already reject with it, but without a listener the process would crash.
    this.on("connect", (client) => {
      client.on("error", () => undefined);
    });
    // An idle client whose socket dies emits here; without a listener the
    // process would crash. pg already dropped it from the pool.
    this.on("error", (err) => {
      console.warn("[db] se cerró una conexión inactiva:", err.message);
    });
  }

  override connect(): Promise<pg.PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(callback?: ConnectCallback): Promise<pg.PoolClient> | void {
    const healthy = acquireHealthy<pg.PoolClient>({
      acquire: () => super.connect(),
      idleSince: (client) => this.lastRelease.get(client),
      ping: async (client) => {
        await client.query("select 1");
      },
      destroy: (client, err) => client.release(err instanceof Error ? err : true),
    });
    if (!callback) return healthy;
    healthy.then(
      (client) => callback(undefined, client, (release) => client.release(release)),
      (err: Error) => callback(err, undefined, () => undefined),
    );
  }
}

export function createPgPool(connectionString: string): ResilientPool {
  const pool = new ResilientPool({
    connectionString,
    // Short idle time: few connections left open, and Fluid compute closes
    // them before suspending (attachDatabasePool) instead of leaving dead ones.
    idleTimeoutMillis: 5_000,
    // Waking a suspended Neon compute can take a few seconds.
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });
  if (process.env.VERCEL) {
    try {
      attachDatabasePool(pool);
    } catch (err) {
      console.warn("[db] attachDatabasePool no disponible:", err instanceof Error ? err.message : err);
    }
  }
  return pool;
}
