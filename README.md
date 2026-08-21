# XAsset Command Center

XAsset adalah aplikasi manajemen aset berbasis peta untuk bandara dan site operasional. Aplikasi menggabungkan data aset, posisi titik atau polygon, foto dan dokumen, serta gambar teknik DXF dalam satu dashboard geospasial.

Repository: [github.com/exwox/xasset](https://github.com/exwox/xasset)

## Fitur saat ini

| Area             | Fitur                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard peta   | Peta Cesium 2D/3D, fallback Leaflet, basemap MAP/SAT, pencarian, filter status, filter class asset, dan filter posisi                    |
| Posisi aset      | Menentukan, mengubah, dan menghapus posisi titik langsung dari peta                                                                      |
| Polygon aset     | Menggambar polygon minimal 3 titik, undo titik, menyimpan pusat polygon, mengubah, dan menghapus polygon                                 |
| Detail aset      | Panel detail di dashboard, foto utama, status lifecycle, nilai aset, lokasi, dokumentasi, dan tombol Edit Asset berbentuk popup          |
| Data aset        | CRUD, soft archive, optimistic locking, pencarian, sorting, pagination, pilihan kolom, dan hapus semua khusus Admin                      |
| Import/Export    | Hanya XLSX; preview sebelum import, template lengkap, foto tertanam otomatis, dan export data beserta foto                               |
| DXF              | Upload dan versioning di halaman DXF, background processing, georeference, kontrol layer, editor web, publish, archive, dan overlay peta |
| Kontrol DXF peta | Pemilihan dokumen DXF serta tombol DXF ON/OFF agar overlay dapat dimatikan saat tidak dibutuhkan                                         |
| Dokumen aset     | Foto, PDF, TXT, CSV, XLSX, dan DOCX; signed URL, validasi signature, kategori, download, dan soft archive                                |
| Admin panel      | Active site/lokasi awal peta, tambah site bandara, serta manajemen user dan role                                                         |
| Akses pengguna   | Tiga role: Admin, User, dan Viewer                                                                                                       |
| Tampilan         | Logout di header, footer global, layout responsif, popup di atas layer peta, dan Print/PDF peta penuh                                    |
| Operasional      | Audit log, health check, metrics Admin, backup/restore database, dan worker DXF                                                          |

## Perubahan penting dari versi lama

- Modul **Maintenance** dan seluruh tabel/permission maintenance sudah dihapus.
- Status **Under Maintenance** tetap tersedia sebagai status lifecycle aset, bukan sebagai modul jadwal maintenance.
- Field **Kebutuhan Data** sudah dihapus dari form, API, import/export, dan database.
- Role lama Operator dan DXF Editor digabung menjadi role **User**.
- Filter dashboard menggunakan **Class Asset**, bukan frekuensi pemakaian.
- Upload dan pengelolaan DXF hanya tersedia di halaman **DXF**; dashboard hanya menampilkan overlay.
- Import/export dataset hanya mendukung **XLSX**, bukan CSV.

## Status lifecycle aset

Status yang tersedia:

- Planned
- Under Construction
- Commissioning
- Active
- Under Maintenance
- Inactive
- Decommissioned
- Demolished

Setiap status mempunyai warna marker dan polygon tersendiri pada dashboard.

## Role dan hak akses

| Role   | Akses                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| Admin  | Akses penuh, dashboard, dataset, DXF, dokumen, publish DXF, Admin Panel, metrics, dan arsip semua aset      |
| User   | Melihat dan mengedit dataset, posisi/polygon, foto/dokumen, upload/edit/publish DXF, import dan export XLSX |
| Viewer | Hanya melihat dashboard, aset, dan overlay DXF yang tersedia                                                |

Perubahan role atau status aktif user langsung berlaku karena session selalu diverifikasi kembali ke database. Admin aktif terakhir tidak dapat diturunkan role-nya atau dinonaktifkan.

## Halaman aplikasi

| URL              | Fungsi                                                      | Akses               |
| ---------------- | ----------------------------------------------------------- | ------------------- |
| `/`              | Dashboard peta dan detail aset                              | Admin, User, Viewer |
| `/assets`        | Tabel dataset, import/export, tambah/edit aset              | Admin, User         |
| `/assets/{id}`   | Detail, foto, dokumen, histori, posisi dan polygon          | Admin, User         |
| `/dxf`           | Upload, versi, georeference, layer, publish dan archive DXF | Admin, User         |
| `/dxf/{id}/edit` | Editor DXF berbasis canvas                                  | Admin, User         |
| `/admin`         | Active site dan user role management                        | Admin               |
| `/login`         | Login                                                       | Publik              |

## Persyaratan

- Linux, macOS, atau Windows dengan WSL2
- Node.js 24+
- npm
- Docker dan Docker Compose
- PostgreSQL dengan PostGIS
- Redis
- MinIO atau object storage kompatibel S3

Untuk penggunaan produksi, PostgreSQL, Redis, MinIO, metrics, dan endpoint administrasi sebaiknya hanya tersedia melalui jaringan privat.

## Quick start

### 1. Clone dan instal dependency

```bash
git clone https://github.com/exwox/xasset.git
cd xasset
npm ci
```

`npm ci` juga menyalin asset runtime Cesium ke `public/cesium/`. Direktori tersebut dihasilkan otomatis dan tidak disimpan di Git.

### 2. Siapkan environment

```bash
cp .env.example .env
```

Ganti minimal:

- `AUTH_SECRET`: string acak minimal 32 karakter.
- `ADMIN_PASSWORD`: password awal Admin minimal 12 karakter.
- Credential PostgreSQL, Redis, dan S3/MinIO untuk environment yang digunakan.

Jangan commit file `.env`.

### 3. Jalankan infrastruktur

```bash
docker compose up -d
```

Konfigurasi development menyediakan:

| Service            | Alamat           |
| ------------------ | ---------------- |
| PostgreSQL/PostGIS | `127.0.0.1:5432` |
| Redis              | `127.0.0.1:6379` |
| MinIO API          | `127.0.0.1:9100` |
| MinIO Console      | `127.0.0.1:9101` |

### 4. Jalankan migration dan buat Admin

```bash
set -a
. ./.env
set +a
npm run db:migrate
npm run db:seed-admin
```

Migration berjalan berurutan sampai `0014_admin_panel.sql`. Migration `0013_remove_maintenance_module.sql` menghapus modul Maintenance secara permanen dari schema aktif.

### 5. Jalankan web dan worker

Terminal pertama:

```bash
npm run dev
```

Terminal kedua:

```bash
set -a
. ./.env
set +a
npm run worker
```

Buka [http://localhost:3000](http://localhost:3000).

Sebagai alternatif, gunakan `./run.sh` untuk menyiapkan stack development secara terpadu.

## Konfigurasi environment

| Variabel              | Fungsi                                            |
| --------------------- | ------------------------------------------------- |
| `NODE_ENV`            | `development`, `test`, atau `production`          |
| `APP_URL`             | Origin aplikasi untuk CSP dan pemeriksaan request |
| `DATABASE_URL`        | Connection string PostgreSQL/PostGIS              |
| `REDIS_URL`           | Connection string Redis                           |
| `AUTH_SECRET`         | Kunci penandatangan session, minimal 32 karakter  |
| `SESSION_TTL_SECONDS` | Durasi session; default 28.800 detik              |
| `S3_ENDPOINT`         | Endpoint MinIO/S3                                 |
| `S3_REGION`           | Region object storage                             |
| `S3_BUCKET`           | Bucket untuk DXF, foto, dan dokumen               |
| `S3_ACCESS_KEY`       | Access key object storage                         |
| `S3_SECRET_KEY`       | Secret key object storage                         |
| `S3_FORCE_PATH_STYLE` | Gunakan `true` untuk MinIO                        |
| `LOG_LEVEL`           | Level log Pino                                    |
| `ADMIN_EMAIL`         | Email untuk seed Admin                            |
| `ADMIN_PASSWORD`      | Password untuk seed Admin                         |

## Penggunaan dashboard

### Mencari dan memfilter aset

Dashboard menyediakan:

- Pencarian berdasarkan nomor, kode, deskripsi, class, dan lokasi.
- Filter status lifecycle.
- Filter Class Asset.
- Filter semua posisi, sudah dipetakan, atau belum dipetakan.
- Sinkronisasi pilihan aset antara daftar, marker/polygon, dan panel detail.

### Menentukan posisi titik

1. Pilih aset.
2. Klik **Tentukan posisi** atau **Ubah posisi**.
3. Klik titik pada peta.
4. Koordinat latitude/longitude disimpan pada aset.
5. Gunakan **Hapus posisi** untuk mengosongkan koordinat yang sudah direkam.

### Menggambar polygon

1. Pilih aset.
2. Klik **Gambar polygon** atau **Ubah polygon**.
3. Klik minimal tiga titik sudut pada peta.
4. Gunakan **Undo** bila perlu, lalu klik **Simpan**.
5. Pusat polygon otomatis menjadi posisi utama aset.
6. Gunakan **Hapus polygon** untuk menghapus polygon tanpa menghapus posisi titik.

### Mengedit aset dari dashboard

Klik **Edit Asset** di samping status pada panel kanan. Form ditampilkan sebagai popup di atas peta, sehingga pengguna tidak perlu berpindah halaman.

### Overlay DXF

- Pilih dokumen pada menu **LAYER DXF**.
- Dokumen tanpa georeference ditandai dan belum dapat digambar pada koordinat dunia.
- Gunakan **DXF ON/OFF** di pojok kanan atas peta untuk menyembunyikan overlay.
- Gunakan **MAP/SAT** untuk berpindah basemap dan **2D/3D** untuk mengganti mode.
- Ketebalan garis dibuat ringan agar layer tidak menumpuk berlebihan saat zoom out.

### Print atau PDF

Klik **Print / PDF** pada toolbar dashboard. Dialog cetak browser memakai layout peta penuh dengan area kanan dan bawah tetap masuk halaman. Pilih **Save as PDF** untuk menyimpan.

## Dataset aset

Halaman `/assets` menyediakan:

- Pencarian dan filter Class Asset/status.
- Sorting dan pagination.
- Pemilihan kolom yang ditampilkan.
- Tambah dan edit aset melalui popup.
- Import XLSX dengan preview.
- Export XLSX beserta foto.
- Hapus semua aset khusus Admin dengan konfirmasi `HAPUS SEMUA`.

Penghapusan aset menggunakan soft archive agar data dapat dipulihkan dari database.

## Import XLSX dan foto otomatis

### Mengunduh template

Klik **Template XLSX + Panduan Foto** pada halaman Data Aset atau gunakan:

```text
GET /api/assets/import/template
```

Workbook mempunyai dua sheet:

- **Daftar Aset**: area pengisian data.
- **Petunjuk Import**: panduan kolom, status, koordinat, dan foto.

Header yang didukung:

| Kolom                | Keterangan                                           |
| -------------------- | ---------------------------------------------------- |
| No                   | Nomor urut opsional                                  |
| No Asset             | Wajib dan menjadi identitas unik                     |
| Capitalized on       | Tanggal Excel atau `YYYY-MM-DD`                      |
| Kode Aset            | Wajib                                                |
| Class Asset          | Class aset; otomatis dibuat/diselaraskan saat import |
| Asset description    | Wajib                                                |
| Acquis.val.          | Nilai perolehan                                      |
| Book val.            | Nilai buku                                           |
| Quantity             | Angka nol atau lebih                                 |
| Base Unit of Measure | Satuan                                               |
| Location             | Lokasi                                               |
| Sub Asset            | Referensi sub-aset dalam bentuk teks                 |
| Dokumentasi          | Catatan dan area foto tertanam                       |
| Lokasi / Layout      | Referensi lokasi/layout                              |
| Status Aset          | Salah satu status lifecycle yang valid               |
| Frekuensi Pemakaian  | Nilai master frekuensi aset                          |
| Koordinat            | Format `latitude, longitude`                         |

### Menambahkan foto di Excel

1. Buka sheet **Daftar Aset**.
2. Pilih **Insert → Pictures**.
3. Tempatkan sudut kiri atas gambar di kolom **Dokumentasi (M)** dan pada baris aset yang sama.
4. Beberapa gambar boleh ditempatkan pada baris yang sama.
5. Jalankan **Import XLSX** dan periksa jumlah baris serta gambar pada preview.
6. Konfirmasi import. Data aset dan gambar akan diunggah otomatis.

Ketentuan:

- Format gambar: JPG, PNG, atau WebP.
- Maksimal 10 MB per gambar tertanam.
- Maksimal 50 MB per workbook.
- Nama header tidak boleh diubah.
- Foto harus berupa gambar tertanam, bukan URL atau nama file.
- Import CSV tidak didukung.

### Export XLSX

Klik **Export XLSX + Foto**. Hasil export mempertahankan kolom dataset dan menanam foto aset pada baris yang sesuai, sehingga workbook dapat diimpor kembali.

## Pengelolaan DXF

Seluruh upload dan pengelolaan DXF dilakukan di `/dxf`.

Alur umum:

1. Upload file `.dxf` atau buat versi baru dari dokumen yang sudah ada.
2. Aplikasi mengunggah sumber ke object storage melalui signed URL.
3. Worker memvalidasi dan memproses DXF menjadi data render terkompresi.
4. Periksa jumlah entity, layer, bounds, unit, dan preview.
5. Isi minimal dua control point untuk georeference.
6. Atur visibility, warna, opacity, dan urutan layer.
7. Publish versi yang sudah siap.
8. Pilih dokumen tersebut sebagai overlay pada dashboard.

Batas ukuran DXF adalah 250 MB. File sumber tidak ditimpa ketika membuat versi atau memakai editor.

Editor DXF mendukung entity:

- LINE
- LWPOLYLINE/POLYLINE
- CIRCLE
- ARC
- TEXT

Operasi editor mencakup seleksi, multi-select, move, rotate, scale, copy, delete, snap, undo/redo, simpan session, dan export sebagai versi baru.

## Foto dan dokumen aset

Halaman detail aset mendukung:

- Foto utama JPG, PNG, atau WebP.
- Kategori photo, invoice, manual, certificate, inspection, dan other.
- PDF, gambar, TXT, CSV, XLSX, serta DOCX.
- Ukuran maksimal 25 MB per dokumen.
- Validasi MIME dan signature file setelah upload.
- Signed URL dengan masa berlaku terbatas untuk download.
- Soft archive dokumen; object tetap tersimpan untuk recovery.
- Histori perubahan aset.

## Admin Panel

### Active site

Admin dapat:

- Menambah bandara/site.
- Mengubah kode dan nama site.
- Menentukan longitude, latitude, dan ketinggian kamera awal.
- Menjadikan salah satu site sebagai **Active Site**.

Hanya satu site yang dapat aktif. Active site menjadi pusat awal dashboard serta default site untuk import dan DXF baru.

### User management

Admin dapat:

- Membuat user baru.
- Memilih role Admin, User, atau Viewer.
- Mengaktifkan atau menonaktifkan user.
- Melihat waktu login terakhir.

Password user baru minimal 12 karakter.

## API utama

Semua endpoint selain login memerlukan session. Mutasi juga menjalankan pemeriksaan origin/CSRF dan permission.

### Autentikasi

| Method | Endpoint           | Fungsi        |
| ------ | ------------------ | ------------- |
| POST   | `/api/auth/login`  | Login         |
| POST   | `/api/auth/logout` | Logout        |
| GET    | `/api/auth/me`     | Session aktif |

### Aset dan XLSX

| Method           | Endpoint                      | Permission                         |
| ---------------- | ----------------------------- | ---------------------------------- |
| GET/POST         | `/api/assets`                 | `asset:read` / `asset:write`       |
| GET/PATCH/DELETE | `/api/assets/{id}`            | `asset:read` / `asset:write`       |
| POST             | `/api/assets/archive-all`     | `admin:manage`                     |
| POST             | `/api/assets/import`          | `asset:write`                      |
| GET              | `/api/assets/import/template` | `asset:read`                       |
| GET              | `/api/assets/export/xlsx`     | `asset:read` + `document:download` |
| GET              | `/api/assets/{id}/history`    | `asset:read`                       |

### Dokumen

| Method     | Endpoint                                  | Permission                              |
| ---------- | ----------------------------------------- | --------------------------------------- |
| GET/POST   | `/api/assets/{id}/documents`              | `asset:read` / `document:upload`        |
| POST       | `/api/assets/{id}/documents/confirm`      | `document:upload`                       |
| GET/DELETE | `/api/assets/{id}/documents/{documentId}` | `document:download` / `document:delete` |
| GET        | `/api/assets/{id}/photo`                  | `asset:read`                            |

### DXF

| Method           | Endpoint                                                    | Fungsi                                |
| ---------------- | ----------------------------------------------------------- | ------------------------------------- |
| GET/POST         | `/api/dxf-documents`                                        | Daftar dan upload DXF                 |
| GET              | `/api/dxf-documents/{id}`                                   | Detail dokumen dan seluruh versi      |
| POST             | `/api/dxf-documents/{id}/archive`                           | Archive dokumen DXF                   |
| POST             | `/api/dxf-documents/{id}/publish`                           | Publish versi                         |
| GET/PATCH/DELETE | `/api/dxf-documents/{id}/versions/{versionId}`              | Sumber, layer, dan archive versi      |
| POST             | `/api/dxf-documents/{id}/versions/{versionId}/confirm`      | Konfirmasi upload dan antrekan worker |
| PATCH            | `/api/dxf-documents/{id}/versions/{versionId}/georeference` | Simpan transform                      |
| GET              | `/api/dxf-documents/{id}/versions/{versionId}/render`       | Data render peta                      |
| GET/POST         | `/api/dxf-documents/{id}/edit-sessions`                     | Daftar/buat session editor            |
| GET/PATCH/DELETE | `/api/dxf-documents/{id}/edit-sessions/{sessionId}`         | Buka, simpan, atau archive session    |
| POST             | `/api/dxf-documents/{id}/edit-sessions/{sessionId}/export`  | Export versi baru                     |

### Admin dan operasional

| Method       | Endpoint                           | Fungsi                                 |
| ------------ | ---------------------------------- | -------------------------------------- |
| GET/POST     | `/api/admin/sites`                 | Daftar/tambah site                     |
| PATCH        | `/api/admin/sites/{id}`            | Edit atau aktifkan site                |
| GET/POST     | `/api/admin/users`                 | Daftar/tambah user                     |
| PATCH        | `/api/admin/users/{id}`            | Role, status, nama, atau password user |
| GET/POST     | `/api/master-data/{resource}`      | Daftar/tambah master data              |
| PATCH/DELETE | `/api/master-data/{resource}/{id}` | Edit/hapus master data                 |
| GET          | `/api/health`                      | Readiness PostgreSQL dan Redis         |
| GET          | `/api/metrics`                     | Metrics Prometheus khusus Admin        |

## Backup keseluruhan

Data lengkap XAsset berada di dua tempat:

1. PostgreSQL/PostGIS: aset, polygon, user, role, site, metadata DXF, metadata foto/dokumen, transform, dan audit log.
2. S3/MinIO: file DXF asli, hasil render, foto, dan seluruh dokumen aset.

Backup database saja belum mencakup DXF dan foto.

### Backup database

```bash
set -a
. ./.env
set +a
bash scripts/backup.sh /absolute/path/backup/database
```

Skrip membuat PostgreSQL custom dump dan file checksum SHA-256.

### Backup object storage

Aktifkan versioning serta replikasi off-site pada bucket produksi. Untuk salinan manual menggunakan MinIO Client:

```bash
mc alias set xasset-minio "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
mc mirror --overwrite "xasset-minio/$S3_BUCKET" /absolute/path/backup/objects
```

Gunakan nama bucket aktual bila berbeda dari `xasset`. Simpan database dump dan object storage snapshot dalam waktu yang berdekatan, terenkripsi, serta di lokasi berbeda dari VPS utama.

### Verifikasi dan restore

```bash
bash scripts/verify-backup.sh /absolute/path/backup/database/xasset-TIMESTAMP.dump

CONFIRM_RESTORE=RESTORE_XASSET \
  bash scripts/restore.sh /absolute/path/backup/database/xasset-TIMESTAMP.dump
```

Uji restore terlebih dahulu pada environment staging. Setelah database dipulihkan, restore bucket object storage, jalankan migration terbaru, lalu uji login, dashboard, foto, dokumen, dan DXF.

## Perintah npm

| Perintah                                | Fungsi                                |
| --------------------------------------- | ------------------------------------- |
| `npm run dev`                           | Development server                    |
| `npm run build`                         | Build produksi Next.js                |
| `npm start`                             | Menjalankan build produksi            |
| `npm run worker`                        | Worker DXF                            |
| `npm run db:migrate`                    | Menjalankan migration                 |
| `npm run db:seed-admin`                 | Membuat/memperbarui Admin awal        |
| `npm run import:assets -- file.xlsx`    | Import XLSX melalui CLI               |
| `npm run reconcile:assets -- file.xlsx` | Rekonsiliasi workbook dengan database |
| `npm run validate:dxf -- file.dxf`      | Validasi DXF                          |
| `npm run check`                         | Typecheck, lint, dan test             |
| `npm run test:integration`              | Integration test database             |
| `npm run smoke:all`                     | Smoke test Docker                     |
| `npm run test:security`                 | Security smoke test                   |

## Verifikasi sebelum deployment

```bash
npm run check
npm run build
```

Suite saat ini mencakup:

- Authentication dan permission.
- Validasi schema aset dan Admin.
- Keamanan request dan signature file.
- Koordinat, status lifecycle, dan DXF processing/editor.
- Sinkronisasi daftar dengan peta.
- Edit popup dashboard.
- Print/PDF.
- Penentuan/hapus posisi.
- Gambar/hapus polygon.
- Import/export XLSX dan foto tertanam.

Integration test database memerlukan `INTEGRATION_DATABASE_URL`.

## Deployment produksi

`Dockerfile` menyediakan target:

- `web`: Next.js standalone.
- `worker`: background worker DXF.

Build manual:

```bash
docker build --target web -t xasset-web:latest .
docker build --target worker -t xasset-worker:latest .
```

Atau gunakan:

```bash
docker compose -f compose.production.yaml up -d
```

`compose.production.yaml` menjalankan service web dan worker. PostgreSQL, Redis, serta S3/MinIO harus sudah tersedia sesuai isi `.env.production`.

Untuk produksi:

- Gunakan TLS pada reverse proxy/ingress.
- Simpan secret di secrets manager.
- Jangan mengekspos PostgreSQL, Redis, dan object storage ke internet.
- Jalankan web dan worker dari source/commit yang sama.
- Aktifkan backup database dan replikasi bucket.
- Pantau `/api/health`, worker, antrean Redis, koneksi database, kapasitas disk, dan kegagalan login.

## Keamanan

- Password disimpan menggunakan scrypt.
- Session memakai JWT HS256 dalam cookie HTTP-only.
- User nonaktif tidak dapat memakai session lama.
- Permission diperiksa pada page dan API.
- Request mutasi menjalankan validasi origin/CSRF.
- Login mempunyai rate limiting.
- Upload memakai signed URL serta validasi MIME/signature.
- Log meredaksi password, authorization, cookie, secret, dan token.
- Perubahan penting disimpan ke audit log.
- Arsip aset, dokumen, dan DXF bersifat recoverable pada storage/database.

## Struktur repository

```text
db/migrations/       Migration PostgreSQL/PostGIS
docs/                Runbook dan panduan operasional
public/              Asset publik; runtime Cesium dihasilkan otomatis
scripts/             Migration, seed, backup, smoke test, import, dan DXF utility
src/app/             Next.js pages dan route handlers
src/components/      Dashboard, peta, modal, dan komponen UI
src/lib/             Parser XLSX/DXF, koordinat, status, dan tipe domain
src/server/          Database, auth, storage, schema, audit, dan service
src/worker/          Background worker DXF
```

## Catatan pengembangan

- Jangan mengubah migration yang sudah diterapkan; tambahkan migration baru.
- Jangan commit `.env`, file DXF produksi, workbook produksi, backup, atau isi bucket.
- Gunakan optimistic locking field `version` ketika memperbarui aset.
- Jalankan `npm run check` sebelum commit.
- Ikuti [CONTRIBUTING.md](CONTRIBUTING.md) untuk konvensi branch dan commit.
