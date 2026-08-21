"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { useRouter } from "next/navigation";
import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { assetStatusClass, type AssetStatus } from "@/lib/asset-status";
type Item = Record<string, unknown>;
interface Document {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  documentType?: string;
  description?: string;
  expiresOn?: string | null;
  createdAt: string;
}
interface History {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  before?: Item;
  after?: Item;
}
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
export function AssetDetail({
  initialAsset: asset,
  canWrite,
  canUploadDocument,
  canDownloadDocument,
  canDeleteDocument,
}: {
  initialAsset: Item;
  canWrite: boolean;
  canUploadDocument: boolean;
  canDownloadDocument: boolean;
  canDeleteDocument: boolean;
}) {
  const router = useRouter();
  const id = String(asset.id),
    [documents, setDocuments] = useState<Document[]>([]),
    [history, setHistory] = useState<History[]>([]),
    [documentType, setDocumentType] = useState("other"),
    [uploading, setUploading] = useState(false),
    [message, setMessage] = useState(""),
    [assetVersion, setAssetVersion] = useState(Number(asset.version)),
    [positionRemoved, setPositionRemoved] = useState(false),
    [polygonRemoved, setPolygonRemoved] = useState(false);
  const load = useCallback(async () => {
    const [docs, events] = await Promise.all([
      fetch(`/api/assets/${id}/documents`).then((r) => r.json()),
      fetch(`/api/assets/${id}/history`).then((r) => r.json()),
    ]);
    setDocuments(docs.data ?? []);
    setHistory(events.data ?? []);
  }, [id]);
  useEffect(() => {
    // Fetch state is updated asynchronously after the external API responds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function uploadFile(file: File, category: string) {
    setUploading(true);
    setMessage("");
    const init = await fetch(`/api/assets/${id}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        documentType: category,
      }),
    });
    const initBody = await init.json();
    if (!init.ok) {
      setMessage(initBody.error ?? "File tidak didukung");
      setUploading(false);
      return;
    }
    const put = await fetch(initBody.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
    if (!put.ok) {
      setMessage("Upload ke object storage gagal");
      setUploading(false);
      return;
    }
    const confirm = await fetch(`/api/assets/${id}/documents/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objectKey: initBody.objectKey,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        documentType: category,
      }),
    });
    setUploading(false);
    if (!confirm.ok) {
      setMessage("Konfirmasi dokumentasi gagal");
      return;
    }
    setMessage("Dokumentasi berhasil diunggah");
    await load();
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await uploadFile(file, documentType);
  }
  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Foto harus berformat JPG, PNG, atau WebP.");
      return;
    }
    await uploadFile(file, "photo");
  }
  async function openDocument(documentId: string) {
    if (!canDownloadDocument) return;
    const result = await fetch(`/api/assets/${id}/documents/${documentId}`).then((r) => r.json());
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }
  async function archiveDocument(documentId: string) {
    if (!window.confirm("Arsipkan dokumentasi ini? Object tetap disimpan untuk recovery.")) return;
    const response = await fetch(`/api/assets/${id}/documents/${documentId}`, { method: "DELETE" });
    setMessage(response.ok ? "Dokumentasi diarsipkan." : (await response.json()).error);
    if (response.ok) await load();
  }
  async function clearGeometry(kind: "position" | "polygon") {
    const label = kind === "position" ? "posisi" : "polygon";
    if (!window.confirm(`Hapus ${label} aset ini?`)) return;
    const changes = kind === "position"
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
    const response = await fetch(`/api/assets/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...changes, version: assetVersion }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(
        body.error === "VERSION_CONFLICT" ? "Data aset berubah. Muat ulang halaman." : `${label} aset gagal dihapus.`,
      );
      return;
    }
    setAssetVersion(Number(body.data.version));
    if (kind === "position") setPositionRemoved(true);
    else setPolygonRemoved(true);
    setMessage(`${label[0].toUpperCase()}${label.slice(1)} aset berhasil dihapus.`);
    router.refresh();
  }
  const hasPosition = !positionRemoved && (
    (asset.longitude != null && asset.latitude != null) || (asset.localX != null && asset.localY != null)
  );
  const hasPolygon = !polygonRemoved && Array.isArray(asset.polygon) && asset.polygon.length >= 3;
  const latestPhoto = documents.find(
    (document) => document.documentType === "photo" && document.contentType.startsWith("image/"),
  );
  return (
    <main className="detail-page">
      <header className="detail-nav">
        <Link href="/assets">← Daftar aset</Link>
        <div className="detail-map-links">
          <Link href={`/?asset=${id}`}>Lihat di peta</Link>
          {canWrite && <div className="detail-map-action">
            <Link href={`/?position=${id}`}>{hasPosition ? "Ubah posisi" : "Tentukan posisi"}</Link>
            {hasPosition && <button type="button" onClick={() => clearGeometry("position")}>Hapus posisi</button>}
          </div>}
          {canWrite && <div className="detail-map-action">
            <Link href={`/?polygon=${id}`}>{hasPolygon ? "Ubah polygon" : "Gambar polygon"}</Link>
            {hasPolygon && <button type="button" onClick={() => clearGeometry("polygon")}>Hapus polygon</button>}
          </div>}
          <LogoutButton />
        </div>
      </header>
      <section className="detail-title">
        <div>
          <span className="admin-kicker">No. {String(asset.no)} · No Asset {String(asset.assetNumber)}</span>
          <h1>{String(asset.description)}</h1>
          <p>
            {String(asset.assetCode)} · {String(asset.assetClass ?? "Belum diklasifikasi")}
          </p>
        </div>
        <div className="asset-photo-control">
          {latestPhoto ? (
            <img src={`/api/assets/${id}/photo?v=${latestPhoto.id}`} alt={`Foto ${String(asset.description)}`} />
          ) : (
            <div className="asset-photo-empty">Belum ada foto</div>
          )}
          {canUploadDocument && (
            <label className="upload-button asset-photo-upload">
              {uploading ? "Mengunggah..." : latestPhoto ? "Ganti foto" : "＋ Upload foto"}
              <input
                type="file"
                disabled={uploading}
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                onChange={uploadPhoto}
              />
            </label>
          )}
          <span className={`badge ${assetStatusClass(String(asset.maintenance) as AssetStatus)}`}>
            {String(asset.maintenance)}
          </span>
        </div>
      </section>
      <div className="detail-columns">
        <section className="detail-card">
          <header>
            <h2>Informasi aset</h2>
          </header>
          <dl>
            {[
              [
                "Capitalized on",
                asset.capitalizedOn ? new Date(String(asset.capitalizedOn)).toLocaleDateString("id-ID") : "—",
              ],
              ["Acquisition Value", money.format(Number(asset.acquisitionValue))],
              ["Book Value", money.format(Number(asset.bookValue))],
              ["Quantity", `${asset.quantity} ${asset.unit ?? ""}`],
              ["Location", asset.location ?? "—"],
              ["Sub Asset", asset.subAsset ?? asset.parentAssetNumber ?? "—"],
              ["Frekuensi Pemakaian", asset.usageFrequency ?? "—"],
              ["Lokasi / Layout", asset.layout ?? asset.layoutReference ?? "Belum dipetakan"],
              ["Koordinat", asset.coordinateText ?? "—"],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt>{String(label)}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="detail-card">
          <header>
            <h2>Dokumentasi</h2>
            {canUploadDocument && (
              <label className="upload-button">
                {uploading ? "Mengunggah..." : "＋ Upload"}
                <input
                  type="file"
                  disabled={uploading}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx,.docx"
                  onChange={upload}
                />
              </label>
            )}
          </header>
          {message && <p className="detail-message">{message}</p>}
          {canUploadDocument && (
            <label className="document-type">
              Kategori
              <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
                <option value="photo">Foto</option>
                <option value="invoice">Invoice</option>
                <option value="manual">Manual</option>
                <option value="certificate">Sertifikat</option>
                <option value="inspection">Dokumen inspeksi</option>
                <option value="other">Lainnya</option>
              </select>
            </label>
          )}
          <div className="document-list">
            {documents.length === 0 ? (
              <p>Belum ada dokumentasi.</p>
            ) : (
              documents.map((document) => (
                <div className="document-row" key={document.id}>
                  <button disabled={!canDownloadDocument} onClick={() => openDocument(document.id)}>
                    <span>▤</span>
                    <div>
                      <strong>{document.fileName}</strong>
                      <small>
                        {document.documentType ?? "other"} · {(document.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                        {new Date(document.createdAt).toLocaleDateString("id-ID")}
                      </small>
                    </div>
                    <i>↗</i>
                  </button>
                  {canDeleteDocument && (
                    <button className="document-delete" onClick={() => void archiveDocument(document.id)}>
                      Arsipkan
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
        <section className="detail-card history-card">
          <header>
            <h2>Histori perubahan</h2>
          </header>
          <div className="history-list">
            {history.length === 0 ? (
              <p>Belum ada perubahan individual yang tercatat.</p>
            ) : (
              history.map((event) => (
                <article key={event.id}>
                  <i />
                  <div>
                    <strong>{event.action.replaceAll(".", " · ")}</strong>
                    <p>{event.actor}</p>
                    <small>{new Date(event.createdAt).toLocaleString("id-ID")}</small>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
