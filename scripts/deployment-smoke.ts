export {};
const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
if (!email || !password) throw new Error("SMOKE_EMAIL and SMOKE_PASSWORD are required");
async function json(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return { response, body };
}
async function main() {
  const health = await json("/api/health");
  const login = await json("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password }),
  });
  const cookie = login.response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Session cookie missing");
  const headers = { cookie: cookie as string };
  const me = await json("/api/auth/me", { headers });
  const assets = await json("/api/assets?page=1&pageSize=1", { headers });
  const dxf = await json("/api/dxf-documents?status=published", { headers });
  let renderSegments: null | number = null;
  const active = dxf.body.data?.find((item: { activeVersionId?: string }) => item.activeVersionId);
  if (active) {
    const render = await json(`/api/dxf-documents/${active.id}/versions/${active.activeVersionId}/render`, { headers });
    renderSegments = render.body.segments?.length ?? 0;
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        health: health.body.status,
        user: me.body.user?.email,
        assetCount: assets.body.pagination?.total,
        publishedDxf: dxf.body.data?.length ?? 0,
        renderSegments,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
