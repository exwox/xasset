export {};

const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
if (!email || !password) throw new Error("SMOKE_EMAIL and SMOKE_PASSWORD are required");

// Posisi di area Tanjung Pinang, konsisten dengan data dan test spatial yang ada.
const LONGITUDE = 104.5323;
const LATITUDE = 0.9227;

let cookie = "";

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  if (cookie) headers.set("cookie", cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function main() {
  const checks: Record<string, boolean> = {};
  const details: Record<string, unknown> = {};

  // 1) Health + login (session berumur pendek).
  const health = await request("/api/health");
  checks.healthOk = health.response.ok;
  details.health = health.body?.status ?? health.response.status;

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { origin: base },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = login.response.headers.getSetCookie?.()[0] ?? login.response.headers.get("set-cookie");
  checks.loginOk = login.response.ok && Boolean(setCookie);
  cookie = setCookie?.split(";", 1)[0] ?? "";

  // 2) Baseline jumlah aset aktif.
  const baseline = await request("/api/assets?page=1&pageSize=1");
  const totalBefore = (baseline.body?.pagination?.total as number) ?? null;
  checks.baselineReadable = typeof totalBefore === "number";
  details.totalBefore = totalBefore;

  // 3) Create aset sementara.
  const assetNumber = `E2E-CRITICAL-${Date.now()}`;
  const created = await request("/api/assets", {
    method: "POST",
    body: JSON.stringify({
      assetNumber,
      assetCode: "E2E",
      description: "Critical flow temporary asset",
      quantity: 0,
      longitude: LONGITUDE,
      latitude: LATITUDE,
    }),
  });
  checks.createOk = created.response.status === 201;
  const id = created.body?.data?.id as string | undefined;
  const version = created.body?.data?.version as number | undefined;
  checks.createReturnsId = Boolean(id) && typeof version === "number";
  details.createdId = id;
  details.createdVersion = version;
  const uniqueId = id ?? "asset-placeholder";

  // 4) Deep-link detail (setara fly-to) mengembalikan 200.
  const detail = await request(`/api/assets/${uniqueId}`);
  checks.detailOk = detail.response.status === 200 && detail.body?.data?.assetNumber === assetNumber;

  // 5) PATCH posisi dengan optimistic locking (version benar).
  const patch = await request(`/api/assets/${uniqueId}`, {
    method: "PATCH",
    body: JSON.stringify({ longitude: LONGITUDE, latitude: LATITUDE, version }),
  });
  checks.positionPatched = patch.response.status === 200 && patch.body?.data?.version === (version as number) + 1;

  // 6) Optimistic-lock conflict: kirim version stale -> 409.
  const stale = await request(`/api/assets/${uniqueId}`, {
    method: "PATCH",
    body: JSON.stringify({ description: "stale write must be rejected", version }),
  });
  checks.staleWriteRejected = stale.response.status === 409;

  // 7) Query bbox/spatial menemukan aset yang baru diposisikan.
  const half = 0.01;
  const bboxUrl = `/api/assets?pageSize=50&bbox=${(LONGITUDE - half).toFixed(6)},${(LATITUDE - half).toFixed(6)},${(LONGITUDE + half).toFixed(6)},${(LATITUDE + half).toFixed(6)}`;
  const bbox = await request(bboxUrl);
  checks.bboxQueryOk = bbox.response.status === 200;
  checks.assetFoundInBbox = (bbox.body?.data as Array<{ id: string }>)?.some((item) => item.id === uniqueId) ?? false;

  // 8) Soft archive -> detail menjadi 404, dan jumlah aset aktif kembali baseline.
  const archived = await request(`/api/assets/${uniqueId}`, { method: "DELETE" });
  checks.softArchived = archived.response.ok;
  const afterArchiveDetail = await request(`/api/assets/${uniqueId}`);
  checks.archivedGoneFromDetail = afterArchiveDetail.response.status === 404;
  const after = await request("/api/assets?page=1&pageSize=1");
  const totalAfter = after.body?.pagination?.total as number | null;
  const didNotLeak = typeof totalBefore === "number" && typeof totalAfter === "number" && totalAfter === totalBefore;
  checks.assetCountRestored = didNotLeak;
  details.totalAfter = totalAfter;

  // 9) CSRF: piksel cross-site yang meniru login.
  const csrfProbe = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: new Headers({
      "content-type": "application/json",
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    }),
    body: JSON.stringify({ email, password }),
  });
  checks.csrfStillRejected = csrfProbe.status === 403;

  const report = {
    checks,
    details,
    ok: Object.values(checks).every(Boolean),
    ranAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
