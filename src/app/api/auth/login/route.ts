import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, SESSION_COOKIE, type Role } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { config } from "@/server/config";
import { query } from "@/server/db";
import { logger } from "@/server/logger";
import { verifyPassword } from "@/server/password";
import { checkRateLimit, opaqueRateLimitKey, trustedRequestOrigin } from "@/server/security";

const bodySchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});
interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  active: boolean;
  locked_until: Date | null;
  permissions: string[];
}

export async function POST(request: NextRequest) {
  if (!trustedRequestOrigin(request)) return NextResponse.json({ error: "CSRF_REJECTED" }, { status: 403 });
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    const [ipLimit, emailLimit] = await Promise.all([
      checkRateLimit(opaqueRateLimitKey("login-ip", ip), 30, 900),
      checkRateLimit(opaqueRateLimitKey("login-account", parsed.data.email), 10, 900),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed)
      return NextResponse.json(
        { error: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "retry-after": String(Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds)) },
        },
      );
  } catch (error) {
    logger().warn({ requestId, error }, "Login rate limiter unavailable");
  }
  const result = await query<UserRow>(
    `SELECT u.id,u.email,u.name,u.password_hash,u.active,u.locked_until,r.code role, COALESCE(array_agg(p.code) FILTER (WHERE p.code IS NOT NULL),'{}') permissions FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id WHERE u.email=$1 GROUP BY u.id,r.code`,
    [parsed.data.email],
  );
  const user = result.rows[0];
  const valid =
    user?.active &&
    (!user.locked_until || user.locked_until < new Date()) &&
    (await verifyPassword(parsed.data.password, user.password_hash));
  if (!valid) {
    if (user)
      await query(
        `UPDATE users SET failed_login_count=failed_login_count+1, locked_until=CASE WHEN failed_login_count+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END WHERE id=$1`,
        [user.id],
      );
    await writeAudit({
      action: "auth.login_failed",
      resourceType: "user",
      resourceId: user?.id,
      requestId,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0],
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    logger().warn({ requestId, email: parsed.data.email }, "Login failed");
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }
  const session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
  };
  const token = await createSessionToken(session);
  await query(`UPDATE users SET failed_login_count=0,locked_until=NULL,last_login_at=now() WHERE id=$1`, [user.id]);
  await writeAudit({
    actor: session,
    action: "auth.login",
    resourceType: "user",
    resourceId: user.id,
    requestId,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0],
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  const response = NextResponse.json({ user: { name: user.name, email: user.email, role: user.role } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config().NODE_ENV === "production",
    path: "/",
    maxAge: config().SESSION_TTL_SECONDS,
  });
  return response;
}
