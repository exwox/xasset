import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateSiteSchema } from "@/server/admin-schema";
import { updateSite } from "@/server/admin";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";

interface Context { params: Promise<{ id: string }> }
export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "admin:manage");
  if (auth instanceof NextResponse) return auth;
  const id = (await context.params).id;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const parsed = updateSiteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_SITE", details: parsed.error.flatten() }, { status: 422 });
  try {
    const site = await updateSite(id, parsed.data);
    if (!site) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await writeAudit({ actor: auth, action: "admin.site_update", resourceType: "site", resourceId: id, after: site });
    return NextResponse.json({ data: site });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "SITE_CODE_EXISTS" }, { status: 409 });
    throw error;
  }
}
