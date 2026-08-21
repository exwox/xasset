import { NextRequest, NextResponse } from "next/server";
import { hasPermission, resolveSessionToken, SESSION_COOKIE, type Session } from "./auth";
import { trustedRequestOrigin } from "./security";

export async function requireApiPermission(request: NextRequest, permission: string): Promise<Session | NextResponse> {
  if (!trustedRequestOrigin(request)) return NextResponse.json({ error: "CSRF_REJECTED" }, { status: 403 });
  const session = await resolveSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session, permission)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return session;
}
