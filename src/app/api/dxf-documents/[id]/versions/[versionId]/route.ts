import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { config } from "@/server/config";
import { query, transaction } from "@/server/db";
import { dxfLayerSchema } from "@/server/dxf-schema";
import { storage } from "@/server/storage";

interface Context {
  params: Promise<{ id: string; versionId: string }>;
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:read");
  if (auth instanceof NextResponse) return auth;
  const { id, versionId } = await context.params;
  const result = await query<{ source_file_key: string; file_name: string; normalized_file_key: string | null }>(
    `SELECT source_file_key,file_name,normalized_file_key FROM dxf_versions WHERE id=$1 AND document_id=$2`,
    [versionId, id],
  );
  const version = result.rows[0];
  if (!version) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const sourceUrl = await getSignedUrl(
    storage(),
    new GetObjectCommand({
      Bucket: config().S3_BUCKET,
      Key: version.source_file_key,
      ResponseContentDisposition: `attachment; filename="${version.file_name.replaceAll('"', "")}"`,
    }),
    { expiresIn: 300 },
  );
  const normalizedUrl = version.normalized_file_key
    ? await getSignedUrl(
        storage(),
        new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: version.normalized_file_key }),
        { expiresIn: 300 },
      )
    : null;
  return NextResponse.json({ data: { sourceUrl, normalizedUrl, expiresIn: 300 } });
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:write");
  if (auth instanceof NextResponse) return auth;
  const parsed = dxfLayerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_LAYERS" }, { status: 422 });
  const { id, versionId } = await context.params;
  const updated = await transaction(async (client) => {
    const version = await client.query(`SELECT 1 FROM dxf_versions WHERE id=$1 AND document_id=$2`, [versionId, id]);
    if (!version.rowCount) return false;
    for (const layer of parsed.data.layers)
      await client.query(
        `UPDATE dxf_layers SET visible=COALESCE($3,visible),color=COALESCE($4,color),opacity=COALESCE($5,opacity),sort_order=COALESCE($6,sort_order) WHERE version_id=$1 AND name=$2`,
        [
          versionId,
          layer.name,
          layer.visible ?? null,
          layer.color ?? null,
          layer.opacity ?? null,
          layer.sortOrder ?? null,
        ],
      );
    return true;
  });
  if (!updated) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await writeAudit({
    actor: auth,
    action: "dxf.layers_update",
    resourceType: "dxf_document",
    resourceId: id,
    after: { versionId, layers: parsed.data.layers },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:publish");
  if (auth instanceof NextResponse) return auth;
  const { id, versionId } = await context.params;
  const result = await query(
    `UPDATE dxf_versions v SET status='archived'
     WHERE v.id=$1 AND v.document_id=$2 AND v.status<>'published'
       AND NOT EXISTS(SELECT 1 FROM dxf_documents d WHERE d.id=$2 AND d.active_version_id=v.id)
     RETURNING id`,
    [versionId, id],
  );
  if (!result.rowCount) return NextResponse.json({ error: "ACTIVE_OR_NOT_FOUND" }, { status: 409 });
  await writeAudit({
    actor: auth,
    action: "dxf.version_archive",
    resourceType: "dxf_document",
    resourceId: id,
    after: { versionId },
  });
  return NextResponse.json({ ok: true });
}
