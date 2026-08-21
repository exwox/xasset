import { AssetDashboard } from "@/components/asset-dashboard";
import { hasPermission, requirePageSession } from "@/server/auth";
import { listAssets } from "@/server/assets";
import type { Asset } from "@/lib/types";
import { getActiveSite } from "@/server/admin";

export default async function Home({ searchParams }: { searchParams: Promise<{ asset?: string; position?: string; polygon?: string }> }) {
  const session = await requirePageSession();
  const canWrite = hasPermission(session, "asset:write");
  const params = await searchParams;
  const [first, activeSite] = await Promise.all([
    listAssets({ q: "", page: 1, pageSize: 100, sort: "no", order: "asc" }),
    getActiveSite(),
  ]);
  const rows = [...first.data];
  for (let page = 2; page <= first.pagination.pages; page += 1)
    rows.push(...(await listAssets({ q: "", page, pageSize: 100, sort: "no", order: "asc" })).data);
  const assets = rows.map((value) => {
    const row = value as Record<string, unknown>;
    return {
      id: String(row.id),
      no: Number(row.no),
      assetNumber: String(row.assetNumber),
      capitalizedOn: row.capitalizedOn ? new Date(String(row.capitalizedOn)).toISOString() : "",
      assetCode: String(row.assetCode),
      assetClass: String(row.assetClass ?? "Belum diklasifikasi"),
      description: String(row.description),
      acquisitionValue: Number(row.acquisitionValue),
      bookValue: Number(row.bookValue),
      quantity: Number(row.quantity),
      unit: String(row.unit ?? "UNIT"),
      location: String(row.location ?? "Belum ditentukan"),
      subAsset: String(row.subAsset ?? row.parentAssetNumber ?? "—"),
      documentationCount: Number(row.documentationCount ?? 0),
      photoDocumentId: row.photoDocumentId == null ? null : String(row.photoDocumentId),
      documentationNote: row.documentationNote == null ? null : String(row.documentationNote),
      coordinateText: row.coordinateText == null ? null : String(row.coordinateText),
      polygon: Array.isArray(row.polygon)
        ? row.polygon.flatMap((point) => {
            const value = point as { longitude?: unknown; latitude?: unknown };
            const longitude = Number(value.longitude);
            const latitude = Number(value.latitude);
            return Number.isFinite(longitude) && Number.isFinite(latitude) ? [{ longitude, latitude }] : [];
          })
        : null,
      layout: String(row.layout ?? row.layoutReference ?? "Belum dipetakan"),
      maintenance: row.maintenance as Asset["maintenance"],
      usageFrequency: String(row.usageFrequency ?? "Belum ditentukan"),
      longitude: row.longitude == null ? null : Number(row.longitude),
      latitude: row.latitude == null ? null : Number(row.latitude),
      altitude: row.altitude == null ? null : Number(row.altitude),
      localX: row.localX == null ? null : Number(row.localX),
      localY: row.localY == null ? null : Number(row.localY),
      localZ: row.localZ == null ? null : Number(row.localZ),
      dxfDocumentId: row.dxfDocumentId == null ? null : String(row.dxfDocumentId),
      floorId: row.floorId == null ? null : String(row.floorId),
      version: Number(row.version),
    } satisfies Asset;
  });
  return (
    <AssetDashboard
      initialAssets={assets}
      initialSelectedId={params.asset}
      positionAssetId={canWrite ? params.position : undefined}
      polygonAssetId={canWrite ? params.polygon : undefined}
      canWrite={canWrite}
      canManageData={session.role !== "viewer"}
      canAdmin={hasPermission(session, "admin:manage")}
      activeSite={activeSite}
      userName={session.name}
    />
  );
}
