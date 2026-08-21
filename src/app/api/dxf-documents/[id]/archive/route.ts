import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { query } from "@/server/db";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:publish");
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const result = await query(
    `UPDATE dxf_documents SET status='archived',archived_at=now(),updated_at=now() WHERE id=$1 AND archived_at IS NULL RETURNING id`,
    [id],
  );
  if (!result.rowCount) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await writeAudit({ actor: auth, action: "dxf.archive", resourceType: "dxf_document", resourceId: id });
  return NextResponse.json({ ok: true });
}
