import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { gunzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { applyEditorSnapshot, exportEditorDxf, orderEditorEntitiesForExport, segmentsToEditorEntities, validateEditorEntities, type EditorSnapshot } from "@/lib/dxf-editor";
import { deserializeDxfJson } from "@/lib/dxf-processing";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { config } from "@/server/config";
import { query, transaction } from "@/server/db";
import { exportEditSessionSchema } from "@/server/dxf-schema";
import { dxfQueue } from "@/server/queue";
import { storage } from "@/server/storage";

interface Context { params: Promise<{ id: string; sessionId: string }> }

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:write");
  if (auth instanceof NextResponse) return auth;
  const parsed = exportEditSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "CHANGE_NOTE_REQUIRED" }, { status: 422 });
  const { id, sessionId } = await context.params;
  const found = await query<{ snapshot: EditorSnapshot; normalized_file_key: string; unit: string | null; base_version_id: string }>(`SELECT s.snapshot,v.normalized_file_key,v.unit,s.base_version_id FROM dxf_edit_sessions s JOIN dxf_versions v ON v.id=s.base_version_id WHERE s.id=$1 AND s.document_id=$2 AND s.status='draft' AND v.status IN ('ready','published')`, [sessionId,id]);
  const session = found.rows[0];
  if (!session?.normalized_file_key) return NextResponse.json({ error: "EDITOR_BASE_NOT_READY" }, { status: 409 });
  const object = await storage().send(new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: session.normalized_file_key }));
  const bytes = await object.Body?.transformToByteArray();
  if (!bytes) return NextResponse.json({ error: "EDITOR_BASE_MISSING" }, { status: 409 });
  const normalized = deserializeDxfJson(JSON.parse(gunzipSync(bytes).toString("utf8")));
  const entities = orderEditorEntitiesForExport(applyEditorSnapshot(segmentsToEditorEntities(normalized.segments), session.snapshot));
  const validation = validateEditorEntities(entities);
  if (validation.length) return NextResponse.json({ error: "INVALID_GEOMETRY", details: validation.slice(0,100) }, { status: 422 });
  const dxf = exportEditorDxf(entities, normalized.unit);
  const versionId = crypto.randomUUID();
  const sourceKey = `dxf/${id}/${versionId}/source-editor.dxf`;
  await storage().send(new PutObjectCommand({ Bucket: config().S3_BUCKET, Key: sourceKey, Body: dxf, ContentType: "application/dxf", Metadata: { document: id, version: versionId, editor: sessionId } }));
  const versionNumber = await transaction(async (client) => {
    const locked = await client.query(`SELECT id FROM dxf_documents WHERE id=$1 FOR UPDATE`, [id]);
    if (!locked.rowCount) throw new Error("NOT_FOUND");
    const next = (await client.query<{ version: number }>(`SELECT COALESCE(max(version_number),0)+1 version FROM dxf_versions WHERE document_id=$1`, [id])).rows[0].version;
    await client.query(`INSERT INTO dxf_versions(id,document_id,version_number,file_name,content_type,size_bytes,source_file_key,status,progress,change_note,created_by) VALUES($1,$2,$3,$4,'application/dxf',$5,$6,'queued',0,$7,$8)`, [versionId,id,next,`editor-v${next}.dxf`,Buffer.byteLength(dxf),sourceKey,parsed.data.changeNote,auth.userId]);
    const closed = await client.query(`UPDATE dxf_edit_sessions SET status='exported',exported_version_id=$3,exported_at=now(),updated_by=$4,updated_at=now() WHERE id=$1 AND document_id=$2 AND status='draft'`, [sessionId,id,versionId,auth.userId]);
    if (!closed.rowCount) throw new Error("EDIT_CONFLICT");
    return next;
  }).catch((error: Error) => error.message);
  if (typeof versionNumber === "string") return NextResponse.json({ error: versionNumber }, { status: 409 });
  await dxfQueue().add("process", { documentId:id, versionId, sourceKey }, { jobId:versionId, attempts:2, backoff:{ type:"exponential", delay:1000 } });
  await writeAudit({ actor: auth, action: "dxf.editor_export", resourceType: "dxf_document", resourceId: id, after: { sessionId, baseVersionId:session.base_version_id, versionId, versionNumber, entityCount:entities.length, limitation:normalized.truncated ? "normalized-segment-cap" : null } });
  return NextResponse.json({ data: { versionId, versionNumber, status:"queued", entityCount:entities.length, sourceTruncated:normalized.truncated } }, { status:201 });
}
