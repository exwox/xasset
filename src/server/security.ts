import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { config } from "./config";
import { redis } from "./redis";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
export function isTrustedMutation(
  input: { method: string; origin?: string | null; secFetchSite?: string | null },
  appUrl: string,
) {
  if (safeMethods.has(input.method.toUpperCase())) return true;
  if (input.secFetchSite === "cross-site") return false;
  if (!input.origin) return true;
  try {
    return new URL(input.origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
export function trustedRequestOrigin(request: NextRequest) {
  return isTrustedMutation(
    {
      method: request.method,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    config().APP_URL,
  );
}
export function opaqueRateLimitKey(scope: string, value: string) {
  return `rate:${scope}:${createHash("sha256").update(value.toLowerCase()).digest("hex")}`;
}
export async function checkRateLimit(key: string, limit: number, windowSeconds: number) {
  const client = redis();
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, windowSeconds);
  const ttl = Math.max(1, await client.ttl(key));
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: ttl };
}
