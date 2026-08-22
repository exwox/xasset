"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { assets as fallbackAssets } from "@/lib/assets";
import { decodeDxfSegments } from "@/lib/dxf-processing";
import { ASSET_STATUSES, assetStatusClass } from "@/lib/asset-status";
import type { ActiveSite, Asset, DxfLayerStyle, DxfMapOverlay, DxfTransform, WorldPoint } from "@/lib/types";
import { CesiumMap } from "./cesium-map";
import { AssetEditModal } from "./asset-edit-modal";
import Link from "next/link";
import { LogoutButton } from "./logout-button";

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
interface MapDxf {
  id: string;
  name: string;
  status: string;
  mapVersionId: string | null;
  mapVersionNumber: number | null;
  mapVersionStatus: "ready" | "published" | null;
  mapTransform: DxfTransform | null;
  siteName?: string;
  buildingName?: string;
  floorName?: string;
}

export function AssetDashboard({
  initialAssets = fallbackAssets,
  initialSelectedId,
  positionAssetId,
  polygonAssetId,
  canWrite = false,
  canManageData = false,
  canAdmin = false,
  activeSite = {
    id: "",
    code: "TNJ",
    name: "Tanjung Pinang",
    longitude: 104.5323,
    latitude: 0.9227,
    cameraHeight: 4200,
  },
  userName = "User",
}: {
  initialAssets?: typeof fallbackAssets;
  initialSelectedId?: string;
  positionAssetId?: string;
  polygonAssetId?: string;
  canWrite?: boolean;
  canManageData?: boolean;
  canAdmin?: boolean;
  activeSite?: ActiveSite;
  userName?: string;
}) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Semua status");
  const [assetClass, setAssetClass] = useState("Semua class aset");
  const [mapping, setMapping] = useState("Semua posisi");
  const [mobileView, setMobileView] = useState<"list" | "map" | "detail">(initialSelectedId ? "detail" : "map");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialSelectedId && initialAssets.some((asset) => asset.id === initialSelectedId)
      ? initialSelectedId
      : (positionAssetId ?? polygonAssetId ?? initialAssets[0]?.id ?? null),
  );
  const [polygonDraft, setPolygonDraft] = useState<WorldPoint[]>(() =>
    polygonAssetId ? [...(initialAssets.find((asset) => asset.id === polygonAssetId)?.polygon ?? [])] : [],
  );
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [dxfOverlays, setDxfOverlays] = useState<DxfMapOverlay[]>([]);
  const [mapDxf, setMapDxf] = useState<MapDxf[]>([]);
  const [loadingDxfIds, setLoadingDxfIds] = useState<string[]>([]);
  const [dxfError, setDxfError] = useState<string>();
  const assetClasses = useMemo(
    () =>
      [...new Set(assets.map((asset) => asset.assetClass).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")),
    [assets],
  );
  const filtered = useMemo(
    () =>
      assets.filter((asset) => {
        const text =
          `${asset.assetNumber} ${asset.assetCode} ${asset.description} ${asset.assetClass} ${asset.location}`.toLowerCase();
        const hasPosition =
          (asset.longitude != null && asset.latitude != null) ||
          (asset.localX != null && asset.localY != null && asset.dxfDocumentId != null) ||
          Boolean(asset.polygon?.length);
        const positionMatch =
          mapping === "Semua posisi" || (mapping === "Sudah dipetakan" ? hasPosition : !hasPosition);
        return (
          text.includes(query.toLowerCase()) &&
          (status === "Semua status" || asset.maintenance === status) &&
          (assetClass === "Semua class aset" || asset.assetClass === assetClass) &&
          positionMatch
        );
      }),
    [assetClass, assets, mapping, query, status],
  );
  const selected = assets.find((asset) => asset.id === selectedId);
  const visibleDxfOverlays = dxfOverlays.filter((overlay) => overlay.visible);
  const visibleDxfSegments = visibleDxfOverlays.reduce((total, overlay) => total + overlay.segments.length, 0);
  const dxfName = dxfError
    ? dxfError
    : loadingDxfIds.length
      ? `Memuat ${loadingDxfIds.length} DXF...`
      : visibleDxfOverlays.length
        ? `${visibleDxfOverlays.length} DXF tampil · ${visibleDxfSegments.toLocaleString("id-ID")} segmen`
        : dxfOverlays.length
          ? "Semua layer DXF disembunyikan"
          : "Belum ada DXF yang siap ditampilkan";

  const loadMapDxf = useCallback(async (document: MapDxf) => {
    if (!document.mapVersionId || !document.mapTransform) {
      setDxfError(`${document.name} belum memiliki georeference.`);
      return;
    }
    setLoadingDxfIds((current) => (current.includes(document.id) ? current : [...current, document.id]));
    setDxfError(undefined);
    try {
      const renderResponse = await fetch(`/api/dxf-documents/${document.id}/versions/${document.mapVersionId}/render`);
      if (!renderResponse.ok) throw new Error("Render DXF belum tersedia");
      const render = await renderResponse.json();
      const decodedSegments = decodeDxfSegments(render);
      const overlay: DxfMapOverlay = {
        documentId: document.id,
        versionId: document.mapVersionId,
        versionNumber: document.mapVersionNumber ?? 0,
        name: document.name,
        segments: decodedSegments,
        transform: render.transform ?? document.mapTransform,
        layers: (render.layers ?? []).map((layer: DxfLayerStyle & { opacity: string | number }) => ({
          ...layer,
          opacity: Number(layer.opacity),
        })),
        visible: true,
      };
      setDxfOverlays((current) => [...current.filter((item) => item.documentId !== document.id), overlay]);
    } catch (error) {
      setDxfError(`${document.name}: ${error instanceof Error ? error.message : "Layer DXF gagal dimuat"}`);
    } finally {
      setLoadingDxfIds((current) => current.filter((id) => id !== document.id));
    }
  }, []);

  const setMapDxfVisible = useCallback((document: MapDxf, visible: boolean) => {
    const loaded = dxfOverlays.some((overlay) => overlay.documentId === document.id);
    if (visible && !loaded) {
      void loadMapDxf(document);
      return;
    }
    setDxfError(undefined);
    setDxfOverlays((current) =>
      current.map((overlay) => (overlay.documentId === document.id ? { ...overlay, visible } : overlay)),
    );
  }, [dxfOverlays, loadMapDxf]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/dxf-documents");
        if (!response.ok) return;
        const result = await response.json();
        const documents = (result.data as MapDxf[]).filter((document) => document.mapVersionId);
        setMapDxf(documents);
        await Promise.all(documents.filter((document) => document.mapTransform).map(loadMapDxf));
      } catch {
        // Optional overlay discovery must not block the asset dashboard.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMapDxf]);

  function printMapView() {
    const previousTitle = document.title;
    document.title = `XASSET - Tampilan Peta - ${new Date().toLocaleDateString("id-ID")}`;
    try {
      window.print();
    } finally {
      document.title = previousTitle;
    }
  }

  async function placeAsset(point: { longitude: number; latitude: number }) {
    const asset = assets.find((item) => item.id === positionAssetId);
    if (!asset) return;
    const coordinateText = `${point.latitude.toFixed(7)}, ${point.longitude.toFixed(7)}`;
    const response = await fetch(`/api/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        longitude: point.longitude,
        latitude: point.latitude,
        coordinateText,
        altitude: 0,
        version: asset.version,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      window.alert(
        result.error === "VERSION_CONFLICT" ? "Data aset berubah. Muat ulang halaman." : "Posisi aset gagal disimpan.",
      );
      return;
    }
    setAssets((current) =>
      current.map((item) =>
        item.id === asset.id
          ? {
              ...item,
              longitude: point.longitude,
              latitude: point.latitude,
              coordinateText,
              altitude: 0,
              version: Number(result.data.version),
            }
          : item,
      ),
    );
    router.replace(`/?asset=${asset.id}`);
  }

  function cancelPlacement() {
    router.replace(selectedId ? `/?asset=${selectedId}` : "/");
  }

  async function savePolygon() {
    const asset = assets.find((item) => item.id === polygonAssetId);
    if (!asset || polygonDraft.length < 3) return;
    const center = polygonDraft.reduce(
      (result, point) => ({
        longitude: result.longitude + point.longitude / polygonDraft.length,
        latitude: result.latitude + point.latitude / polygonDraft.length,
      }),
      { longitude: 0, latitude: 0 },
    );
    const coordinateText = `Polygon ${polygonDraft.length} titik · pusat ${center.latitude.toFixed(7)}, ${center.longitude.toFixed(7)}`;
    const response = await fetch(`/api/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        polygon: polygonDraft,
        longitude: center.longitude,
        latitude: center.latitude,
        coordinateText,
        altitude: 0,
        version: asset.version,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      window.alert(
        result.error === "VERSION_CONFLICT" ? "Data aset berubah. Muat ulang halaman." : "Polygon aset gagal disimpan.",
      );
      return;
    }
    setAssets((current) =>
      current.map((item) =>
        item.id === asset.id
          ? {
              ...item,
              polygon: polygonDraft,
              longitude: center.longitude,
              latitude: center.latitude,
              coordinateText,
              altitude: 0,
              version: Number(result.data.version),
            }
          : item,
      ),
    );
    setPolygonDraft([]);
    router.replace(`/?asset=${asset.id}`);
  }

  async function clearAssetGeometry(assetId: string, kind: "position" | "polygon") {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    const label = kind === "position" ? "posisi" : "polygon";
    if (!window.confirm(`Hapus ${label} aset ini?`)) return;
    const changes =
      kind === "position"
        ? {
            longitude: null,
            latitude: null,
            altitude: null,
            localX: null,
            localY: null,
            localZ: null,
            coordinateText: null,
          }
        : { polygon: null };
    const response = await fetch(`/api/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...changes, version: asset.version }),
    });
    const result = await response.json();
    if (!response.ok) {
      window.alert(
        result.error === "VERSION_CONFLICT" ? "Data aset berubah. Muat ulang halaman." : `${label} aset gagal dihapus.`,
      );
      return;
    }
    setAssets((current) =>
      current.map((item) =>
        item.id === asset.id ? { ...item, ...changes, version: Number(result.data.version) } : item,
      ),
    );
  }

  return (
    <main className={`app-shell ${positionAssetId || polygonAssetId ? "placement-focus" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">X</span>
          <div>
            <strong>XASSET</strong>
            <small>COMMAND CENTER</small>
          </div>
        </div>
        <div className="site">
          <span>ACTIVE SITE</span>
          <strong>
            {activeSite.name} · {activeSite.code}
          </strong>
        </div>
        <div className="top-actions">
          {canManageData && (
            <Link href="/assets" className="data-link">
              DATA ASET
            </Link>
          )}
          {canManageData && (
            <Link href="/dxf" className="data-link">
              DXF
            </Link>
          )}
          {canAdmin && (
            <Link href="/admin" className="data-link">
              ADMIN
            </Link>
          )}
          <span className="live">
            <i /> SYSTEM LIVE
          </span>
          <span className="avatar" title={userName}>
            {userName
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </span>
          <LogoutButton />
        </div>
      </header>
      <section className="toolbar">
        <label className="search">
          ⌕
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari No, No Asset, kode, deskripsi, class, lokasi..."
          />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option>Semua status</option>
          {ASSET_STATUSES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="Filter class aset"
          value={assetClass}
          onChange={(event) => setAssetClass(event.target.value)}
        >
          <option>Semua class aset</option>
          {assetClasses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={mapping} onChange={(event) => setMapping(event.target.value)}>
          <option>Semua posisi</option>
          <option>Sudah dipetakan</option>
          <option>Belum dipetakan</option>
        </select>
        <button className="map-print-button" onClick={printMapView}>
          ⎙ Print / PDF
        </button>
      </section>
      <nav className="mobile-view-nav" aria-label="Tampilan dashboard mobile">
        <button
          type="button"
          className={mobileView === "list" ? "active" : ""}
          aria-pressed={mobileView === "list"}
          onClick={() => setMobileView("list")}
        >
          Daftar <span>{filtered.length}</span>
        </button>
        <button
          type="button"
          className={mobileView === "map" ? "active" : ""}
          aria-pressed={mobileView === "map"}
          onClick={() => setMobileView("map")}
        >
          Peta
        </button>
        <button
          type="button"
          className={mobileView === "detail" ? "active" : ""}
          aria-pressed={mobileView === "detail"}
          disabled={!selected}
          onClick={() => setMobileView("detail")}
        >
          Detail
        </button>
      </nav>
      <section className={`workspace mobile-view-${mobileView}`}>
        <aside className="asset-panel">
          <div className="panel-heading">
            <div>
              <span>ASSET DIRECTORY</span>
              <strong>{filtered.length} aset terlihat</strong>
            </div>
            <button>⋮</button>
          </div>
          <div className="asset-list">
            {filtered.map((asset) => (
              <button
                key={asset.id}
                className={`asset-card ${selectedId === asset.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedId(asset.id);
                  setMobileView("detail");
                }}
              >
                <span className="asset-thumbnail" aria-hidden="true">
                  {asset.photoDocumentId ? (
                    <img src={`/api/assets/${asset.id}/photo?v=${asset.photoDocumentId}`} alt="" loading="lazy" />
                  ) : (
                    <span>⌑</span>
                  )}
                </span>
                <span className={`status-dot ${assetStatusClass(asset.maintenance)}`} />
                <span className="card-main">
                  <b>
                    <span className="directory-no">No. {asset.no}</span>
                    {asset.assetCode}
                  </b>
                  <strong>{asset.description}</strong>
                  <small>
                    No Asset {asset.assetNumber} · {asset.assetClass} · {asset.location}
                  </small>
                </span>
                <span className="chevron">›</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="map-panel">
          <CesiumMap
            assets={filtered}
            selectedId={selectedId}
            dxfOverlays={dxfOverlays}
            positionAssetId={positionAssetId}
            polygonAssetId={polygonAssetId}
            polygonDraft={polygonDraft}
            activeSite={activeSite}
            onSelect={setSelectedId}
            onPlace={placeAsset}
            onPolygonPoint={(point) => setPolygonDraft((current) => [...current, point])}
            onPolygonUndo={() => setPolygonDraft((current) => current.slice(0, -1))}
            onPolygonSave={savePolygon}
            onCancelPlace={cancelPlacement}
          />
          <div className="map-title">
            <span>3D GEOSPATIAL VIEW</span>
            <strong>
              {activeSite.name} · {activeSite.code}
            </strong>
          </div>
          <div className="print-map-title">Layout {activeSite.name}</div>
          <div className="print-map-caption">
            <strong>XASSET · Tampilan Peta Aset</strong>
            <span>{dxfName}</span>
          </div>
          <details className="layer-menu">
            <summary className="layer-menu-heading">
              <span>
                <i /> LAYER DXF
              </span>
              <span className="layer-menu-count">
                {visibleDxfOverlays.length}/{mapDxf.length} ON
              </span>
            </summary>
            <div className="layer-menu-content">
              <span className="layer-menu-actions">
                <button
                  type="button"
                  aria-label="Tampilkan semua layer DXF"
                  onClick={() => mapDxf.filter((document) => document.mapTransform).forEach((document) => setMapDxfVisible(document, true))}
                >
                  Semua ON
                </button>
                <button
                  type="button"
                  aria-label="Sembunyikan semua layer DXF"
                  onClick={() => setDxfOverlays((current) => current.map((overlay) => ({ ...overlay, visible: false })))}
                >
                  Semua OFF
                </button>
              </span>
              <div className="map-dxf-layers" aria-label="Layer DXF pada peta">
                {mapDxf.map((document) => (
                  <label className="map-dxf-layer" key={document.id}>
                    <input
                      type="checkbox"
                      checked={dxfOverlays.some((overlay) => overlay.documentId === document.id && overlay.visible)}
                      disabled={!document.mapTransform || loadingDxfIds.includes(document.id)}
                      onChange={(event) => setMapDxfVisible(document, event.target.checked)}
                    />
                    <span>
                      <strong>{document.name}</strong>
                      <small>
                        {[document.siteName, document.buildingName, document.floorName].filter(Boolean).join(" · ")}
                        {` · v${document.mapVersionNumber} · ${document.mapVersionStatus === "published" ? "Published" : "Upload siap"}`}
                        {!document.mapTransform ? " · perlu georeference" : ""}
                      </small>
                    </span>
                  </label>
                ))}
                {!mapDxf.length && <span className="map-dxf-empty">Belum ada DXF siap.</span>}
              </div>
              <small className="layer-menu-status">{dxfName}</small>
            </div>
          </details>
          <div className="legend">
            {ASSET_STATUSES.map((item) => (
              <span key={item}>
                <i className={assetStatusClass(item)} /> {item}
              </span>
            ))}
          </div>
        </section>
        {selected && (
          <aside className="detail-panel">
            <div className="detail-head">
              <span>ASSET DETAIL</span>
              <button
                aria-label="Tutup detail aset"
                onClick={() => {
                  setSelectedId(null);
                  setMobileView("map");
                }}
              >
                ×
              </button>
            </div>
            <div className="asset-hero">
              {selected.photoDocumentId && (
                <img
                  className="asset-hero-photo"
                  src={`/api/assets/${selected.id}/photo?v=${selected.photoDocumentId}`}
                  alt={`Foto ${selected.description}`}
                />
              )}
              <small>{selected.assetNumber}</small>
              <h2>{selected.description}</h2>
              <p>
                {selected.assetCode} · {selected.assetClass}
              </p>
              <div className="asset-status-actions">
                <span className={`badge ${assetStatusClass(selected.maintenance)}`}>{selected.maintenance}</span>
                {canWrite && (
                  <button type="button" onClick={() => setEditingAssetId(selected.id)}>
                    Edit Asset
                  </button>
                )}
              </div>
            </div>
            <dl>
              <div>
                <dt>Capitalized on</dt>
                <dd suppressHydrationWarning>{new Date(selected.capitalizedOn).toLocaleDateString("id-ID")}</dd>
              </div>
              <div>
                <dt>Acquis. val.</dt>
                <dd>{currency.format(selected.acquisitionValue)}</dd>
              </div>
              <div>
                <dt>Book val.</dt>
                <dd>{currency.format(selected.bookValue)}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>
                  {selected.quantity} {selected.unit}
                </dd>
              </div>
              <div>
                <dt>Sub Asset</dt>
                <dd>{selected.subAsset}</dd>
              </div>
              <div>
                <dt>Frekuensi</dt>
                <dd>{selected.usageFrequency}</dd>
              </div>
              <div>
                <dt>Lokasi / Layout</dt>
                <dd>{selected.layout}</dd>
              </div>
              <div>
                <dt>Dokumentasi</dt>
                <dd>{selected.documentationCount} file</dd>
              </div>
            </dl>
            {selected.longitude == null && selected.localX == null && (
              <p className="unmapped-note">Belum memiliki koordinat/layout terkalibrasi.</p>
            )}
            <div className="detail-actions">
              {canWrite && (
                <Link className="position-link" href={`/?position=${selected.id}`}>
                  {selected.longitude == null ? "Tentukan posisi" : "Ubah posisi"}
                </Link>
              )}
              {canWrite &&
                ((selected.longitude != null && selected.latitude != null) ||
                  (selected.localX != null && selected.localY != null)) && (
                  <button
                    type="button"
                    className="geometry-delete"
                    onClick={() => clearAssetGeometry(selected.id, "position")}
                  >
                    Hapus posisi
                  </button>
                )}
              {canWrite && (
                <Link className="position-link" href={`/?polygon=${selected.id}`}>
                  {selected.polygon?.length ? "Ubah polygon" : "Gambar polygon"}
                </Link>
              )}
              {canWrite && selected.polygon && selected.polygon.length >= 3 && (
                <button
                  type="button"
                  className="geometry-delete"
                  onClick={() => clearAssetGeometry(selected.id, "polygon")}
                >
                  Hapus polygon
                </button>
              )}
              <Link className="primary" href={`/assets/${selected.id}`}>
                Buka data lengkap ↗
              </Link>
            </div>
          </aside>
        )}
      </section>
      <section className="print-asset-report" aria-hidden="true">
        <header>
          <div>
            <span>XASSET · ASSET DIRECTORY</span>
            <h1>Data Aset - {assetClass}</h1>
          </div>
          <strong>{filtered.length} aset</strong>
        </header>
        <p className="print-filter-summary">
          Pencarian: {query.trim() || "Semua"} · Status: {status} · Class: {assetClass} · Posisi: {mapping}
        </p>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>No Aset</th>
              <th>Kode</th>
              <th>Deskripsi</th>
              <th>Class Aset</th>
              <th>Lokasi</th>
              <th>Status</th>
              <th>Book Value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((asset) => (
              <tr key={asset.id}>
                <td>{asset.no}</td>
                <td>{asset.assetNumber}</td>
                <td>{asset.assetCode}</td>
                <td>{asset.description}</td>
                <td>{asset.assetClass}</td>
                <td>
                  {asset.latitude != null && asset.longitude != null ? (
                    <a
                      className="print-map-link"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${asset.latitude},${asset.longitude}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {asset.location}
                    </a>
                  ) : (
                    asset.location
                  )}
                </td>
                <td>{asset.maintenance}</td>
                <td>{currency.format(asset.bookValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="print-empty">Tidak ada aset yang sesuai dengan filter.</p>}
        <footer className="print-report-footnote">generated by xasset</footer>
      </section>
      {editingAssetId &&
        (() => {
          const asset = assets.find((item) => item.id === editingAssetId);
          return asset ? (
            <AssetEditModal
              asset={asset as Asset & Record<string, unknown>}
              onClose={() => setEditingAssetId(null)}
              onSaved={(updated) => {
                setAssets((current) =>
                  current.map((item) =>
                    item.id === updated.id
                      ? {
                          ...item,
                          assetNumber: String(updated.assetNumber),
                          capitalizedOn: updated.capitalizedOn ? String(updated.capitalizedOn) : "",
                          assetCode: String(updated.assetCode),
                          description: String(updated.description),
                          acquisitionValue: Number(updated.acquisitionValue),
                          bookValue: Number(updated.bookValue),
                          quantity: Number(updated.quantity),
                          documentationNote:
                            updated.documentationNote == null ? null : String(updated.documentationNote),
                          layout: String(updated.layout ?? "Belum dipetakan"),
                          coordinateText: updated.coordinateText == null ? null : String(updated.coordinateText),
                          maintenance: updated.maintenance as Asset["maintenance"],
                          version: Number(updated.version),
                        }
                      : item,
                  ),
                );
                setEditingAssetId(null);
              }}
            />
          ) : null;
        })()}
    </main>
  );
}
