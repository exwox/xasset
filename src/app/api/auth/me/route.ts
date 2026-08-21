import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
export async function GET(request: NextRequest) { const result = await requireApiPermission(request, "asset:read"); return result instanceof NextResponse ? result : NextResponse.json({ user: result }); }
