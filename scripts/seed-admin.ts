import { Pool } from "pg";
import { hashPassword } from "../src/server/password";

async function main() {
  const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    throw new Error("DATABASE_URL, ADMIN_EMAIL, and ADMIN_PASSWORD (minimum 12 characters) are required");
  }
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const email = ADMIN_EMAIL.toLowerCase();
    const hash = await hashPassword(ADMIN_PASSWORD);
    const result = await pool.query(
      `INSERT INTO users(email,name,password_hash,role_id)
       SELECT $1,'System Administrator',$2,id FROM roles WHERE code='administrator'
       ON CONFLICT(email) DO UPDATE SET
         password_hash=EXCLUDED.password_hash,
         active=true,
         failed_login_count=0,
         locked_until=NULL,
         updated_at=now()
       RETURNING id`,
      [email, hash],
    );
    if (result.rowCount !== 1) throw new Error("Administrator role is missing; run database migrations first");
    console.log(`Administrator ready and unlocked: ${email}`);
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
