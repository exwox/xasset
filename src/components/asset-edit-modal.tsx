"use client";

import { FormEvent, useState } from "react";
import { ASSET_STATUSES } from "@/lib/asset-status";

type EditableAsset = Record<string, unknown> & { id: string; version?: number };

export function AssetEditModal({
  asset,
  onClose,
  onSaved,
}: {
  asset: EditableAsset;
  onClose: () => void;
  onSaved: (asset: EditableAsset) => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    const response = await fetch(`/api/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetNumber: String(form.get("assetNumber")),
        capitalizedOn: String(form.get("capitalizedOn")) || null,
        assetCode: String(form.get("assetCode")),
        description: String(form.get("description")),
        acquisitionValue: Number(form.get("acquisitionValue")),
        bookValue: Number(form.get("bookValue")),
        quantity: Number(form.get("quantity")),
        currencyCode: "IDR",
        documentationNote: String(form.get("documentationNote")) || null,
        layoutLocation: String(form.get("layoutLocation")) || null,
        coordinateText: String(form.get("coordinateText")) || null,
        maintenanceStatus: String(form.get("maintenanceStatus")),
        version: Number(asset.version),
      }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(body.error === "VERSION_CONFLICT" ? "Data aset berubah. Muat ulang halaman." : (body.error ?? "Gagal menyimpan aset."));
      return;
    }
    onSaved(body.data as EditableAsset);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="asset-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-edit-asset-title"
        onSubmit={save}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="admin-kicker">EDIT ASSET</span>
            <h2 id="dashboard-edit-asset-title">{String(asset.description)}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup edit asset">×</button>
        </header>
        <div className="form-grid">
          {error && <p className="form-error wide" role="alert">{error}</p>}
          <label>
            No Asset
            <input name="assetNumber" required defaultValue={String(asset.assetNumber ?? "")} />
          </label>
          <label>
            Capitalized on
            <input
              name="capitalizedOn"
              type="date"
              defaultValue={asset.capitalizedOn ? new Date(String(asset.capitalizedOn)).toISOString().slice(0, 10) : ""}
            />
          </label>
          <label>
            Kode Aset
            <input name="assetCode" required defaultValue={String(asset.assetCode ?? "")} />
          </label>
          <label>
            Status Aset
            <select name="maintenanceStatus" defaultValue={String(asset.maintenance ?? "Active")}>
              {ASSET_STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label className="wide">
            Asset description
            <textarea name="description" required defaultValue={String(asset.description ?? "")} />
          </label>
          <label>
            Acquisition Value
            <input name="acquisitionValue" type="number" min="0" step="0.01" required defaultValue={Number(asset.acquisitionValue ?? 0)} />
          </label>
          <label>
            Book Value
            <input name="bookValue" type="number" min="0" step="0.01" required defaultValue={Number(asset.bookValue ?? 0)} />
          </label>
          <label>
            Quantity
            <input name="quantity" type="number" min="0" step="0.0001" required defaultValue={Number(asset.quantity ?? 1)} />
          </label>
          <label>
            Lokasi / Layout
            <input name="layoutLocation" defaultValue={String(asset.layout ?? "")} />
          </label>
          <label className="wide">
            Dokumentasi
            <textarea name="documentationNote" defaultValue={String(asset.documentationNote ?? "")} />
          </label>
          <label className="wide">
            Koordinat
            <input name="coordinateText" defaultValue={String(asset.coordinateText ?? "")} placeholder="Contoh: -0.9227, 104.5323" />
          </label>
        </div>
        <footer>
          <button type="button" className="outline" onClick={onClose}>Batal</button>
          <button className="primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan aset"}</button>
        </footer>
      </form>
    </div>
  );
}
