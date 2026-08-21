import { GetObjectCommand } from "@aws-sdk/client-s3";
import { gunzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { deserializeDxfJson, serializeDxfJson } from "@/lib/dxf-processing";
import { requireApiPermission } from "@/server/api-auth";
import { config } from "@/server/config";
import { query } from "@/server/db";
import { storage } from "@/server/storage";

interface Context {
  params: Promise<{ id: string; versionId: string }>;
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:read");
  if (auth instanceof NextResponse) return auth;
  const { id, versionId } = await context.params;
  const result = await query<{ render_file_key: string | null; transform_matrix: unknown }>(
    `SELECT render_file_key,transform_matrix FROM dxf_versions WHERE id=$1 AND document_id=$2 AND status IN ('ready','published')`,
    [versionId, id],
  );
  if (!result.rows[0]?.render_file_key) return NextResponse.json({ error: "NOT_READY" }, { status: 404 });
  const object = await storage().send(
    new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: result.rows[0].render_file_key }),
  );
  const bytes = await object.Body?.transformToByteArray();
  if (!bytes) return NextResponse.json({ error: "EMPTY_RENDER" }, { status: 502 });
  const compressed = result.rows[0].render_file_key.endsWith(".gz") || object.ContentEncoding === "gzip";
  const body = (compressed ? gunzipSync(bytes) : Buffer.from(bytes)).toString("utf8");
  const render = deserializeDxfJson(JSON.parse(body));
  const layers = await query<{
    name: string;
    visible: boolean;
    color: string | null;
    opacity: string;
    sortOrder: number;
  }>(
    `SELECT name,visible,color,opacity,sort_order "sortOrder" FROM dxf_layers WHERE version_id=$1 ORDER BY sort_order`,
    [versionId],
  );
  const visible = new Set(layers.rows.filter((layer) => layer.visible).map((layer) => layer.name));
  const order = new Map(layers.rows.map((layer) => [layer.name, layer.sortOrder]));
  render.segments = render.segments
    .filter((segment) => visible.has(segment.layer))
    .sort((left, right) => (order.get(left.layer) ?? 0) - (order.get(right.layer) ?? 0));
  return NextResponse.json(
    { ...serializeDxfJson(render), transform: result.rows[0].transform_matrix, layers: layers.rows },
    { headers: { "cache-control": "private, max-age=60" } },
  );
}
