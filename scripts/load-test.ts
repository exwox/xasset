export {};
const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
const requests = Math.max(10, Number(process.env.LOAD_REQUESTS ?? 200));
const concurrency = Math.max(1, Math.min(50, Number(process.env.LOAD_CONCURRENCY ?? 10)));
const p95Limit = Number(process.env.LOAD_P95_LIMIT_MS ?? 1500);
if (!email || !password) throw new Error("SMOKE_EMAIL and SMOKE_PASSWORD are required");
const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
async function main() {
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`Login failed: ${login.status}`);
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Session cookie missing");
  const sessionCookie = cookie as string;
  // Resolve satu id aset stabil untuk endpoint deep-link/detail pada load baseline.
  const firstAsset = await fetch(`${base}/api/assets?page=1&pageSize=1`, { headers: { cookie: sessionCookie } });
  const stableAssetId = (await firstAsset.json().catch(() => null))?.data?.[0]?.id as string | undefined;
  const endpoints = [
    "/api/assets?page=1&pageSize=25",
    "/api/dxf-documents",
    ...(stableAssetId
      ? [
          `/api/assets/${stableAssetId}`, // deep-link/detail (fly-to)
          "/api/assets?pageSize=50&bbox=104.4523,0.8227,104.6123,1.0227", // spatial PostGIS bbox query
        ]
      : []),
  ];
  const latencies: number[] = [];
  let failures = 0,
    cursor = 0;
  const started = performance.now();
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= requests) return;
      const before = performance.now();
      try {
        const response = await fetch(`${base}${endpoints[index % endpoints.length]}`, {
          headers: { cookie: sessionCookie },
        });
        if (!response.ok) failures++;
      } catch {
        failures++;
      }
      latencies.push(performance.now() - before);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  latencies.sort((a, b) => a - b);
  const duration = performance.now() - started;
  const result = {
    requests,
    concurrency,
    failures,
    errorRate: failures / requests,
    durationMs: Number(duration.toFixed(1)),
    requestsPerSecond: Number((requests / (duration / 1000)).toFixed(2)),
    p50Ms: Number(percentile(latencies, 0.5).toFixed(1)),
    p95Ms: Number(percentile(latencies, 0.95).toFixed(1)),
    p99Ms: Number(percentile(latencies, 0.99).toFixed(1)),
    thresholds: { p95LimitMs: p95Limit, maxErrorRate: 0.01 },
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.p95Ms > p95Limit || result.errorRate > 0.01) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
