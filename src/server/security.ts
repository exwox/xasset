import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { config } from "./config";
import { redis } from "./redis";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
export function isTrustedMutation(
  input: { method: string; origin?: string | null; secFetchSite?: string | null },
  appUrl: string,
  requestOrigin?: string,
) {
  if (safeMethods.has(input.method.toUpperCase())) return true;
  if (input.secFetchSite === "cross-site") return false;
  if (!input.origin) return true;
  try {
    const origin = new URL(input.origin).origin;
    return (
      origin === new URL(appUrl).origin || (requestOrigin !== undefined && origin === new URL(requestOrigin).origin)
    );
  } catch {
    return false;
  }
}
export function trustedRequestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(":", "");
  const requestOrigin = host ? `${protocol}://${host}` : request.nextUrl.origin;
  return isTrustedMutation(
    {
      method: request.method,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    config().APP_URL,
    requestOrigin,
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
