import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/server/api-auth";
import { query } from "@/server/db";
import { writeAudit } from "@/server/audit";

const resources = { classes: "asset_classes", categories: "asset_categories", units: "units_of_measure", frequencies: "usage_frequencies", sites: "sites", locations: "locations" } as const;
interface Context { params: Promise<{ resource: string }> }
const input = z.object({ code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(255) });
export async function GET(request: NextRequest, context: Context) { const auth = await requireApiPermission(request, "asset:read"); if (auth instanceof NextResponse) return auth; const key = (await context.params).resource as keyof typeof resources; const table = resources[key]; if (!table) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); const result = await query(`SELECT id,code,name FROM ${table} ORDER BY name`); return NextResponse.json({ data: result.rows }); }
export async function POST(request: NextRequest, context: Context) { const auth = await requireApiPermission(request, "admin:manage"); if (auth instanceof NextResponse) return auth; const key = (await context.params).resource as keyof typeof resources; const table = resources[key]; if (!table) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); const parsed = input.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "INVALID_MASTER_DATA" }, { status: 422 }); try { const result = await query<{ id: string; code: string; name: string }>(`INSERT INTO ${table}(code,name) VALUES($1,$2) RETURNING id,code,name`, [parsed.data.code, parsed.data.name]); await writeAudit({ actor: auth, action: "master.create", resourceType: key, resourceId: result.rows[0].id, after: result.rows[0] }); return NextResponse.json({ data: result.rows[0] }, { status: 201 }); } catch (error) { if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "CODE_EXISTS" }, { status: 409 }); throw error; } }
