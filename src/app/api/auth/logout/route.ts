import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { trustedRequestOrigin } from "@/server/security";

export async function POST(request: NextRequest) {
  if (!trustedRequestOrigin(request)) return NextResponse.json({ error: "CSRF_REJECTED" }, { status: 403 });
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) await writeAudit({ actor: session, action: "auth.logout", resourceType: "user", resourceId: session.userId });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
