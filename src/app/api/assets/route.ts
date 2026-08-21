import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { assetInputSchema, assetListSchema } from "@/server/asset-schema";
import { createAsset, listAssets } from "@/server/assets";
import { writeAudit } from "@/server/audit";

export async function GET(request: NextRequest) { const auth = await requireApiPermission(request, "asset:read"); if (auth instanceof NextResponse) return auth; const parsed = assetListSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams)); if (!parsed.success) return NextResponse.json({ error: "INVALID_QUERY", details: parsed.error.flatten() }, { status: 400 }); return NextResponse.json(await listAssets(parsed.data)); }
export async function POST(request: NextRequest) { const auth = await requireApiPermission(request, "asset:write"); if (auth instanceof NextResponse) return auth; const parsed = assetInputSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "INVALID_ASSET", details: parsed.error.flatten() }, { status: 422 }); try { const asset = await createAsset(parsed.data, auth); await writeAudit({ actor: auth, action: "asset.create", resourceType: "asset", resourceId: String(asset?.id), after: asset }); return NextResponse.json({ data: asset }, { status: 201 }); } catch (error) { if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "ASSET_NUMBER_EXISTS" }, { status: 409 }); throw error; } }
