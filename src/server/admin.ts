import "server-only";
import type { z } from "zod";
import { query, transaction } from "./db";
import { hashPassword } from "./password";
import type { createSiteSchema, createUserSchema, updateSiteSchema, updateUserSchema } from "./admin-schema";

export interface AdminUserDto {
  id: string; name: string; email: string; role: "administrator" | "user" | "viewer";
  active: boolean; lastLoginAt: string | null;
}
export interface SiteDto {
  id: string; code: string; name: string; longitude: number; latitude: number;
  cameraHeight: number; active: boolean;
}

const userSelect = `SELECT u.id,u.name,u.email,r.code role,u.active,u.last_login_at "lastLoginAt"
  FROM users u JOIN roles r ON r.id=u.role_id`;
const siteSelect = `SELECT id,code,name,longitude::float8 longitude,latitude::float8 latitude,
  camera_height::float8 "cameraHeight",active FROM sites`;

export async function listAdminUsers() {
  return (await query<AdminUserDto>(`${userSelect} ORDER BY u.name,u.email`)).rows;
}
export async function listSites() {
  return (await query<SiteDto>(`${siteSelect} ORDER BY active DESC,name`)).rows;
}
export async function getActiveSite(): Promise<SiteDto> {
  return (await query<SiteDto>(`${siteSelect} ORDER BY active DESC,created_at LIMIT 1`)).rows[0]
    ?? { id: "", code: "TNJ", name: "Tanjung Pinang", longitude: 104.5323, latitude: 0.9227, cameraHeight: 4200, active: true };
}

export async function createAdminUser(input: z.infer<typeof createUserSchema>) {
  const passwordHash = await hashPassword(input.password);
  return (await query<AdminUserDto>(
    `INSERT INTO users(name,email,password_hash,role_id)
     SELECT $1,$2,$3,id FROM roles WHERE code=$4
     RETURNING id,name,email,$4::text role,active,last_login_at "lastLoginAt"`,
    [input.name, input.email, passwordHash, input.role],
  )).rows[0];
}

export async function updateAdminUser(id: string, input: z.infer<typeof updateUserSchema>) {
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  return transaction(async (client) => {
    const before = (await client.query<{ role: string; active: boolean }>(
      `SELECT r.code role,u.active FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR UPDATE`, [id],
    )).rows[0];
    if (!before) return { state: "missing" as const };
    if (before.role === "administrator" && before.active && (input.role && input.role !== "administrator" || input.active === false)) {
      const admins = await client.query<{ count: number }>(
        `SELECT count(*)::int count FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='administrator' AND u.active=true`,
      );
      if ((admins.rows[0]?.count ?? 0) <= 1) return { state: "last_admin" as const };
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => { values.push(value); fields.push(`${sql}=$${values.length}`); };
    if (input.name !== undefined) add("name", input.name);
    if (input.active !== undefined) add("active", input.active);
    if (passwordHash !== undefined) add("password_hash", passwordHash);
    if (input.role !== undefined) {
      values.push(input.role);
      fields.push(`role_id=(SELECT id FROM roles WHERE code=$${values.length})`);
    }
    values.push(id);
    const updated = (await client.query<AdminUserDto>(
      `UPDATE users SET ${fields.join(",")},updated_at=now() WHERE id=$${values.length}
       RETURNING id,name,email,(SELECT code FROM roles WHERE id=role_id) role,active,last_login_at "lastLoginAt"`, values,
    )).rows[0];
    return { state: "updated" as const, user: updated };
  });
}

export async function createSite(input: z.infer<typeof createSiteSchema>) {
  return transaction(async (client) => {
    if (input.active) await client.query(`UPDATE sites SET active=false,updated_at=now() WHERE active=true`);
    return (await client.query<SiteDto>(
      `INSERT INTO sites(code,name,longitude,latitude,camera_height,active) VALUES($1,$2,$3,$4,$5,$6)
       RETURNING id,code,name,longitude::float8 longitude,latitude::float8 latitude,camera_height::float8 "cameraHeight",active`,
      [input.code,input.name,input.longitude,input.latitude,input.cameraHeight,input.active],
    )).rows[0];
  });
}

export async function updateSite(id: string, input: z.infer<typeof updateSiteSchema>) {
  return transaction(async (client) => {
    if (input.active) await client.query(`UPDATE sites SET active=false,updated_at=now() WHERE active=true AND id<>$1`, [id]);
    const mapping = { code: "code", name: "name", longitude: "longitude", latitude: "latitude", cameraHeight: "camera_height", active: "active" } as const;
    const entries = Object.entries(input) as Array<[keyof typeof mapping, unknown]>;
    const values = entries.map(([, value]) => value);
    values.push(id);
    return (await client.query<SiteDto>(
      `UPDATE sites SET ${entries.map(([key], index) => `${mapping[key]}=$${index + 1}`).join(",")},updated_at=now()
       WHERE id=$${values.length}
       RETURNING id,code,name,longitude::float8 longitude,latitude::float8 latitude,camera_height::float8 "cameraHeight",active`, values,
    )).rows[0] ?? null;
  });
}
