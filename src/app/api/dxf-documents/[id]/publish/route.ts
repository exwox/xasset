import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { transaction } from "@/server/db";
import { publishDxfSchema } from "@/server/dxf-schema";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:publish");
  if (auth instanceof NextResponse) return auth;
  const parsed = publishDxfSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_VERSION" }, { status: 422 });
  const { id } = await context.params;
  const result = await transaction(async (client) => {
    const version = await client.query<{ status: string; transform_matrix: unknown }>(
      `SELECT status,transform_matrix FROM dxf_versions WHERE id=$1 AND document_id=$2 FOR UPDATE`,
      [parsed.data.versionId, id],
    );
    if (!version.rows[0]) return "missing";
    if (!version.rows[0].transform_matrix) return "not_georeferenced";
    if (!["ready", "published"].includes(version.rows[0].status)) return "not_ready";
    await client.query(
      `UPDATE dxf_versions SET status='ready' WHERE document_id=$1 AND status='published' AND id<>$2`,
      [id, parsed.data.versionId],
    );
    await client.query(`UPDATE dxf_versions SET status='published' WHERE id=$1`, [parsed.data.versionId]);
    await client.query(
      `UPDATE dxf_documents SET active_version_id=$2,status='published',updated_at=now() WHERE id=$1 AND archived_at IS NULL`,
      [id, parsed.data.versionId],
    );
    return "published";
  });
  if (result === "missing") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (result !== "published") return NextResponse.json({ error: result.toUpperCase() }, { status: 409 });
  await writeAudit({
    actor: auth,
    action: "dxf.publish",
    resourceType: "dxf_document",
    resourceId: id,
    after: { versionId: parsed.data.versionId },
  });
  return NextResponse.json({ data: { documentId: id, activeVersionId: parsed.data.versionId } });
}
