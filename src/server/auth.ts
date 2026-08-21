import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "./config";
import { query } from "./db";

export const SESSION_COOKIE = "xasset_session";
export type Role = "viewer" | "user" | "administrator";
export interface Session { userId: string; email: string; name: string; role: Role; permissions: string[] }

function key() { return new TextEncoder().encode(config().AUTH_SECRET); }
export async function createSessionToken(session: Session) { return new SignJWT({ ...session }).setProtectedHeader({ alg: "HS256" }).setSubject(session.userId).setIssuedAt().setExpirationTime(`${config().SESSION_TTL_SECONDS}s`).sign(key()); }
export async function verifySessionToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] }); return payload as unknown as Session; }
  catch { return null; }
}
export async function resolveSessionToken(token?: string): Promise<Session | null> {
  const signed = await verifySessionToken(token);
  if (!signed) return null;
  const result = await query<{ id: string; email: string; name: string; role: Role; permissions: string[] }>(
    `SELECT u.id,u.email,u.name,r.code role,
      COALESCE(array_agg(p.code) FILTER(WHERE p.code IS NOT NULL),'{}') permissions
     FROM users u JOIN roles r ON r.id=u.role_id
     LEFT JOIN role_permissions rp ON rp.role_id=r.id
     LEFT JOIN permissions p ON p.id=rp.permission_id
     WHERE u.id=$1 AND u.active=true GROUP BY u.id,r.code`,
    [signed.userId],
  );
  const user = result.rows[0];
  return user ? { userId: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions } : null;
}
export async function getSession() { return resolveSessionToken((await cookies()).get(SESSION_COOKIE)?.value); }
export async function requirePageSession() { const session = await getSession(); if (!session) redirect("/login"); return session; }
export function hasPermission(session: Session, permission: string) { return session.role === "administrator" || session.permissions.includes(permission); }
