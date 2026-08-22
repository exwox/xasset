import { NextRequest, NextResponse } from "next/server";
import { fitAffineTransform, fitSimilarityTransform } from "@/lib/coordinates";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { query } from "@/server/db";
import { georeferenceRequestSchema } from "@/server/dxf-schema";

interface Context {
  params: Promise<{ id: string; versionId: string }>;
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireApiPermission(request, "dxf:write");
  if (auth instanceof NextResponse) return auth;
  const parsed = georeferenceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "INVALID_GEOREFERENCE", details: parsed.error.flatten() }, { status: 422 });
  const { id, versionId } = await context.params;
  if ("method" in parsed.data) {
    const result = await query(
      `UPDATE dxf_versions SET control_points='[]'::jsonb,transform_matrix=$3,residual_error_m=NULL
       WHERE id=$1 AND document_id=$2 AND status IN ('ready','published') RETURNING id`,
      [versionId, id, JSON.stringify(parsed.data.transform)],
    );
    if (!result.rowCount) return NextResponse.json({ error: "NOT_READY" }, { status: 409 });
    await writeAudit({
      actor: auth,
      action: "dxf.georeference_manual",
      resourceType: "dxf_document",
      resourceId: id,
      after: { versionId, transform: parsed.data.transform },
    });
    return NextResponse.json({ data: { transform: parsed.data.transform, accepted: true } });
  }
  let transform;
  try {
    transform =
      parsed.data.transformMode === "affine"
        ? fitAffineTransform(parsed.data.controlPoints)
        : fitSimilarityTransform(parsed.data.controlPoints);
  } catch (error) {
    return NextResponse.json(
      { error: "INVALID_TRANSFORM", message: error instanceof Error ? error.message : "Transformasi gagal" },
      { status: 422 },
    );
  }
  const { residualErrorMeters, ...storedTransform } = transform;
  const result = await query(
    `UPDATE dxf_versions SET control_points=$3,transform_matrix=$4,residual_error_m=$5
     WHERE id=$1 AND document_id=$2 AND status IN ('ready','published') RETURNING id`,
    [versionId, id, JSON.stringify(parsed.data.controlPoints), JSON.stringify(storedTransform), residualErrorMeters],
  );
  if (!result.rowCount) return NextResponse.json({ error: "NOT_READY" }, { status: 409 });
  await writeAudit({
    actor: auth,
    action: "dxf.georeference",
    resourceType: "dxf_document",
    resourceId: id,
    after: { versionId, controlPoints: parsed.data.controlPoints, transform },
  });
  return NextResponse.json({
    data: {
      transform,
      accepted: residualErrorMeters <= parsed.data.maximumResidualMeters,
      maximumResidualMeters: parsed.data.maximumResidualMeters,
    },
  });
}
