import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { config } from "@/server/config";
import { query, transaction } from "@/server/db";
import { dxfUploadSchema } from "@/server/dxf-schema";
import { publicStorage } from "@/server/storage";

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission(request, "dxf:read");
  if (auth instanceof NextResponse) return auth;
  const onlyPublished = request.nextUrl.searchParams.get("status") === "published";
  const result = await query(
    `SELECT d.id,d.name,d.status,d.site_id "siteId",s.name "siteName",d.building_id "buildingId",b.name "buildingName",d.floor_id "floorId",f.name "floorName",
      d.active_version_id "activeVersionId",d.updated_at "updatedAt",v.version_number "activeVersionNumber",
      v.status "activeVersionStatus",v.transform_matrix "transform",v.bounds,v.entity_count "entityCount",
      v.layer_count "layerCount",v.residual_error_m "residualErrorMeters",
      mv.id "mapVersionId",mv.version_number "mapVersionNumber",mv.status "mapVersionStatus",
      mv.transform_matrix "mapTransform",mv.entity_count "mapEntityCount"
     FROM dxf_documents d LEFT JOIN dxf_versions v ON v.id=d.active_version_id
     LEFT JOIN LATERAL (
       SELECT id,version_number,status,transform_matrix,entity_count
       FROM dxf_versions
       WHERE document_id=d.id AND status IN ('ready','published') AND render_file_key IS NOT NULL
       ORDER BY (id=d.active_version_id) DESC,version_number DESC
       LIMIT 1
     ) mv ON true
     LEFT JOIN sites s ON s.id=d.site_id LEFT JOIN buildings b ON b.id=d.building_id LEFT JOIN floors f ON f.id=d.floor_id
     WHERE d.archived_at IS NULL ${onlyPublished ? "AND d.status='published'" : ""}
     ORDER BY d.updated_at DESC`,
  );
  return NextResponse.json({ data: result.rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission(request, "dxf:write");
  if (auth instanceof NextResponse) return auth;
  const parsed = dxfUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "INVALID_DXF", details: parsed.error.flatten() }, { status: 422 });
  const input = parsed.data;
  const documentId = input.documentId ?? crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const sourceKey = `dxf/${documentId}/${versionId}/source-${safeName}`;
  const versionNumber = await transaction(async (client) => {
    if (input.documentId) {
      const found = await client.query(`SELECT 1 FROM dxf_documents WHERE id=$1 AND archived_at IS NULL FOR UPDATE`, [
        documentId,
      ]);
      if (!found.rowCount) throw new Error("DXF_DOCUMENT_NOT_FOUND");
    } else {
      let siteId = input.siteId ?? null;
      if (!siteId) siteId = (await client.query<{ id: string }>(`SELECT id FROM sites ORDER BY active DESC,created_at LIMIT 1`)).rows[0]?.id;
      await client.query(
        `INSERT INTO dxf_documents(id,name,site_id,building_id,floor_id,created_by) VALUES($1,$2,$3,$4,$5,$6)`,
        [documentId, input.name, siteId, input.buildingId ?? null, input.floorId ?? null, auth.userId],
      );
    }
    const next = await client.query<{ version: number }>(
      `SELECT COALESCE(max(version_number),0)+1 version FROM dxf_versions WHERE document_id=$1`,
      [documentId],
    );
    const number = next.rows[0].version;
    await client.query(
      `INSERT INTO dxf_versions(id,document_id,version_number,file_name,content_type,size_bytes,source_file_key,change_note,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        versionId,
        documentId,
        number,
        input.fileName,
        input.contentType,
        input.sizeBytes,
        sourceKey,
        input.changeNote,
        auth.userId,
      ],
    );
    return number;
  }).catch((error: Error) => {
    if (error.message === "DXF_DOCUMENT_NOT_FOUND") return null;
    throw error;
  });
  if (versionNumber == null) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const uploadUrl = await getSignedUrl(
    publicStorage(),
    new PutObjectCommand({
      Bucket: config().S3_BUCKET,
      Key: sourceKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
      Metadata: { document: documentId, version: versionId },
    }),
    { expiresIn: 900 },
  );
  await writeAudit({
    actor: auth,
    action: "dxf.version_create",
    resourceType: "dxf_document",
    resourceId: documentId,
    after: { versionId, versionNumber, fileName: input.fileName, sizeBytes: input.sizeBytes },
  });
  return NextResponse.json(
    { data: { documentId, versionId, versionNumber, objectKey: sourceKey, uploadUrl, expiresIn: 900 } },
    { status: 201 },
  );
}
