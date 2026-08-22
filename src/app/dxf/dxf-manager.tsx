"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { useCallback, useEffect, useMemo, useState, type SetStateAction } from "react";
import { localToWorld } from "@/lib/coordinates";
import { decodeDxfSegments } from "@/lib/dxf-processing";
import type { Calibration, DxfSegment, DxfTransform } from "@/lib/types";
import { GeorefMap } from "./georef-map";

interface Layer {
  name: string;
  color: string | null;
  entityCount: number;
  visible: boolean;
  opacity: string;
  sortOrder: number;
}

interface Version {
  id: string;
  versionNumber: number;
  fileName: string;
  sizeBytes: string;
  unit: string | null;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  transform: DxfTransform | null;
  entityCount: number | null;
  supportedEntityCount: number | null;
  layerCount: number | null;
  status: string;
  progress: number;
  residualErrorMeters: string | null;
  errorMessage: string | null;
  changeNote: string | null;
  previewUrl: string | null;
  layers: Layer[];
}

interface DocumentSummary {
  id: string;
  name: string;
  status: string;
  activeVersionId: string | null;
  activeVersionNumber: number | null;
  entityCount: number | null;
}

interface DocumentDetail extends DocumentSummary {
  versions: Version[];
}

const DEFAULT_MAP_ORIGIN = { longitude: 104.5323, latitude: 0.9227 };

function unitScale(unit: string | null) {
  return { millimeter: 0.001, centimeter: 0.01, meter: 1, inch: 0.0254, foot: 0.3048 }[unit ?? ""] ?? 1;
}

function manualTransformForVersion(version?: Version): Calibration {
  const localOrigin = version?.bounds
    ? { x: (version.bounds.minX + version.bounds.maxX) / 2, y: (version.bounds.minY + version.bounds.maxY) / 2 }
    : { x: 0, y: 0 };
  if (version?.transform && "origin" in version.transform) return version.transform;
  if (version?.transform && "matrix" in version.transform) {
    const [[a], [c]] = version.transform.matrix;
    return {
      origin: localToWorld(localOrigin, version.transform),
      localOrigin,
      metersPerUnit: Math.max(1e-9, Math.hypot(a, c)),
      rotationDegrees: (Math.atan2(c, a) * 180) / Math.PI,
    };
  }
  return {
    origin: DEFAULT_MAP_ORIGIN,
    localOrigin,
    metersPerUnit: unitScale(version?.unit ?? null),
    rotationDegrees: 0,
  };
}

export function DxfManager({ canWrite, canPublish, canAdmin }: { canWrite: boolean; canPublish: boolean; canAdmin: boolean }) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [message, setMessage] = useState("Siap");
  const [busy, setBusy] = useState(false);
  const [manualDraft, setManualDraft] = useState<{ versionId: string; transform: Calibration } | null>(null);
  const [renderDraft, setRenderDraft] = useState<{ versionId: string; segments: DxfSegment[] } | null>(null);
  const selectedVersion = useMemo(
    () => detail?.versions.find((version) => version.id === selectedVersionId) ?? detail?.versions[0],
    [detail, selectedVersionId],
  );
  const baseManualTransform = useMemo(() => manualTransformForVersion(selectedVersion), [selectedVersion]);
  const manualTransform =
    manualDraft && manualDraft.versionId === selectedVersion?.id ? manualDraft.transform : baseManualTransform;
  const renderSegments = renderDraft && renderDraft.versionId === selectedVersion?.id ? renderDraft.segments : [];

  function setManualTransform(update: SetStateAction<Calibration>) {
    if (!selectedVersion) return;
    setManualDraft((current) => {
      const base = current?.versionId === selectedVersion.id ? current.transform : baseManualTransform;
      return {
        versionId: selectedVersion.id,
        transform: typeof update === "function" ? update(base) : update,
      };
    });
  }

  const loadDocuments = useCallback(async () => {
    const response = await fetch("/api/dxf-documents", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    setDocuments(result.data);
    setSelectedId((current) =>
      result.data.some((document: DocumentSummary) => document.id === current)
        ? current
        : (result.data[0]?.id ?? null),
    );
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/dxf-documents/${id}`, { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    setDetail(result.data);
    setSelectedVersionId((current) =>
      result.data.versions.some((version: Version) => version.id === current)
        ? current
        : (result.data.versions[0]?.id ?? null),
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDocuments(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => void loadDetail(selectedId), 0);
    return () => window.clearTimeout(timer);
  }, [selectedId, loadDetail]);
  useEffect(() => {
    if (!detail?.versions.some((version) => ["queued", "processing"].includes(version.status))) return;
    const timer = window.setInterval(() => {
      if (selectedId) void loadDetail(selectedId);
      void loadDocuments();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [detail, loadDetail, loadDocuments, selectedId]);
  useEffect(() => {
    if (!detail || !selectedVersion || !["ready", "published"].includes(selectedVersion.status)) return;
    const controller = new AbortController();
    void fetch(`/api/dxf-documents/${detail.id}/versions/${selectedVersion.id}/render`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Render DXF belum tersedia");
        return response.json();
      })
      .then((render) => setRenderDraft({ versionId: selectedVersion.id, segments: decodeDxfSegments(render) }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError")
          setRenderDraft({ versionId: selectedVersion.id, segments: [] });
      });
    return () => controller.abort();
  }, [detail, selectedVersion]);

  async function upload(file: File, asNewVersion: boolean) {
    setBusy(true);
    try {
      const contentType = ["application/dxf", "application/x-dxf", "image/vnd.dxf"].includes(file.type)
        ? file.type
        : "application/octet-stream";
      setMessage("Membuat versi immutable...");
      const created = await fetch("/api/dxf-documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: asNewVersion ? selectedId : undefined,
          name: asNewVersion && detail ? detail.name : file.name.replace(/\.dxf$/i, ""),
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
          changeNote: asNewVersion ? "Versi baru dari halaman DXF" : "Versi awal",
        }),
      });
      const createdBody = await created.json();
      if (!created.ok) throw new Error(createdBody.error ?? "Gagal membuat dokumen");
      setMessage(`Mengunggah ${(file.size / 1024 / 1024).toFixed(1)} MB ke object storage...`);
      const uploaded = await fetch(createdBody.data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: file,
      });
      if (!uploaded.ok) throw new Error(`Upload gagal (${uploaded.status})`);
      setMessage("Menjadwalkan parsing DXF...");
      const confirmed = await fetch(
        `/api/dxf-documents/${createdBody.data.documentId}/versions/${createdBody.data.versionId}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ objectKey: createdBody.data.objectKey }),
        },
      );
      if (!confirmed.ok) throw new Error((await confirmed.json()).error ?? "Konfirmasi gagal");
      setSelectedId(createdBody.data.documentId);
      setSelectedVersionId(createdBody.data.versionId);
      setMessage("File masuk antrean. Progress diperbarui otomatis.");
      await loadDocuments();
      await loadDetail(createdBody.data.documentId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload gagal");
    } finally {
      setBusy(false);
    }
  }

  async function saveManualGeoreference() {
    if (!detail || !selectedVersion) return;
    setBusy(true);
    const response = await fetch(`/api/dxf-documents/${detail.id}/versions/${selectedVersion.id}/georeference`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "manual", transform: manualTransform }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(result.message ?? result.error);
    setMessage("Penyesuaian visual DXF tersimpan. Gunakan control point jika diperlukan akurasi survei.");
    await loadDetail(detail.id);
    setManualDraft(null);
  }

  function nudgeManualTransform(eastMeters: number, northMeters: number) {
    setManualTransform((current) => {
      const longitudeScale = 111_320 * Math.cos((current.origin.latitude * Math.PI) / 180);
      return {
        ...current,
        origin: {
          longitude: current.origin.longitude + eastMeters / longitudeScale,
          latitude: current.origin.latitude + northMeters / 111_320,
        },
      };
    });
  }

  async function publish(versionId: string) {
    if (!detail) return;
    setBusy(true);
    const response = await fetch(`/api/dxf-documents/${detail.id}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    const result = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Versi aktif berhasil diterbitkan." : result.error);
    await loadDocuments();
    await loadDetail(detail.id);
  }

  async function downloadSource(versionId: string) {
    if (!detail) return;
    const response = await fetch(`/api/dxf-documents/${detail.id}/versions/${versionId}`);
    const result = await response.json();
    if (!response.ok) return setMessage(result.error);
    window.location.assign(result.data.sourceUrl);
  }

  async function archiveVersion(versionId: string) {
    if (!detail || !window.confirm("Arsipkan versi DXF ini? File asli tetap disimpan.")) return;
    const response = await fetch(`/api/dxf-documents/${detail.id}/versions/${versionId}`, { method: "DELETE" });
    const result = await response.json();
    setMessage(response.ok ? "Versi diarsipkan tanpa menghapus file asli." : result.error);
    await loadDetail(detail.id);
  }

  async function deleteDocument() {
    if (
      !detail ||
      !window.confirm(
        `Hapus DXF "${detail.name}" dari aplikasi dan peta? File sumber tetap disimpan untuk audit.`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(`/api/dxf-documents/${detail.id}/archive`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "DXF gagal dihapus");
      setMessage(`DXF "${detail.name}" telah dihapus dari aplikasi dan peta.`);
      setDetail(null);
      setSelectedId(null);
      setSelectedVersionId(null);
      await loadDocuments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "DXF gagal dihapus");
    } finally {
      setBusy(false);
    }
  }

  async function updateLayers(
    layers: Array<{
      name: string;
      visible?: boolean;
      color?: string | null;
      opacity?: number;
      sortOrder?: number;
    }>,
  ) {
    if (!detail || !selectedVersion) return;
    await fetch(`/api/dxf-documents/${detail.id}/versions/${selectedVersion.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layers }),
    });
    await loadDetail(detail.id);
  }

  async function moveLayer(layer: Layer, direction: -1 | 1) {
    if (!selectedVersion) return;
    const index = selectedVersion.layers.findIndex((item) => item.name === layer.name);
    const other = selectedVersion.layers[index + direction];
    if (!other) return;
    await updateLayers([
      { name: layer.name, sortOrder: other.sortOrder },
      { name: other.name, sortOrder: layer.sortOrder },
    ]);
  }

  return (
    <main className="dxf-shell">
      <header className="dxf-header">
        <div>
          <small>XASSET · PHASE 4–5</small>
          <h1>DXF Overlay & Georeferencing</h1>
        </div>
        <nav>
          <Link href="/">Peta aset</Link>
          <Link href="/assets">Data aset</Link>
          {canAdmin && <Link href="/admin">Admin</Link>}
          <LogoutButton />
        </nav>
      </header>
      <section className="dxf-status">{message}</section>
      <section className="dxf-grid">
        <aside className="dxf-documents">
          <h2>Dokumen</h2>
          {canWrite && (
            <label className={`dxf-upload ${busy ? "disabled" : ""}`}>
              ＋ Dokumen DXF baru
              <input
                type="file"
                accept=".dxf"
                disabled={busy}
                onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0], false)}
              />
            </label>
          )}
          {documents.map((document) => (
            <button
              key={document.id}
              className={selectedId === document.id ? "selected" : ""}
              onClick={() => setSelectedId(document.id)}
            >
              <strong>{document.name}</strong>
              <span>
                {document.status} · v{document.activeVersionNumber ?? "—"}
              </span>
            </button>
          ))}
          {!documents.length && <p>Belum ada dokumen DXF.</p>}
        </aside>
        <section className="dxf-main">
          {!detail ? (
            <div className="dxf-empty">Pilih atau unggah dokumen DXF.</div>
          ) : (
            <>
              <div className="dxf-title-row">
                <div>
                  <small>{detail.status.toUpperCase()}</small>
                  <h2>{detail.name}</h2>
                </div>
                <div className="dxf-document-actions">
                  {canWrite && (
                    <label className="dxf-upload secondary">
                      Unggah versi baru
                      <input
                        type="file"
                        accept=".dxf"
                        disabled={busy}
                        onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0], true)}
                      />
                    </label>
                  )}
                  {canPublish && (
                    <button className="dxf-delete" disabled={busy} onClick={() => void deleteDocument()}>
                      Hapus DXF
                    </button>
                  )}
                </div>
              </div>
              <div className="version-tabs">
                {detail.versions.map((version) => (
                  <button
                    key={version.id}
                    className={selectedVersion?.id === version.id ? "active" : ""}
                    onClick={() => setSelectedVersionId(version.id)}
                  >
                    v{version.versionNumber} · {version.status}
                  </button>
                ))}
              </div>
              {selectedVersion && (
                <div className="dxf-version-grid">
                  <section className="dxf-preview-card">
                    {selectedVersion.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedVersion.previewUrl}
                        alt={`Preview ${selectedVersion.fileName}`}
                      />
                    ) : (
                      <div className="dxf-progress">
                        <strong>{selectedVersion.progress}%</strong>
                        <progress value={selectedVersion.progress} max="100" />
                        <span>{selectedVersion.errorMessage ?? selectedVersion.status}</span>
                      </div>
                    )}
                    <dl className="dxf-metadata">
                      <div>
                        <dt>File</dt>
                        <dd>{selectedVersion.fileName}</dd>
                      </div>
                      <div>
                        <dt>Ukuran</dt>
                        <dd>{(Number(selectedVersion.sizeBytes) / 1024 / 1024).toFixed(1)} MB</dd>
                      </div>
                      <div>
                        <dt>Entity</dt>
                        <dd>{selectedVersion.entityCount?.toLocaleString("id-ID") ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Didukung</dt>
                        <dd>{selectedVersion.supportedEntityCount?.toLocaleString("id-ID") ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Layer</dt>
                        <dd>{selectedVersion.layerCount ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Unit</dt>
                        <dd>{selectedVersion.unit ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Residual</dt>
                        <dd>
                          {selectedVersion.residualErrorMeters
                            ? `${Number(selectedVersion.residualErrorMeters).toFixed(3)} m`
                            : "Belum dikalibrasi"}
                        </dd>
                      </div>
                    </dl>
                    <div className="version-actions">
                      <button onClick={() => void downloadSource(selectedVersion.id)}>Unduh file asli</button>
                      {canWrite && ["ready", "published"].includes(selectedVersion.status) && (
                        <Link className="editor-link" href={`/dxf/${detail.id}/edit?version=${selectedVersion.id}`}>Edit draft</Link>
                      )}
                      {canPublish &&
                        selectedVersion.transform &&
                        ["ready", "published"].includes(selectedVersion.status) && (
                          <button
                            className="publish-button"
                            disabled={busy || detail.activeVersionId === selectedVersion.id}
                            onClick={() => void publish(selectedVersion.id)}
                          >
                            {detail.activeVersionId === selectedVersion.id ? "Versi aktif" : "Terbitkan / rollback"}
                          </button>
                        )}
                      {canPublish &&
                        detail.activeVersionId !== selectedVersion.id &&
                        selectedVersion.status !== "archived" && (
                          <button onClick={() => void archiveVersion(selectedVersion.id)}>Arsipkan versi</button>
                        )}
                    </div>
                  </section>
                  <section className="georef-card">
                    <h3>Posisi visual DXF</h3>
                    <p>
                      Drag DXF pada peta untuk menggeser. Sesuaikan skala dan rotasi sampai garis tepat menimpa basemap.
                    </p>
                    <GeorefMap
                      key={`${detail.id}:${selectedVersion.id}`}
                      segments={renderSegments}
                      transform={manualTransform}
                      onTransformChange={setManualTransform}
                    />
                    <div className="manual-georef-panel">
                      <div className="manual-transform-fields">
                        <label>
                          Longitude pusat
                          <input
                            type="number"
                            step="any"
                            value={manualTransform.origin.longitude}
                            onChange={(event) => setManualTransform((current) => ({
                              ...current,
                              origin: { ...current.origin, longitude: Number(event.target.value) },
                            }))}
                          />
                        </label>
                        <label>
                          Latitude pusat
                          <input
                            type="number"
                            step="any"
                            value={manualTransform.origin.latitude}
                            onChange={(event) => setManualTransform((current) => ({
                              ...current,
                              origin: { ...current.origin, latitude: Number(event.target.value) },
                            }))}
                          />
                        </label>
                        <label>
                          Skala (meter/unit)
                          <input
                            type="number"
                            min="0.000000001"
                            step="any"
                            value={manualTransform.metersPerUnit}
                            onChange={(event) => setManualTransform((current) => ({
                              ...current,
                              metersPerUnit: Math.max(1e-9, Number(event.target.value)),
                            }))}
                          />
                        </label>
                        <label>
                          Rotasi (derajat)
                          <input
                            type="number"
                            step="0.1"
                            value={manualTransform.rotationDegrees}
                            onChange={(event) => setManualTransform((current) => ({
                              ...current,
                              rotationDegrees: Number(event.target.value),
                            }))}
                          />
                        </label>
                      </div>
                      <div className="manual-transform-tools" aria-label="Kontrol penyesuaian DXF">
                        <button type="button" onClick={() => nudgeManualTransform(0, 1)} title="Geser 1 meter ke utara">↑</button>
                        <button type="button" onClick={() => nudgeManualTransform(-1, 0)} title="Geser 1 meter ke barat">←</button>
                        <button type="button" onClick={() => nudgeManualTransform(1, 0)} title="Geser 1 meter ke timur">→</button>
                        <button type="button" onClick={() => nudgeManualTransform(0, -1)} title="Geser 1 meter ke selatan">↓</button>
                        <button
                          type="button"
                          title="Perkecil skala sekitar 1%"
                          onClick={() => setManualTransform((current) => ({ ...current, metersPerUnit: current.metersPerUnit / 1.01 }))}
                        >
                          − Skala
                        </button>
                        <button
                          type="button"
                          title="Perbesar skala 1%"
                          onClick={() => setManualTransform((current) => ({ ...current, metersPerUnit: current.metersPerUnit * 1.01 }))}
                        >
                          ＋ Skala
                        </button>
                        <button type="button" onClick={() => setManualTransform(manualTransformForVersion(selectedVersion))}>Reset</button>
                      </div>
                      {canWrite && (
                        <button
                          type="button"
                          className="manual-transform-save"
                          disabled={busy || !["ready", "published"].includes(selectedVersion.status)}
                          onClick={() => void saveManualGeoreference()}
                        >
                          Simpan posisi visual
                        </button>
                      )}
                    </div>
                    <h3>Layer</h3>
                    <div className="dxf-layer-list">
                      {selectedVersion.layers.map((layer) => (
                        <div className="dxf-layer-row" key={layer.name}>
                          <input
                            type="checkbox"
                            checked={layer.visible}
                            disabled={!canWrite}
                            onChange={(event) =>
                              void updateLayers([{ name: layer.name, visible: event.target.checked }])
                            }
                          />
                          <input
                            className="layer-color"
                            type="color"
                            value={layer.color ?? "#5eead4"}
                            disabled={!canWrite}
                            onChange={(event) => void updateLayers([{ name: layer.name, color: event.target.value }])}
                          />
                          <span>{layer.name}</span>
                          <input
                            className="layer-opacity"
                            title="Opacity"
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={Number(layer.opacity)}
                            disabled={!canWrite}
                            onChange={(event) =>
                              void updateLayers([{ name: layer.name, opacity: Number(event.target.value) }])
                            }
                          />
                          <small>{layer.entityCount.toLocaleString("id-ID")}</small>
                          <span className="layer-order">
                            <button disabled={!canWrite} onClick={() => void moveLayer(layer, -1)}>
                              ↑
                            </button>
                            <button disabled={!canWrite} onClick={() => void moveLayer(layer, 1)}>
                              ↓
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
