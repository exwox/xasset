import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { archiveAllAssets } from "@/server/assets";

const input = z.object({ confirmation: z.literal("HAPUS SEMUA") });

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission(request, "admin:manage");
  if (auth instanceof NextResponse) return auth;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "CONFIRMATION_REQUIRED" }, { status: 422 });
  const archived = await archiveAllAssets(auth);
  await writeAudit({
    actor: auth,
    action: "asset.archive_all",
    resourceType: "asset",
    after: { archived, recoverable: true },
  });
  return NextResponse.json({ archived, recoverable: true });
}
