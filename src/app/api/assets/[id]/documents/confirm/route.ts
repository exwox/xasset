import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { config } from "@/server/config";
import { query } from "@/server/db";
import { storage } from "@/server/storage";
import { validateFileSignature } from "@/server/file-validation";

interface Context {
  params: Promise<{ id: string }>;
}
const input = z.object({
  objectKey: z.string().min(1),
  fileName: z.string().min(1).max(240),
  contentType: z.string().min(1).max(160),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  documentType: z.enum(["photo", "invoice", "manual", "certificate", "inspection", "other"]).default("other"),
  description: z.string().trim().max(1000).nullable().optional(),
  expiresOn: z.string().date().nullable().optional(),
});
export async function POST(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "document:upload");
  if (auth instanceof NextResponse) return auth;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DOCUMENT" }, { status: 422 });
  const id = (await context.params).id;
  if (!parsed.data.objectKey.startsWith(`assets/${id}/`))
    return NextResponse.json({ error: "INVALID_OBJECT_KEY" }, { status: 422 });
  const object = await storage().send(
    new HeadObjectCommand({ Bucket: config().S3_BUCKET, Key: parsed.data.objectKey }),
  );
  if (object.ContentLength !== parsed.data.sizeBytes || object.ContentType !== parsed.data.contentType)
    return NextResponse.json({ error: "OBJECT_MISMATCH" }, { status: 409 });
  const sample = await storage().send(
    new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: parsed.data.objectKey, Range: "bytes=0-4095" }),
  );
  const bytes = await sample.Body?.transformToByteArray();
  const signature = validateFileSignature(parsed.data.contentType, bytes ?? new Uint8Array());
  if (!signature.valid) {
    await writeAudit({
      actor: auth,
      action: "asset.document_rejected",
      resourceType: "asset",
      resourceId: id,
      after: { fileName: parsed.data.fileName, reason: signature.reason },
    });
    return NextResponse.json({ error: "FILE_SIGNATURE_MISMATCH", reason: signature.reason }, { status: 422 });
  }
  const result = await query<{ id: string }>(
    `INSERT INTO asset_documents(asset_id,file_name,object_key,content_type,size_bytes,document_type,description,expires_on,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(object_key) DO NOTHING RETURNING id`,
    [
      id,
      parsed.data.fileName,
      parsed.data.objectKey,
      parsed.data.contentType,
      parsed.data.sizeBytes,
      parsed.data.documentType,
      parsed.data.description ?? null,
      parsed.data.expiresOn ?? null,
      auth.userId,
    ],
  );
  if (!result.rows[0]) return NextResponse.json({ error: "ALREADY_CONFIRMED" }, { status: 409 });
  await writeAudit({
    actor: auth,
    action: "asset.document_upload",
    resourceType: "asset",
    resourceId: id,
    after: {
      documentId: result.rows[0].id,
      fileName: parsed.data.fileName,
      documentType: parsed.data.documentType,
      signatureValidated: true,
    },
  });
  return NextResponse.json({ data: { id: result.rows[0].id } }, { status: 201 });
}
