import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateUserSchema } from "@/server/admin-schema";
import { updateAdminUser } from "@/server/admin";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";

interface Context { params: Promise<{ id: string }> }
export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "admin:manage");
  if (auth instanceof NextResponse) return auth;
  const id = (await context.params).id;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_USER", details: parsed.error.flatten() }, { status: 422 });
  const result = await updateAdminUser(id, parsed.data);
  if (result.state === "missing") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (result.state === "last_admin") return NextResponse.json({ error: "LAST_ACTIVE_ADMIN" }, { status: 409 });
  await writeAudit({ actor: auth, action: "admin.user_update", resourceType: "user", resourceId: id, after: result.user });
  return NextResponse.json({ data: result.user });
}
