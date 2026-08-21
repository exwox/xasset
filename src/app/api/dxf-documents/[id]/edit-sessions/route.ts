import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { query } from "@/server/db";
import { createEditSessionSchema } from "@/server/dxf-schema";

interface Context { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:read");
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const result = await query(`SELECT s.id,s.base_version_id "baseVersionId",s.exported_version_id "exportedVersionId",s.version,s.status,s.change_note "changeNote",s.created_at "createdAt",s.updated_at "updatedAt",v.version_number "baseVersionNumber",ev.version_number "exportedVersionNumber" FROM dxf_edit_sessions s JOIN dxf_versions v ON v.id=s.base_version_id LEFT JOIN dxf_versions ev ON ev.id=s.exported_version_id WHERE s.document_id=$1 ORDER BY s.updated_at DESC`, [id]);
  return NextResponse.json({ data: result.rows });
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:write");
  if (auth instanceof NextResponse) return auth;
  const parsed = createEditSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_EDITOR_SESSION" }, { status: 422 });
  const { id } = await context.params;
  const created = await query(`INSERT INTO dxf_edit_sessions(document_id,base_version_id,change_note,created_by,updated_by) SELECT $1,v.id,$3,$4,$4 FROM dxf_versions v WHERE v.id=$2 AND v.document_id=$1 AND v.status IN ('ready','published') RETURNING id,base_version_id "baseVersionId",version,status,snapshot,change_note "changeNote"`, [id, parsed.data.baseVersionId, parsed.data.changeNote ?? null, auth.userId]);
  if (!created.rowCount) return NextResponse.json({ error: "BASE_VERSION_NOT_FOUND" }, { status: 404 });
  await writeAudit({ actor: auth, action: "dxf.editor_create", resourceType: "dxf_document", resourceId: id, after: { sessionId: created.rows[0].id, baseVersionId: parsed.data.baseVersionId } });
  return NextResponse.json({ data: created.rows[0] }, { status: 201 });
}
