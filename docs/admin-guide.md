# Panduan Administrator XAsset

## Akses

- Viewer: baca aset/DXF/maintenance dan download dokumen.
- Operator: kelola aset, maintenance, dan dokumentasi.
- DXF Editor: baca aset/maintenance, edit/publish DXF, download dokumen.
- Administrator: seluruh permission, metrics, dan master data.

Review role setiap kuartal, segera nonaktifkan akun yang tidak berwenang, dan jangan memakai administrator untuk operasi rutin.

## Operasi rutin

- Pantau `/api/health`, worker, `/api/metrics`, login failure, database, Redis, storage, dan disk.
- Jalankan backup terjadwal, verifikasi checksum/katalog, lalu uji restore ke staging.
- Import aset selalu diawali preview dan diakhiri reconciliation report.
- DXF wajib memiliki unit/control point tervalidasi sebelum publish.
- Simpan secret di secrets manager dan rotasi sesuai kebijakan perusahaan.
