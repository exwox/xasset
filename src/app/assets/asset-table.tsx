"use client";
import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { ASSET_STATUSES } from "@/lib/asset-status";
import { LogoutButton } from "@/components/logout-button";

type Row = Record<string, string | number | null>;
const columns = [
  ["no", "No"],
  ["assetNumber", "No Asset"],
  ["capitalizedOn", "Capitalized on"],
  ["assetCode", "Kode Aset"],
  ["assetClass", "Class Asset"],
  ["description", "Asset description"],
  ["acquisitionValue", "Acquis.val."],
  ["bookValue", "Book val."],
  ["quantity", "Quantity"],
  ["unit", "Base Unit of Measure"],
  ["location", "Location"],
  ["subAsset", "Sub Asset"],
  ["documentationNote", "Dokumentasi"],
  ["layout", "Lokasi / Layout"],
  ["maintenance", "Status Aset"],
  ["usageFrequency", "Frekuensi Pemakaian"],
  ["coordinateText", "Koordinat"],
] as const;
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export function AssetTable({ canWrite, canDeleteAll, canAdmin, siteName }: { canWrite: boolean; canDeleteAll: boolean; canAdmin: boolean; siteName: string }) {
  const [rows, setRows] = useState<Row[]>([]),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [total, setTotal] = useState(0),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [classId, setClassId] = useState(""),
    [assetClasses, setAssetClasses] = useState<Row[]>([]),
    [sort, setSort] = useState("no"),
    [order, setOrder] = useState("asc"),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState<Row | null | undefined>(undefined),
    [message, setMessage] = useState("");
  const [visible, setVisible] = useState(() => new Set(columns.map(([key]) => key)));
  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25", q: search, sort, order });
    if (status) params.set("status", status);
    if (classId) params.set("classId", classId);
    const response = await fetch(`/api/assets?${params}`);
    const body = await response.json();
    setRows(body.data ?? []);
    setPages(body.pagination?.pages ?? 1);
    setTotal(body.pagination?.total ?? 0);
    setLoading(false);
  }, [classId, page, search, sort, order, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void fetch("/api/master-data/classes")
          .then((response) => response.json())
          .then((body) => setAssetClasses(body.data ?? [])),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(q);
  }
  function toggleSort(key: string) {
    if (!["no", "assetNumber", "assetCode", "description", "capitalizedOn", "bookValue", "updatedAt"].includes(key)) return;
    if (sort === key) setOrder(order === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setOrder("asc");
    }
    setPage(1);
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const preview = new FormData();
    preview.set("file", file);
    preview.set("mode", "preview");
    setMessage("Memvalidasi file...");
    const checked = await fetch("/api/assets/import", { method: "POST", body: preview });
    const result = await checked.json();
    if (!checked.ok) {
      setMessage(result.message ?? result.error ?? "File tidak valid");
      return;
    }
    const report = result.report;
    if (report.errors.length || report.duplicateAssetNumbers.length) {
      setMessage(
        `Import dibatalkan: ${report.errors.length} error, ${report.duplicateAssetNumbers.length} No Asset duplikat`,
      );
      return;
    }
    if (!window.confirm(`${report.validRows} baris valid dan ${report.embeddedImages ?? 0} gambar dokumentasi ditemukan. Lanjutkan import?`)) {
      setMessage("Import dibatalkan pengguna");
      return;
    }
    const commit = new FormData();
    commit.set("file", file);
    commit.set("mode", "commit");
    const response = await fetch("/api/assets/import", { method: "POST", body: commit });
    const body = await response.json();
    setMessage(response.ok ? `${body.imported} aset dan ${body.importedImages ?? 0} foto berhasil diimpor` : (body.error ?? "Import gagal"));
    event.target.value = "";
    if (response.ok) await load();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
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
      ...(editing?.id ? { version: Number(editing.version) } : {}),
    };
    const response = await fetch(editing?.id ? `/api/assets/${editing.id}` : "/api/assets", {
      method: editing?.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Gagal menyimpan aset");
      return;
    }
    setMessage("Aset berhasil disimpan");
    setEditing(undefined);
    await load();
  }
  async function deleteAllAssets() {
    const confirmation = window.prompt(
      "Semua aset akan diarsipkan dan hilang dari dashboard. Ketik HAPUS SEMUA untuk melanjutkan.",
    );
    if (confirmation !== "HAPUS SEMUA") {
      if (confirmation !== null) setMessage("Konfirmasi tidak sesuai. Penghapusan dibatalkan.");
      return;
    }
    const response = await fetch("/api/assets/archive-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Gagal menghapus semua aset");
      return;
    }
    setMessage(`${body.archived} aset diarsipkan. Data masih dapat dipulihkan dari database.`);
    setPage(1);
    await load();
  }
  return (
    <main className="asset-admin">
      <header className="admin-top">
        <Link href="/" className="brand admin-brand">
          <span className="brand-mark">X</span>
          <div>
            <strong>XASSET</strong>
            <small>ASSET REGISTER</small>
          </div>
        </Link>
        <div>
          <span className="admin-kicker">MASTER DATA</span>
          <h1>Daftar Aset {siteName}</h1>
        </div>
        <nav className="admin-header-actions">
          {canAdmin && <Link href="/admin">Admin</Link>}
          <Link href="/" className="outline back-map">← Kembali ke peta</Link>
          <LogoutButton />
        </nav>
      </header>
      <section className="admin-tools">
        <form onSubmit={submitSearch} className="admin-search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari No, No Asset, kode, class, deskripsi, lokasi..."
          />
          <button>Cari</button>
        </form>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua status aset</option>
          {ASSET_STATUSES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="Filter class asset"
          value={classId}
          onChange={(event) => {
            setClassId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua class asset</option>
          {assetClasses.map((item) => (
            <option key={String(item.id)} value={String(item.id)}>
              {String(item.name)}
            </option>
          ))}
        </select>
        <details className="column-picker">
          <summary>Kolom</summary>
          <div>
            {columns.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={visible.has(key)}
                  onChange={() =>
                    setVisible((current) => {
                      const next = new Set(current);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </details>
        {canWrite && (
          <label className="outline import-label">
            Import XLSX
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={importFile}
            />
          </label>
        )}
        {canWrite && (
          <button className="primary add-asset" onClick={() => setEditing(null)}>
            ＋ Tambah aset
          </button>
        )}
        {canDeleteAll && (
          <button className="delete-all-assets" onClick={deleteAllAssets}>
            Hapus Semua Aset
          </button>
        )}
      </section>
      {message && (
        <div className="admin-message">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}
      <section className="table-wrap">
        <table>
          <caption className="sr-only">Daftar aset perusahaan</caption>
          <thead>
            <tr>
              {columns
                .filter(([key]) => visible.has(key))
                .map(([key, label]) => (
                  <th key={key} onClick={() => toggleSort(key)}>
                    {label}
                    {sort === key ? (order === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                ))}
              {canWrite && <th>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (canWrite ? 1 : 0)}>Memuat data...</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={String(row.id)}>
                  {columns
                    .filter(([key]) => visible.has(key))
                    .map(([key]) => (
                      <td key={key}>
                        {key === "assetNumber" ? (
                          <Link className="asset-number-link" href={`/assets/${row.id}`}>
                            {String(row[key])}
                          </Link>
                        ) : key === "acquisitionValue" || key === "bookValue" ? (
                          money.format(Number(row[key] ?? 0))
                        ) : key === "capitalizedOn" && row[key] ? (
                          new Date(String(row[key])).toLocaleDateString("id-ID")
                        ) : (
                          String(row[key] ?? "—")
                        )}
                      </td>
                    ))}
                  {canWrite && (
                    <td>
                      <button className="table-action" onClick={() => setEditing(row)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <footer className="admin-pagination">
        <span>
          {total} aset · Halaman {page} dari {pages}
        </span>
        <div>
          <Link className="xlsx-link" href="/api/assets/import/template">
            Template XLSX + Panduan Foto
          </Link>
          <a
            className="xlsx-link"
            href={`/api/assets/export/xlsx?q=${encodeURIComponent(search)}${status ? `&status=${encodeURIComponent(status)}` : ""}${classId ? `&classId=${encodeURIComponent(classId)}` : ""}`}
          >
            Export XLSX + Foto
          </a>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Sebelumnya
          </button>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Berikutnya
          </button>
        </div>
      </footer>
      {editing !== undefined && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(undefined)}>
          <form className="asset-form" onSubmit={save} onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <div>
                <span className="admin-kicker">{editing?.id ? "EDIT ASSET" : "NEW ASSET"}</span>
                <h2>{editing?.id ? String(editing.description) : "Tambah aset"}</h2>
              </div>
              <button type="button" onClick={() => setEditing(undefined)}>
                ×
              </button>
            </header>
            <div className="form-grid">
              <label>
                No Asset
                <input name="assetNumber" required defaultValue={String(editing?.assetNumber ?? "")} />
              </label>
              <label>
                Capitalized on
                <input
                  name="capitalizedOn"
                  type="date"
                  defaultValue={
                    editing?.capitalizedOn ? new Date(String(editing.capitalizedOn)).toISOString().slice(0, 10) : ""
                  }
                />
              </label>
              <label>
                Kode Aset
                <input name="assetCode" required defaultValue={String(editing?.assetCode ?? "")} />
              </label>
              <label className="wide">
                Asset description
                <textarea name="description" required defaultValue={String(editing?.description ?? "")} />
              </label>
              <label>
                Acquisition Value
                <input
                  name="acquisitionValue"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={Number(editing?.acquisitionValue ?? 0)}
                />
              </label>
              <label>
                Book Value
                <input
                  name="bookValue"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={Number(editing?.bookValue ?? 0)}
                />
              </label>
              <label>
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min="0"
                  step="0.0001"
                  required
                  defaultValue={Number(editing?.quantity ?? 1)}
                />
              </label>
              <label>
                Status Aset
                <select name="maintenanceStatus" defaultValue={String(editing?.maintenance ?? "Active")}>
                  {ASSET_STATUSES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Dokumentasi
                <textarea name="documentationNote" defaultValue={String(editing?.documentationNote ?? "")} />
              </label>
              <label>
                Lokasi / Layout
                <input name="layoutLocation" defaultValue={String(editing?.layout ?? "")} />
              </label>
              <label className="wide">
                Koordinat
                <input name="coordinateText" defaultValue={String(editing?.coordinateText ?? "")} placeholder="Contoh: -0.9227, 104.5323" />
              </label>
            </div>
            <footer>
              <button type="button" className="outline" onClick={() => setEditing(undefined)}>
                Batal
              </button>
              <button className="primary">Simpan aset</button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
