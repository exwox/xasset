import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

const globalForDb = globalThis as unknown as { xassetPool?: Pool };

export function db() {
  if (!globalForDb.xassetPool) {
    globalForDb.xassetPool = new Pool({ connectionString: config().DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
  }
  return globalForDb.xassetPool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return db().query<T>(text, values);
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await db().connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
