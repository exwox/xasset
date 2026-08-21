import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { config } from "@/server/config";
import { query } from "@/server/db";
import { dxfConfirmSchema } from "@/server/dxf-schema";
import { dxfQueue } from "@/server/queue";
import { storage } from "@/server/storage";
import { validateDxfSignature } from "@/server/file-validation";

interface Context {
  params: Promise<{ id: string; versionId: string }>;
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:write");
  if (auth instanceof NextResponse) return auth;
  const parsed = dxfConfirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_CONFIRMATION" }, { status: 422 });
  const { id, versionId } = await context.params;
  const version = await query<{
    source_file_key: string;
    size_bytes: string;
    content_type: string;
    status: string;
  }>(`SELECT source_file_key,size_bytes,content_type,status FROM dxf_versions WHERE id=$1 AND document_id=$2`, [
    versionId,
    id,
  ]);
  const row = version.rows[0];
  if (!row) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (row.source_file_key !== parsed.data.objectKey)
    return NextResponse.json({ error: "INVALID_OBJECT_KEY" }, { status: 422 });
  if (row.status !== "uploading") return NextResponse.json({ error: "ALREADY_CONFIRMED" }, { status: 409 });
  const object = await storage().send(new HeadObjectCommand({ Bucket: config().S3_BUCKET, Key: row.source_file_key }));
  if (Number(object.ContentLength) !== Number(row.size_bytes) || object.ContentType !== row.content_type)
    return NextResponse.json({ error: "OBJECT_MISMATCH" }, { status: 409 });
  const sample = await storage().send(
    new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: row.source_file_key, Range: "bytes=0-8191" }),
  );
  const signature = validateDxfSignature((await sample.Body?.transformToByteArray()) ?? new Uint8Array());
  if (!signature.valid) {
    await query(`UPDATE dxf_versions SET status='failed',error_message=$2 WHERE id=$1 AND status='uploading'`, [
      versionId,
      signature.reason,
    ]);
    await writeAudit({
      actor: auth,
      action: "dxf.upload_rejected",
      resourceType: "dxf_document",
      resourceId: id,
      after: { versionId, reason: signature.reason },
    });
    return NextResponse.json({ error: "INVALID_DXF_SIGNATURE" }, { status: 422 });
  }
  await query(`UPDATE dxf_versions SET status='queued',progress=0 WHERE id=$1 AND status='uploading'`, [versionId]);
  await dxfQueue().add(
    "parse",
    { documentId: id, versionId, sourceKey: row.source_file_key },
    { jobId: `${versionId}-${Date.now()}`, attempts: 2, backoff: { type: "exponential", delay: 2000 } },
  );
  await writeAudit({
    actor: auth,
    action: "dxf.processing_queue",
    resourceType: "dxf_document",
    resourceId: id,
    after: { versionId },
  });
  return NextResponse.json({ data: { documentId: id, versionId, status: "queued" } }, { status: 202 });
}
