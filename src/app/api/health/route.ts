import { NextResponse } from "next/server";
import { query } from "@/server/db";
import { redis } from "@/server/redis";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { config } from "@/server/config";
import { storage } from "@/server/storage";

export const dynamic = "force-dynamic";
const timed = async (operation: () => Promise<unknown>, milliseconds = 2500) =>
  Promise.race([operation(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), milliseconds))]);
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("mode") === "live")
    return NextResponse.json(
      { status: "ok", timestamp: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  const started = performance.now();
  const checks: Record<string, string> = {};
  try {
    await timed(() => query("SELECT 1"));
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }
  try {
    await timed(async () => {
      if (redis().status === "wait") await redis().connect();
      await redis().ping();
    });
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
  }
  try {
    await timed(() => storage().send(new HeadBucketCommand({ Bucket: config().S3_BUCKET })));
    checks.storage = "ok";
  } catch {
    checks.storage = "error";
  }
  const healthy = Object.values(checks).every((value) => value === "ok");
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks,
      durationMs: Number((performance.now() - started).toFixed(1)),
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
