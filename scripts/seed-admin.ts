import { Pool } from "pg";
import { hashPassword } from "../src/server/password";

async function main() {
  const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) throw new Error("DATABASE_URL, ADMIN_EMAIL, and ADMIN_PASSWORD (minimum 12 characters) are required");
  const pool = new Pool({ connectionString: DATABASE_URL });
  const hash = await hashPassword(ADMIN_PASSWORD);
  await pool.query(`INSERT INTO users(email,name,password_hash,role_id) SELECT $1,'System Administrator',$2,id FROM roles WHERE code='administrator' ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,active=true,updated_at=now()`, [ADMIN_EMAIL.toLowerCase(), hash]);
  console.log(`Administrator ready: ${ADMIN_EMAIL.toLowerCase()}`);
  await pool.end();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
