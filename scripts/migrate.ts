import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await pool.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((row) => row.version));
  for (const file of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const client = await pool.connect();
    try { await client.query("BEGIN"); await client.query(await readFile(resolve("db/migrations", file), "utf8")); await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [file]); await client.query("COMMIT"); console.log(`Applied ${file}`); }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  await pool.end();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
