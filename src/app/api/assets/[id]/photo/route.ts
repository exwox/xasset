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
  const auth = await requireApiPermission(request, "asset:read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const result = await query<{ objectKey: string; fileName: string }>(
    `SELECT object_key "objectKey",file_name "fileName"
       FROM asset_documents
      WHERE asset_id=$1
        AND archived_at IS NULL
        AND document_type='photo'
        AND content_type IN ('image/jpeg','image/png','image/webp')
      ORDER BY created_at DESC
      LIMIT 1`,
    [id],
  );
  const photo = result.rows[0];
  if (!photo) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const url = await getSignedUrl(
    publicStorage(),
    new GetObjectCommand({
      Bucket: config().S3_BUCKET,
      Key: photo.objectKey,
      ResponseContentDisposition: `inline; filename="${photo.fileName.replaceAll('"', "")}"`,
      ResponseCacheControl: "private, max-age=300",
    }),
    { expiresIn: 300 },
  );
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, max-age=60");
  return response;
}
