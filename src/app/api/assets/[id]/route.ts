import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { assetPatchSchema } from "@/server/asset-schema";
import { archiveAsset, getAsset, updateAsset } from "@/server/assets";
import { writeAudit } from "@/server/audit";

interface Context { params: Promise<{ id: string }> }
export async function GET(request: NextRequest, context: Context) { const auth = await requireApiPermission(request, "asset:read"); if (auth instanceof NextResponse) return auth; const asset = await getAsset((await context.params).id); return asset ? NextResponse.json({ data: asset }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); }
export async function PATCH(request: NextRequest, context: Context) { const auth = await requireApiPermission(request, "asset:write"); if (auth instanceof NextResponse) return auth; const parsed = assetPatchSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "INVALID_ASSET", details: parsed.error.flatten() }, { status: 422 }); const result = await updateAsset((await context.params).id, parsed.data, auth); if (result.state === "missing") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); if (result.state === "conflict") return NextResponse.json({ error: "VERSION_CONFLICT", currentVersion: result.currentVersion }, { status: 409 }); return NextResponse.json({ data: result.asset }); }
export async function DELETE(request: NextRequest, context: Context) { const auth = await requireApiPermission(request, "asset:write"); if (auth instanceof NextResponse) return auth; const id = (await context.params).id; if (!await archiveAsset(id, auth)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); await writeAudit({ actor: auth, action: "asset.archive", resourceType: "asset", resourceId: id }); return NextResponse.json({ ok: true }); }
