"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  transform: Record<string, unknown> | null;
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

interface PointInput {
  localX: string;
  localY: string;
  longitude: string;
  latitude: string;
}

const emptyPoint = (): PointInput => ({ localX: "", localY: "", longitude: "", latitude: "" });

export function DxfManager({ canWrite, canPublish, canAdmin }: { canWrite: boolean; canPublish: boolean; canAdmin: boolean }) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [message, setMessage] = useState("Siap");
  const [busy, setBusy] = useState(false);
  const [points, setPoints] = useState<PointInput[]>([emptyPoint(), emptyPoint(), emptyPoint()]);
  const [activePoint, setActivePoint] = useState(0);
  const [transformMode, setTransformMode] = useState<"similarity" | "affine">("similarity");
  const selectedVersion = useMemo(
    () => detail?.versions.find((version) => version.id === selectedVersionId) ?? detail?.versions[0],
    [detail, selectedVersionId],
  );

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

  async function saveGeoreference() {
    if (!detail || !selectedVersion) return;
    const controlPoints = points.map((point) => ({
      local: { x: Number(point.localX), y: Number(point.localY) },
      world: { longitude: Number(point.longitude), latitude: Number(point.latitude) },
    }));
    if (points.some((point) => Object.values(point).some((value) => value.trim() === ""))) {
      setMessage("Lengkapi seluruh koordinat control point.");
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/dxf-documents/${detail.id}/versions/${selectedVersion.id}/georeference`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPoints, transformMode, maximumResidualMeters: 5 }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(result.message ?? result.error);
    setMessage(
      result.data.accepted
        ? `Kalibrasi tersimpan. Residual ${result.data.transform.residualErrorMeters.toFixed(3)} m.`
        : `Peringatan: residual ${result.data.transform.residualErrorMeters.toFixed(3)} m melebihi 5 m.`,
    );
    await loadDetail(detail.id);
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

  function pickLocal(event: React.MouseEvent<HTMLImageElement>) {
    if (!selectedVersion?.bounds) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const bounds = selectedVersion.bounds;
    const drawingWidth = Math.max(1, bounds.maxX - bounds.minX);
    const drawingHeight = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(rect.width / drawingWidth, rect.height / drawingHeight);
    const offsetX = (rect.width - drawingWidth * scale) / 2;
    const offsetY = (rect.height - drawingHeight * scale) / 2;
    const x = bounds.minX + (event.clientX - rect.left - offsetX) / scale;
    const y = bounds.maxY - (event.clientY - rect.top - offsetY) / scale;
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return;
    setPoints((current) =>
      current.map((point, index) =>
        index === activePoint ? { ...point, localX: x.toFixed(4), localY: y.toFixed(4) } : point,
      ),
    );
    setMessage(`Koordinat lokal CP ${activePoint + 1} diambil dari preview.`);
  }

  function pickWorld(point: { longitude: number; latitude: number }) {
    setPoints((current) =>
      current.map((item, index) =>
        index === activePoint
          ? { ...item, longitude: point.longitude.toFixed(7), latitude: point.latitude.toFixed(7) }
          : item,
      ),
    );
    setMessage(`Koordinat peta CP ${activePoint + 1} dipilih.`);
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
                        onClick={pickLocal}
                        title={`Klik untuk mengisi koordinat lokal CP ${activePoint + 1}`}
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
                    <h3>Control point</h3>
                    <p>
                      Pilih CP aktif, klik titik yang sama pada preview DXF dan peta. Gunakan minimal tiga titik hasil
                      survei untuk validasi residual.
                    </p>
                    <GeorefMap onPick={pickWorld} />
                    <label className="transform-mode">
                      Model transformasi
                      <select
                        value={transformMode}
                        onChange={(event) => setTransformMode(event.target.value as "similarity" | "affine")}
                      >
                        <option value="similarity">Similarity — translasi, rotasi, skala seragam</option>
                        <option value="affine">Affine — skala non-uniform dan shear</option>
                      </select>
                    </label>
                    {points.map((point, index) => (
                      <div
                        className={`control-point ${activePoint === index ? "active" : ""}`}
                        key={index}
                        onClick={() => setActivePoint(index)}
                      >
                        <b>CP {index + 1}</b>
                        {(["localX", "localY", "longitude", "latitude"] as const).map((field) => (
                          <label key={field}>
                            {field}
                            <input
                              type="number"
                              step="any"
                              value={point[field]}
                              onChange={(event) =>
                                setPoints((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, [field]: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    ))}
                    {canWrite && (
                      <div className="georef-actions">
                        <button onClick={() => setPoints((current) => [...current, emptyPoint()])}>＋ Point</button>
                        <button
                          className="primary"
                          disabled={busy || !["ready", "published"].includes(selectedVersion.status)}
                          onClick={() => void saveGeoreference()}
                        >
                          Hitung & simpan transformasi
                        </button>
                      </div>
                    )}
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
