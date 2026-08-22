import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { config } from "@/server/config";
import { query } from "@/server/db";
import { publicStorage } from "@/server/storage";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:read");
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const document = await query(
    `SELECT id,name,status,site_id "siteId",building_id "buildingId",floor_id "floorId",active_version_id "activeVersionId",created_at "createdAt",updated_at "updatedAt"
     FROM dxf_documents WHERE id=$1 AND archived_at IS NULL`,
    [id],
  );
  if (!document.rows[0]) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const versions = await query<Record<string, unknown> & { id: string; preview_file_key: string | null }>(
    `SELECT id,version_number "versionNumber",file_name "fileName",size_bytes "sizeBytes",unit,crs,bounds,
      transform_matrix transform,control_points "controlPoints",entity_count "entityCount",
      supported_entity_count "supportedEntityCount",layer_count "layerCount",status,progress,
      residual_error_m "residualErrorMeters",error_message "errorMessage",change_note "changeNote",
      preview_file_key,created_at "createdAt",processed_at "processedAt"
     FROM dxf_versions WHERE document_id=$1 ORDER BY version_number DESC`,
    [id],
  );
  const layers = await query(
    `SELECT version_id "versionId",name,color,entity_count "entityCount",visible,opacity,sort_order "sortOrder"
     FROM dxf_layers WHERE version_id IN (SELECT id FROM dxf_versions WHERE document_id=$1) ORDER BY sort_order`,
    [id],
  );
  const rows = await Promise.all(
    versions.rows.map(async ({ preview_file_key, ...version }) => ({
      ...version,
      previewUrl: preview_file_key
        ? await getSignedUrl(publicStorage(), new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: preview_file_key }), {
            expiresIn: 300,
          })
        : null,
      layers: layers.rows.filter((layer) => layer.versionId === version.id),
    })),
  );
  return NextResponse.json({ data: { ...document.rows[0], versions: rows } });
}
