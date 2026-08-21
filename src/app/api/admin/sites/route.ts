import { NextRequest, NextResponse } from "next/server";
import { createSiteSchema } from "@/server/admin-schema";
import { createSite, listSites } from "@/server/admin";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission(request, "admin:manage");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ data: await listSites() });
}
export async function POST(request: NextRequest) {
  const auth = await requireApiPermission(request, "admin:manage");
  if (auth instanceof NextResponse) return auth;
  const parsed = createSiteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_SITE", details: parsed.error.flatten() }, { status: 422 });
  try {
    const site = await createSite(parsed.data);
    await writeAudit({ actor: auth, action: "admin.site_create", resourceType: "site", resourceId: site.id, after: site });
    return NextResponse.json({ data: site }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "SITE_CODE_EXISTS" }, { status: 409 });
    throw error;
  }
}
