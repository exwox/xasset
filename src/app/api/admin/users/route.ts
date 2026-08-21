import { NextRequest, NextResponse } from "next/server";
import { createUserSchema } from "@/server/admin-schema";
import { createAdminUser, listAdminUsers } from "@/server/admin";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission(request, "admin:manage");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ data: await listAdminUsers() });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission(request, "admin:manage");
  if (auth instanceof NextResponse) return auth;
  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_USER", details: parsed.error.flatten() }, { status: 422 });
  try {
    const user = await createAdminUser(parsed.data);
    await writeAudit({ actor: auth, action: "admin.user_create", resourceType: "user", resourceId: user.id, after: user });
    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
    throw error;
  }
}
