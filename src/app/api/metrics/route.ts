import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { registry } from "@/server/metrics";
export async function GET(request: NextRequest) { const auth = await requireApiPermission(request, "admin:manage"); if (auth instanceof NextResponse) return auth; return new NextResponse(await registry().metrics(), { headers: { "content-type": registry().contentType } }); }
