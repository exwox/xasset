import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { query } from "@/server/db";
import { saveEditSessionSchema } from "@/server/dxf-schema";

interface Context { params: Promise<{ id: string; sessionId: string }> }

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:read");
  if (auth instanceof NextResponse) return auth;
  const { id, sessionId } = await context.params;
  const result = await query(`SELECT s.id,s.base_version_id "baseVersionId",s.exported_version_id "exportedVersionId",s.version,s.status,s.snapshot,s.change_note "changeNote",s.updated_at "updatedAt",v.version_number "baseVersionNumber",v.render_file_key "renderFileKey" FROM dxf_edit_sessions s JOIN dxf_versions v ON v.id=s.base_version_id WHERE s.id=$1 AND s.document_id=$2`, [sessionId,id]);
  if (!result.rowCount) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: result.rows[0] });
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:write");
  if (auth instanceof NextResponse) return auth;
  const parsed = saveEditSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_EDITOR_DRAFT", details: parsed.error.flatten() }, { status: 422 });
  const { id, sessionId } = await context.params;
  const result = await query(`UPDATE dxf_edit_sessions SET snapshot=$4,change_note=$5,version=version+1,updated_by=$6,updated_at=now() WHERE id=$1 AND document_id=$2 AND version=$3 AND status='draft' RETURNING version,updated_at "updatedAt"`, [sessionId,id,parsed.data.version,JSON.stringify(parsed.data.snapshot),parsed.data.changeNote ?? null,auth.userId]);
  if (!result.rowCount) {
    const current = await query(`SELECT version,status,updated_at "updatedAt" FROM dxf_edit_sessions WHERE id=$1 AND document_id=$2`, [sessionId,id]);
    return NextResponse.json({ error: current.rowCount ? "EDIT_CONFLICT" : "NOT_FOUND", current: current.rows[0] ?? null }, { status: current.rowCount ? 409 : 404 });
  }
  await writeAudit({ actor: auth, action: "dxf.editor_update", resourceType: "dxf_document", resourceId: id, after: { sessionId, version: result.rows[0].version, patchCount: Object.keys(parsed.data.snapshot.patches).length } });
  return NextResponse.json({ data: result.rows[0] });
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:write");
  if (auth instanceof NextResponse) return auth;
  const { id, sessionId } = await context.params;
  const result = await query(`UPDATE dxf_edit_sessions SET status='discarded',updated_by=$3,updated_at=now() WHERE id=$1 AND document_id=$2 AND status='draft' RETURNING id`, [sessionId,id,auth.userId]);
  if (!result.rowCount) return NextResponse.json({ error: "NOT_FOUND_OR_CLOSED" }, { status: 409 });
  await writeAudit({ actor: auth, action: "dxf.editor_discard", resourceType: "dxf_document", resourceId: id, after: { sessionId } });
  return NextResponse.json({ ok: true });
}
