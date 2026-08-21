# XAsset Command Center

Aplikasi web untuk memantau aset perusahaan pada peta 3D (CesiumJS) yang digabungkan dengan denah/gambar teknik berformat DXF. Sistem mendukung pengelolaan aset, editor DXF berbasis web, penjadwalan maintenance, pengunggahan dokumen, audit log, dan kontrol akses berbasis peran (RBAC).

> **Targetkan:** Bandar Udara Raja Haji Fisabilillah — Tanjung Pinang (site `TNJ`), dengan ekstensi ke lokasi lain.

---

## 📑 Daftar Isi

1. [Ringkasan Fitur](#-ringkasan-fitur)
2. [Persyaratan Sistem](#-persyaratan-sistem)
3. [Quick Start (Pengembangan Lokal)](#-quick-start-pengembangan-lokal)
4. [Konfigurasi Lingkungan](#-konfigurasi-lingkungan)
5. [Menjalankan Aplikasi](#-menjalankan-aplikasi)
6. [Deployment Produksi](#-deployment-produksi)
7. [Skrip yang Tersedia](#-skrip-yang-tersedia)
8. [Panduan Operasional](#-panduan-operasional)
9. [Referensi API](#-referensi-api)
10. [Peran & Izin](#-peran--izin)
11. [Troubleshooting](#-troubleshooting)
12. [Dokumentasi Tambahan](#-dokumentasi-tambahan)

---

## 🧩 Ringkasan Fitur

| Area | Fitur |
|---|---|
| **Peta 3D** | Visualisasi aset pada peta globe 2D/3D CesiumJS, clustering marker, fly-to, overlay DXF, kontrol layer/opacity, pemilihan basemap (street/aerial) |
| **Manajemen Aset** | CRUD aset (soft-archive), pencarian, filter, sorting, pagination, ekspor XLSX, optimistic locking (version-based) |
| **DXF Management** | Upload, validasi signature, parsing background worker, preview, kalibrasi (≥2 control point), versi draft/published/archived, publish/rollback |
| **Web DXF Editor** | Editor 2D canvas untuk LINE, POLYLINE, CIRCLE, ARC, TEXT — move, rotate, scale, copy, delete, snap, undo/redo, multi-select |
| **Maintenance** | Jenis (preventive/corrective/inspection), jadwal, Mulai/Selesai, recurrence, actual cost, reminder, laporan |
| **Dokumen Aset** | Upload PDF/gambar/docx dengan validasi file signature, signed URL, kategori, archive (soft-delete) |
| **Audit Log** | Pencatatan penuh untuk login, perubahan aset, posisi, DXF, master data, dokumen, maintenance |
| **Keamanan** | RBAC 4 level, CSRF protection, rate limiting login, file signature validation, security headers |
| **Monitoring** | Health check (`/api/health`), Prometheus metrics (`/api/metrics`, hanya admin) |
| **Import/Export** | XLSX bulk import dengan foto tertanam, preview & reconciliation |

---

## 🔧 Persyaratan Sistem

- **Docker & Docker Compose** — wajib untuk PostgreSQL (PostGIS), Redis, dan MinIO
- **Node.js 24+** — untuk pengembangan lokal dan worker
- **npm** — package manager
- **curl** — untuk health check smoke test

> **Spesifikasi minimum DXF:** parser browser dibatasi pada file kecil (~10 MB). DXF produksi yang besar diproses oleh **background worker** otomatis.

---

## 🚀 Quick Start (Pengembangan Lokal)

### ⭐ Cara Tercepat (1 Command)

```bash
# Clone/masuk ke repository
cd /home/exwox/Documents/docker/xasset

# Siapkan .env
cp .env.example .env
# Edit .env: ubah AUTH_SECRET (32+ karakter) dan ADMIN_PASSWORD (12+ karakter)

# Jalankan (semuanya otomatis: Docker, DB, migrations, seed, web, worker)
./run.sh
```

**Selesai!** ✅ Akses: http://localhost:3000

Login dengan:
- **Email**: `admin@xasset.local`
- **Password**: (dari `ADMIN_PASSWORD` di `.env`)

---

### Langkah Demi Langkah (Manual, jika perlu)

### 1. Salin konfigurasi environment

```bash
cp .env.example .env
```

Edit `.env` dan ganti nilai berikut minimal:

| Variabel | Wajib diubah? | Keterangan |
|---|---|---|
| `AUTH_SECRET` | ✅ | Minimal 32 karakter acak |
| `ADMIN_PASSWORD` | ✅ | Minimal 12 karakter |
| `DATABASE_URL` | ⚠️ | Sesuaikan jika port berbeda |
| `S3_ENDPOINT` | ⚠️ | Default MinIO lokal `http://127.0.0.1:9100` |

### 2. Jalankan layanan infrastruktur

```bash
docker compose up -d
```

Layanan yang disediakan oleh `compose.yaml`:

| Layanan | Image | Port | Keterangan |
|---|---|---|---|
| **PostgreSQL** | `postgis/postgis:17-3.5-alpine` | `127.0.0.1:5432` | Database dengan ekstensi PostGIS |
| **Redis** | `redis:7.4-alpine` | `127.0.0.1:6379` | Job queue (BullMQ) & rate limiter |
| **MinIO** | `minio/minio` | `127.0.0.1:9100` (API) <br> `127.0.0.1:9101` (Console) | S3-compatible object storage |

Admin/MinIO Console: `http://127.0.0.1:9101` (user/pass: `xasset` / `xasset_local_secret`)

### 3. Jalankan migrasi database

> **Catatan:** Skrip `tsx` tidak otomatis memuat `.env`. Gunakan salah satu cara berikut:

```bash
# Cara 1: Export env vars dari .env (Linux/macOS)
set -a && . ./.env && set +a
npm run db:migrate

# Cara 2: Gunakan Node.js --env-file (Node 22+)
node --env-file=.env node_modules/.bin/tsx scripts/migrate.ts

# Cara 3: Export satu per satu
DATABASE_URL="postgresql://xasset:xasset_local_password@127.0.0.1:5432/xasset" npm run db:migrate
```

### 4. Seed akun administrator

```bash
set -a && . ./.env && set +a
npm run db:seed-admin
```

Ini akan membuat akun admin berdasarkan `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari `.env`.

### 5. Jalankan aplikasi

Buka **dua terminal terpisah**:

```bash
# Terminal 1: Web server (Next.js dev) — Next.js otomatis memuat .env
npm run dev

# Terminal 2: Background worker (DXF processing) — perlu load .env manual
set -a && . ./.env && set +a
npm run worker
```

> **Catatan:** `npm run dev` secara otomatis menyalin aset Cesium yang dibutuhkan ke `public/cesium/` via hook `predev`. Skrip `tsx` (worker, migrate, dll.) **tidak** otomatis memuat `.env` — gunakan `set -a && . ./.env && set +a` atau `node --env-file=.env` (Node 22+).

Akses aplikasi di: **http://localhost:3000**

---

## ⚙️ Konfigurasi Lingkungan

Salin dari `.env.example` dan sesuaikan. Berikut penjelasan tiap variabel:

| Variabel | Default | Keterangan |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `APP_URL` | `http://localhost:3000` | Origin aplikasi (dipakai CSP & CSRF) |
| `DATABASE_URL` | — | Connection string PostgreSQL (wajib PostGIS) |
| `REDIS_URL` | — | Connection string Redis |
| `AUTH_SECRET` | — | Secret JWT (≥ 32 karakter) |
| `SESSION_TTL_SECONDS` | `28800` | Durasi sesi (detik) — default 8 jam |
| `S3_ENDPOINT` | — | Endpoint S3/MinIO |
| `S3_REGION` | `ap-southeast-1` | Region S3 |
| `S3_BUCKET` | — | Nama bucket S3 |
| `S3_ACCESS_KEY` | — | Access key S3 |
| `S3_SECRET_KEY` | — | Secret key S3 |
| `S3_FORCE_PATH_STYLE` | `true` | Gunakan path-style (untuk MinIO) |
| `LOG_LEVEL` | `info` | `silent\|fatal\|error\|warn\|info\|debug\|trace` |
| `ADMIN_EMAIL` | — | Email admin untuk seeding |
| `ADMIN_PASSWORD` | — | Password admin (≥ 12 karakter) |

---

## ▶️ Menjalankan Aplikasi

### ⭐ Cara Termudah: Gunakan run.sh (Recommended)

Hanya perlu 1 command — semua jalan otomatis (Docker, migrasi DB, seed, web server, worker):

```bash
./run.sh
```

Output:
```
🚀 XAsset Command Center — Development Mode
--- [1/5] Menjalankan infrastruktur...
--- [2/5] Menjalankan migrasi database...
--- [3/5] Seed akun administrator...
--- [4/5] Menjalankan development server (Next.js)...
✅ Aplikasi siap di: http://localhost:3000
--- [5/5] Menjalankan background worker...
```

Aplikasi siap di: **http://localhost:3000** ✅

**Untuk berhenti:** Tekan `Ctrl+C`

---

### Command Alternatif (run.sh)

| Perintah | Deskripsi |
|---|---|
| `./run.sh` | Jalankan development mode (default) — semua otomatis |
| `./run.sh prod` | Jalankan production mode (Docker containers only) |
| `./run.sh clean` | Stop dan hapus semua containers |

---

### Manual Mode (Jika tidak ingin gunakan run.sh)

**Terminal 1** — Web server:
```bash
npm run dev
```

**Terminal 2** — Background worker (di terminal terpisah):
```bash
set -a && . ./.env && set +a
npm run worker
```

> **Catatan:** `npm run dev` secara otomatis menyalin aset Cesium dan memuat `.env`. Skrip `tsx` (worker) perlu load `.env` manual — gunakan `set -a && . ./.env && set +a`.

---

### Mode Produksi (Docker)

Gunakan `run.sh prod` (recommended) atau manual:

```bash
docker compose -f compose.production.yaml up -d
```

---

### Mode Test

```bash
# Siapkan .env.test
cp .env.test .env
# Edit .env: ganti port 5432->5433, 6379->6380 jika perlu custom

# Jalankan migrasi & seed
set -a && . ./.env && set +a
npm run db:migrate
npm run db:seed-admin

# Jalankan semua tes
npm test
```

---

## 🐳 Deployment Produksi

Aplikasi dilengkapi **Dockerfile multi-stage** dan **compose.production.yaml**.

### Cara Termudah: Gunakan run.sh

```bash
# Siapkan .env.production
cp .env.example .env.production
# Edit .env.production dengan nilai produksi (secret dari secrets manager)

# Deploy dengan Docker (otomatis)
./run.sh prod
```

Output:
```
✅ Production services started!
   Web server: http://localhost:3000
   Admin email: admin@xasset.local
View logs: docker compose -f compose.production.yaml logs -f
```

**Untuk berhenti:** 
```bash
./run.sh clean
```

---

### Manual: Build & Deploy dengan Docker Compose

```bash
# Siapkan .env.production
cp .env.example .env.production
# Edit .env.production dengan nilai produksi (secret dari secrets manager)

# Deploy
docker compose -f compose.production.yaml up -d
```

`compose.production.yaml` mendefinisikan dua service:
- **`web`** — Next.js standalone server (port 3000), read-only filesystem, health check
- **`worker`** — DXF background worker

### Build Manual

```bash
# Build image multi-stage
docker build --target web -t xasset-web:latest .
docker build --target worker -t xasset-worker:latest .

# Jalankan
docker run -d --name xasset-web --env-file .env.production -p 3000:3000 xasset-web:latest
docker run -d --env-file .env.production xasset-worker:latest
```

---

## 📜 Skrip yang Tersedia

Perintah di `package.json` dan skrip di `scripts/`:

> **⚠️ Catatan:** Perintah yang berbasis `tsx` (`db:migrate`, `db:seed-admin`, `import:assets`, `reconcile:assets`, `validate:dxf`, `worker`) **tidak otomatis** memuat `.env`. Jalankan `set -a && . ./.env && set +a` terlebih dahulu, atau gunakan `node --env-file=.env node_modules/.bin/tsx ...`. Perintah `dev`, `build`, `start`, dan `test` (Next.js/Vitest) sudah memuat `.env` otomatis.

### Pengembangan & Build
| Perintah | Deskripsi |
|---|---|
| `npm run dev` | Jalankan development server |
| `npm run build` | Build untuk produksi (`next build --webpack`) |
| `npm start` | Jalankan production server |
| `npm run check` | Jalankan typecheck + lint + test sekaligus |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Unit & integration tests (Vitest) |
| `npm run format` | Format kode dengan Prettier |

### Database
| Perintah | Deskripsi |
|---|---|
| `npm run db:migrate` | Jalankan migration SQL dari `db/migrations/` (**perlu `.env`**) |
| `npm run db:seed-admin` | Seed akun administrator (**perlu `.env`**) |

### Import/Export Aset
| Perintah | Deskripsi |
|---|---|
| `npm run import:assets -- /path/to/file.xlsx` | Import aset dari workbook Excel (**perlu `.env`**, gunakan `--dry-run` untuk preview) |
| `npm run reconcile:assets -- /path/to/file.xlsx` | Bandingkan workbook dengan database, hasilkan laporan (**perlu `.env`**) |
| `npm run import:assets -- /path/to/file.xlsx --dry-run` | Mode preview — tidak menulis ke database |

**Template XLSX lengkap dengan panduan foto tertanam** tersedia di: `GET /api/assets/import/template`

### DXF
| Perintah | Deskripsi |
|---|---|
| `npm run validate:dxf -- /path/to/file.dxf` | Validasi & analisis DXF (entity count, layer, bounds, unit) |
| `set -a && . ./.env && set +a && npm run worker` | Jalankan DXF processing worker |

### Smoke & Test
| Perintah | Deskripsi |
|---|---|
| `npm run smoke:all` | Jalankan seluruh suite smoke di Docker |
| `npm run smoke:e2e` | Critical flow E2E (login → CRUD aset → archive → CSRF check) |
| `npm run smoke:deployment` | Deployment smoke (health → login → asset → DXF → maintenance) |
| `npm run test:security` | Security smoke (CSRF, rate limit, IDOR, injection, headers) |
| `npm run test:load` | Load test (default: 200 request, p95 < 1500ms) |
| `npm run test:integration` | Integration test terhadap database |

### Backup & Restore
| Skrip | Deskripsi |
|---|---|
| `bash scripts/backup.sh /absolute/backup/dir` | Backup database (pg_dump format custom) + SHA256 |
| `CONFIRM_RESTORE=RESTORE_XASSET bash scripts/restore.sh /path/to/backup.dump` | Restore database (memerlukan konfirmasi) |
| `bash scripts/verify-backup.sh /path/to/backup.dump` | Verifikasi integritas backup |

---

## 📖 Panduan Operasional

### 📋 Alur Penggunaan Lengkap dari Awal

#### **Phase 1: Setup Awal Sistem**

##### ⭐ Cara Tercepat (1 Command)

```bash
cd /home/exwox/Documents/docker/xasset
cp .env.example .env
# Edit .env: ubah AUTH_SECRET dan ADMIN_PASSWORD
./run.sh
```

Selesai! ✅ Akses: http://localhost:3000

---

##### Cara Manual (Jika perlu step-by-step)

**Step 1: Persiapan Lingkungan**
1. Clone repository dan masuk ke folder project:
   ```bash
   cd /home/exwox/Documents/docker/xasset
   ```
2. Salin file konfigurasi environment:
   ```bash
   cp .env.example .env
   ```
3. **Edit `.env`** dan sesuaikan parameter penting:
   - `AUTH_SECRET` — ganti dengan 32+ karakter acak (misal: `x7kL9mN2pQ4rT6vW8yZ1aBcDeFgHiJkLmNoPqRsT`)
   - `ADMIN_PASSWORD` — minimal 12 karakter (contoh: `AdminPassword123`)
   - Database/Redis/S3 — gunakan default jika lokal, sesuaikan jika custom
4. Jalankan infrastruktur (PostgreSQL, Redis, MinIO):
   ```bash
   docker compose up -d
   ```
   > Tunggu ~10 detik hingga semua service siap. Cek status: `docker compose ps`

**Step 2: Inisialisasi Database**
1. Load environment variables dan jalankan migrasi:
   ```bash
   set -a && . ./.env && set +a
   npm run db:migrate
   ```
   > Ini membuat semua tabel, index, role, permission, dan master data (kelas aset, unit, frekuensi, dll.)

2. Seed akun administrator:
   ```bash
   npm run db:seed-admin
   ```
   > Output: `Administrator ready: admin@xasset.local`

**Step 3: Jalankan Aplikasi**
**Terminal 1** — Web server:
```bash
npm run dev
```
> Output: `➜ Local: http://localhost:3000` (Next.js otomatis memuat `.env`)

**Terminal 2** — Background worker (di terminal terpisah):
```bash
set -a && . ./.env && set +a
npm run worker
```
> Worker menunggu job DXF processing di Redis queue

Aplikasi siap di: **http://localhost:3000**

---

#### **Phase 2: Login & Navigasi Dashboard**

##### Step 1: Login
1. Buka browser ke `http://localhost:3000/login`
2. Masukkan kredensial:
   - **Email**: `admin@xasset.local` (dari `.env` `ADMIN_EMAIL`)
   - **Password**: `AdminPassword123` (dari `.env` `ADMIN_PASSWORD`)
3. Klik **"Masuk"**
4. Berhasil → redirect ke dashboard utama `/`

> **Troubleshoot:** Jika login gagal, pastikan:
> - Docker compose sudah running (`docker compose ps`)
> - Database sudah migrasi (`npm run db:migrate`)
> - Admin sudah di-seed (`npm run db:seed-admin`)
> - `AUTH_SECRET` di `.env` ≥ 32 karakter

##### Step 2: Kenali Dashboard Utama (`/`)
1. **Header** — menampilkan nama user, role, tombol logout
2. **Sidebar** — navigasi menu:
   - 📊 Dashboard (peta)
   - 📦 Data Aset (`/assets`)
   - 🗺️ DXF Management (`/dxf`)
   - 🔧 Maintenance (`/maintenance`)
   - ⚙️ Master Data (`/master-data`, hanya admin)
   - 📋 Audit Log (`/audit`, hanya admin)
3. **Peta 3D** — CesiumJS globe menampilkan semua aset (marker dengan label) di lokasi geografis mereka
   - Klik marker untuk zoom ke aset
   - Klik kartu aset di kanan untuk fly-to
   - Gunakan mouse scroll untuk zoom, drag untuk pan
   - Klik 🗺️ untuk ganti basemap (street/aerial/satellite)

---

#### **Phase 3: Pengelolaan Aset**

##### Workflow A: Buat Aset Manual (per item)

1. Navigasi ke **Data Aset** → klik **"+ Tambah Aset"**
2. Isi form:
   - **Nama** — misal: "Pompa Bahan Bakar A1"
   - **Kode** — misal: "PBB-A1" (unique)
   - **Deskripsi** — (opsional) deskripsi lengkap
   - **Kelas** — dropdown, misal: "Mesin Pompa"
   - **Kategori** — dropdown, misal: "Electrical Equipment"
   - **Lokasi** — pilih dari master data lokasi
   - **Lokasi Detail** — room/sector (misal: "Ruang Genset")
   - **Latitude / Longitude** — input manual atau klik peta untuk mendapatkan koordinat
   - **Unit** — misal: "Unit"
   - **Serial Number** — (opsional) untuk asset tracking
   - **Tanggal Pemasangan** — calendar picker
   - **Status** — Operational/Maintenance/Inspection
3. Klik **Simpan**
4. Aset muncul di peta dan daftar aset

##### Workflow B: Import Aset Massal dari Excel

1. **Unduh template XLSX:**
   - Buka `GET /api/assets/import/template` atau klik tombol "Unduh Template" di halaman import
   - File: `template-import-aset-xasset.xlsx`

2. **Isi template Excel** (gunakan LibreOffice Calc / Excel):
   - Isi sheet `Daftar Aset` tanpa mengubah nama header
   - Tambah 1 baris per aset
   - Masukkan gambar melalui **Insert → Pictures**, lalu posisikan sudut kiri atas gambar di kolom `Dokumentasi` pada baris aset yang sesuai
   - Format foto: JPG, PNG, atau WebP, maksimal 10 MB per foto; ukuran workbook maksimal 50 MB
   - Petunjuk lengkap tersedia pada sheet `Petunjuk Import`

3. **Preview import** (validasi tanpa menulis DB):
   ```bash
   set -a && . ./.env && set +a
   npm run import:assets -- /path/to/file.xlsx --dry-run
   ```
   > Hasilkan laporan: error baris, missing kolom, duplikat, dll.

4. **Jika preview OK**, jalankan import:
   ```bash
   npm run import:assets -- /path/to/file.xlsx
   ```
   > Output: `Imported 45 assets, skipped 2 (see log for details)`

5. **Verifikasi hasil**:
   - Buka dashboard, lihat peta — marker sudah bertambah
   - Buka **Data Aset** → lihat daftar aset baru
   - Lakukan **reconciliation** untuk bandingkan dengan file original:
     ```bash
     npm run reconcile:assets -- /path/to/file.xlsx
     ```

##### Workflow C: Edit/Update Aset

1. Di halaman **Data Aset**, cari aset (gunakan search atau filter)
2. Klik baris aset → buka detail
3. Klik **Edit** (pensil icon)
4. Ubah field yang diperlukan:
   - Sistem mendeteksi konflik concurrent edit (optimistic locking via `version`)
   - Jika ada perubahan dari user lain, muncul warning → refresh dan coba lagi
5. Klik **Simpan**
6. Histori perubahan tercatat di **Audit Log**

##### Workflow D: Soft-Delete (Archive) Aset

1. Di daftar aset, cari aset yang ingin di-archive
2. Klik 3-dot menu → **Archive**
3. Konfirmasi: "Aset akan di-archive (soft-delete) dan tidak muncul di dashboard"
4. Klik **Konfirmasi**
5. Aset tetap di DB tapi tidak ditampilkan. Untuk restore: admin buka DB, `UPDATE assets SET deleted_at=NULL WHERE id=...`

---

#### **Phase 4: Manajemen DXF (Gambar Teknik)**

Lihat detail di [`docs/sop-dxf.md`](docs/sop-dxf.md). Ringkas:

##### Workflow A: Upload DXF Baru

1. Navigasi ke **DXF Management** (`/dxf`) → klik **"+ Upload DXF"**
2. Isi form:
   - **Nama** — misal: "Denah Lantai 1 Gedung A"
   - **Change Note** — misal: "Update posisi mesin x500"
   - **File** — pilih file `.dxf` (max 50 MB untuk upload browser; >50 MB gunakan direct S3 upload)
3. Klik **Upload**
4. Sistem:
   - Validasi signature (magic bytes)
   - Upload ke S3/MinIO
   - Queue ke background worker
   - Status: `Uploading` → `Queued` → `Processing` → `Ready`
5. Tunggu status **Ready** (biasanya <1 menit untuk file normal, lebih lama jika > 10 MB)

##### Workflow B: Kalibrasi (Georeference) DXF

Setelah DXF status **Ready**, perlu set transformasi koordinat lokal DXF ↔ geografis (WGS84):

1. Buka detail DXF yang sudah ready
2. Tab **Georeference**
3. Klik **"Tambah Control Point"** (minimal 2, disarankan ≥3 untuk akurasi affine)
4. **Untuk setiap control point**:
   - **Klik pada peta** → dapatkan latitude/longitude geografis
   - **Input nilai DXF** → koordinat lokal DXF file (misal: unit meter atau lainnya)
   - **Catatan** — misal: "Sudut barat laut bangunan"
   - Klik **Simpan point**
5. Setelah ≥2 point, klik **"Hitung & Simpan Transformasi"**
   - Sistem hitung: transformation matrix (similarity/affine), residual error
   - Tampilkan preview di peta (overlay DXF)
6. **Jika error ≤ toleransi** (default: 10m), status OK → lanjut publish
7. **Jika error > toleransi**: edit control point (klik untuk ubah) atau tambah point baru, hitung ulang

##### Workflow C: Publish DXF

Setelah transformasi OK:

1. Klik **"Publish Versi"** di halaman detail DXF
2. Konfirmasi: "Publish akan membuat versi ini menjadi active untuk overlay di peta"
3. Klik **Konfirmasi**
4. Status versi → **Published**
5. Versi lama tetap tersedia di tab **Versions** untuk rollback

##### Workflow D: Edit DXF di Web Editor

1. Buka detail DXF published → tab **Editor** → klik **"Buat Edit Session"**
2. Pilih **Base Version** (biasanya versi published terbaru)
3. Klik **Create** — buka web editor `/dxf/{id}/edit`
4. **Toolbar editor**:
   - **Select** — pilih entitas (entity = LINE/POLYLINE/CIRCLE/ARC/TEXT)
   - **Pan** — drag peta
   - **Line** — gambar garis
   - **Polyline** — polyline multi-segment
   - **Circle** — lingkaran
   - **Arc** — kurva
   - **Text** — tambah text
   - **Asset** — link aset ke lokasi DXF
5. **Edit actions**:
   - Klik entitas → properties panel muncul (layer, color, linetype, thickness)
   - Drag entitas untuk move
   - Right-click → rotate/scale/copy/delete
   - **Snap** aktif (endpoint, midpoint, intersection, grid)
   - **Undo/Redo** — Ctrl+Z / Ctrl+Y
   - Multi-select: Shift+Click
6. Klik **Simpan Draft** (interval otomatis setiap 2 menit)
7. Klik **Ekspor DXF Baru** → download file `.dxf` baru
8. File di-queue ke worker sebagai versi baru
9. Setelah processing selesai, klik **Publish** untuk active versi baru

---

#### **Phase 5: Pengelolaan Maintenance (Perawatan)**

##### Workflow A: Setup Tipe Maintenance

1. **Admin only** → **Master Data** → **Jenis Maintenance**
2. Klik **"+ Tambah Jenis"**
3. Isi:
   - **Nama** — misal: "Preventive Maintenance (PM)"
   - **Tipe** — dropdown: "Preventive" / "Corrective" / "Inspection"
   - **Deskripsi** — (opsional)
4. Klik **Simpan**
   - Jenis umum sudah di-seed saat `db:migrate`

##### Workflow B: Buat Jadwal Maintenance

1. Navigasi ke **Data Aset**, cari aset → klik buka detail
2. Tab **Maintenance** → klik **"+ Jadwalkan"**
3. Isi form:
   - **Tipe** — dropdown (misal: "Preventive Maintenance")
   - **Tanggal Mulai** — calendar
   - **Frekuensi** — dropdown: "Sekali", "Mingguan", "Bulanan", "Tahunan"
   - **Catatan** — aktivitas maintenance (misal: "Ganti oli mesin")
   - **Estimasi Durasi** — jam (misal: 2)
   - **Estimasi Biaya** — IDR (misal: 500000)
4. Klik **Jadwalkan**
5. Jadwal muncul di **Maintenance** page dan dashboard (reminder jika dalam N hari)

##### Workflow C: Update Status Maintenance

1. Di **Maintenance** page, cari jadwal yang akan dikerjakan
2. Klik buka detail jadwal
3. Klik **Mulai Maintenance** → status: Scheduled → In Progress
4. Setelah selesai, klik **Selesaikan**:
   - Input actual cost (jika berbeda estimasi)
   - Input actual duration
   - Input catatan completion
5. Klik **Selesai** → status: Completed
6. Histori terekam di audit log

---

#### **Phase 6: Manajemen Dokumen Aset**

##### Workflow A: Upload Dokumen ke Aset

1. Di **Data Aset** detail aset, tab **Dokumen**
2. Klik **"+ Upload Dokumen"**
3. Isi:
   - **Kategori** — dropdown: "Manual Teknik", "Certificate", "Warranty", "Inspection Report", dll.
   - **Deskripsi** — misal: "Manual mesin pompa model XYZ"
   - **File** — pilih file PDF/JPG/PNG/DOC/XLSX (max 50 MB)
4. Klik **Upload**
   - Sistem validasi signature (magic bytes)
   - Upload ke S3/MinIO
   - Generate signed download URL
5. Dokumen muncul di list, bisa di-download atau di-archive

##### Workflow B: Download Dokumen

1. Di tab **Dokumen**, klik file → download link signed URL
2. Browser download file dari S3/MinIO
3. Akses dicatat di audit log

---

#### **Phase 7: Monitoring & Reporting**

##### Dashboard Overview (`/`)
- Peta 3D dengan semua aset
- Widget: Total aset, aset maintenance (merah), aset inspection (kuning)
- Reminder maintenance jatuh tempo hari ini/minggu depan
- Akses cepat ke report

##### Maintenance Report (`/maintenance`)
- Summary: total jadwal, completed, pending, overdue
- Filter by type, asset class, usage frequency
- Export laporan ke XLSX

##### Audit Log (`/audit`, admin only)
- Semua aktivitas: login, create/update/delete aset, DXF publish, maintenance, dokumen
- Filter: user, action, resource, tanggal
- Export untuk compliance & investigasi

##### Metrics (`/api/metrics`, admin only)
- Prometheus metrics (HTTP requests, latency, DB pool, Redis queue)
- Gunakan untuk monitoring real-time di Grafana/Prometheus

---

#### **Phase 8: User Management & Role Control**

##### Create User (Admin only)

1. **Admin** → **Master Data** → **Users** (belum ada di UI v1, gunakan DB langsung atau API)
2. Insert user ke table `users`:
   ```sql
   INSERT INTO users (email, name, password_hash, role_id, active)
   SELECT 'operator@xasset.local', 'Operator Lantai 1', 
          crypt('OperatorPassword123', gen_salt('bf')), 
          id, true
   FROM roles WHERE code='operator';
   ```
3. User bisa login dengan email & password baru
4. Hanya bisa akses resources sesuai role permission

##### Role & Permission

- **Viewer**: Read-only, lihat peta & daftar aset, download dokumen
- **Operator**: Viewer + buat/edit aset, kelola maintenance, upload dokumen
- **DXF Editor**: Operator + edit/publish DXF (khusus tim teknik)
- **Administrator**: Semua permission, kelola user, master data, audit, metrics

---

### Import aset dari Excel

1. Unduh template: `GET /api/assets/import/template`
2. Isi data pada sheet `Daftar Aset`; tambahkan foto sebagai gambar tertanam di kolom `Dokumentasi`.
3. **Preview** dulu untuk memastikan tidak ada error validasi:
   ```bash
   npm run import:assets -- /path/to/file.xlsx --dry-run
   ```
4. Jika OK, jalankan import tanpa `--dry-run`:
   ```bash
   npm run import:assets -- /path/to/file.xlsx
   ```
5. Lakukan reconciliation:
      ```bash
   npm run reconcile:assets -- /path/to/file.xlsx
   ```

### Upload & Publish DXF (lihat juga: `docs/sop-dxf.md`)

1. Buka halaman **DXF Management** (`/dxf`).
2. Klik **Upload DXF**, isi nama, change note, dan pilih file `.dxf`.
3. Sistem mengalidasi signature, lalu worker mem-parse file di background.
4. Setelah status **Ready**, isi **control point** (minimal 2, disarankan ≥3): klik pada peta untuk mendapatkan koordinat geografis, masukkan koordinat lokal DXF yang bersesuaian.
5. Klik **"Hitung & simpan transformasi"** — sistem menghitung transformasi (similarity/affine) dan residual error.
6. Jika residual ≤ toleransi, klik **Publish** untuk menerbitkan versi tersebut.
7. Versi sebelumnya tetap tersedia untuk **rollback**.

### Editor DXF Web

1. Buka `/dxf/{id}/edit` (atau klik "Edit" dari halaman detail DXF).
2. Pilih **base version** dan klik **Create Edit Session**.
3. Gunakan toolbar: Select, Pan, Line, Polyline, Circle, Arc, Text, Asset.
4. Pilih entitas untuk mengubah layer, warna, line type.
5. Gunakan **snap** (endpoint, midpoint, intersection, grid).
6. Klik **Simpan draft** untuk menyimpan progres.
7. Klik **Ekspor versi DXF baru** untuk menghasilkan file `.dxf` yang diproses worker sebagai versi baru.

---

## 🌐 Referensi API

Semua endpoint API memerlukan otentikasi kecuali yang tercantum. Sesi disimpan dalam cookie HTTP-only `xasset_session`.

### Autentikasi
| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Login (rate-limited: 10 req/15min per email) |
| `POST` | `/api/auth/logout` | — | Logout |
| `GET` | `/api/auth/me` | `asset:read` | Info pengguna saat ini |

### Health & Metrics
| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| `GET` | `/api/health` | — | Cek readiness PostgreSQL, Redis, S3 |
| `GET` | `/api/metrics` | `admin:manage` | Prometheus metrics |

### Aset
| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| `GET` | `/api/assets` | `asset:read` | List aset (filter: `q`, `status`, `classId`, `locationId`, `usageFrequencyId`, `sort`, `order`, `page`, `pageSize`, `bbox`) |
| `POST` | `/api/assets` | `asset:write` | Buat aset baru |
| `GET` | `/api/assets/{id}` | `asset:read` | Detail aset |
| `PATCH` | `/api/assets/{id}` | `asset:write` | Update aset (optimistic locking via `version`) |
| `DELETE` | `/api/assets/{id}` | `asset:write` | Soft-archive aset |
| `GET` | `/api/assets/export/xlsx` | `asset:read` + `document:download` | Export XLSX beserta foto |
| `GET` | `/api/assets/import/template` | `asset:read` | Download template XLSX dan panduan foto |
| `POST` | `/api/assets/import` | `asset:write` | Import XLSX dan foto tertanam (support `mode=preview`) |
| `GET` | `/api/assets/{id}/history` | `asset:read` | Histori audit log aset |

### Dokumen Aset
| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| `GET` | `/api/assets/{id}/documents` | `asset:read` | List dokumen |
| `POST` | `/api/assets/{id}/documents` | `document:upload` | Dapatkan signed URL upload |
| `POST` | `/api/assets/{id}/documents/confirm` | `document:upload` | Konfirmasi upload (validasi signature) |
| `GET` | `/api/assets/{id}/documents/{documentId}` | `document:download` | Dapatkan signed URL download |
| `DELETE` | `/api/assets/{id}/documents/{documentId}` | `document:delete` | Archive dokumen (soft delete) |

### DXF
| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| `GET` | `/api/dxf-documents` | `dxf:read` | List dokumen DXF |
| `POST` | `/api/dxf-documents` | `dxf:write` | Upload DXF (dapatkan signed URL) |
| `GET` | `/api/dxf-documents/{id}` | `dxf:read` | Detail dokumen + versi + layer |
| `GET` | `/api/dxf-documents/{id}/versions/{versionId}` | `dxf:read` | URL download source/normalized |
| `PATCH` | `/api/dxf-documents/{id}/versions/{versionId}` | `dxf:write` | Update layer visibility/color/opacity |
| `DELETE` | `/api/dxf-documents/{id}/versions/{versionId}` | `dxf:publish` | Archive versi |
| `GET` | `/api/dxf-documents/{id}/versions/{versionId}/render` | `dxf:read` | Render JSON compact v2 (tuple segments, indexed layers, transform) |
| `POST` | `/api/dxf-documents/{id}/versions/{versionId}/confirm` | `dxf:write` | Konfirmasi upload → queue ke worker |
| `PATCH` | `/api/dxf-documents/{id}/versions/{versionId}/georeference` | `dxf:write` | Set control point & transform matrix |
| `POST` | `/api/dxf-documents/{id}/publish` | `dxf:publish` | Publish versi |
| `GET` | `/api/dxf-documents/{id}/edit-sessions` | `dxf:read` | List edit session |
| `POST` | `/api/dxf-documents/{id}/edit-sessions` | `dxf:write` | Buat edit session |
| `GET` | `/api/dxf-documents/{id}/edit-sessions/{sessionId}` | `dxf:read` | Detail session |
| `PATCH` | `/api/dxf-documents/{id}/edit-sessions/{sessionId}` | `dxf:write` | Save draft (optimistic locking) |
| `POST` | `/api/dxf-documents/{id}/edit-sessions/{sessionId}/export` | `dxf:write` | Export DXF baru dari session |
| `DELETE` | `/api/dxf-documents/{id}/edit-sessions/{sessionId}` | `dxf:write` | Discard edit session |

### Maintenance
| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| `GET` | `/api/maintenance/report` | `maintenance:read` | Laporan summary, by type, by usage frequency |
| `GET` | `/api/maintenance/reminders?days=30` | `maintenance:read` | Reminder jatuh tempo |
| `GET` | `/api/maintenance/types` | `maintenance:read` | List jenis maintenance |
| `POST` | `/api/maintenance/types` | `maintenance:write` | Buat jenis maintenance |
| `PATCH` | `/api/maintenance/types/{typeId}` | `maintenance:write` | Update jenis maintenance |
| `DELETE` | `/api/maintenance/types/{typeId}` | `maintenance:write` | Non-aktifkan jenis maintenance |
| `GET` | `/api/assets/{id}/maintenance` | `maintenance:read` | List jadwal & histori |
| `POST` | `/api/assets/{id}/maintenance` | `maintenance:write` | Buat jadwal maintenance |
| `PATCH` | `/api/assets/{id}/maintenance/{scheduleId}` | `maintenance:write` | Update jadwal (start/complete/cancel) |
| `DELETE` | `/api/assets/{id}/maintenance/{scheduleId}` | `maintenance:write` | Archive jadwal |

### Master Data
| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| `GET` | `/api/master-data/{resource}` | `asset:read` | List (classes, categories, units, frequencies, sites, locations) |
| `POST` | `/api/master-data/{resource}` | `admin:manage` | Buat master data |
| `PATCH` | `/api/master-data/{resource}/{id}` | `admin:manage` | Update master data |
| `DELETE` | `/api/master-data/{resource}/{id}` | `admin:manage` | Hapus master data |

---

## 👥 Peran & Izin

| Peran | Izin | Kemampuan |
|---|---|---|
| **Viewer** | `asset:read`, `dxf:read`, `maintenance:read`, `document:download` | Melihat peta, DXF, daftar aset, detail, dokumen |
| **Operator** | + `asset:write`, `maintenance:write`, `document:upload`, `document:delete` | Kelola aset, maintenance, dokumentasi |
| **DXF Editor** | `dxf:write`, `dxf:publish` | Edit/publish DXF, download dokumen |
| **Administrator** | **Semua** permission | Kelola pengguna, role, master data, audit log, metrics |

> **Security note:** Administrator memiliki **semua** permission. Jangan gunakan untuk operasi rutin.

### Status aset
- **Operational** — Hijau: aset berfungsi normal
- **Maintenance** — Merah: sedang maintenance aktif
- **Inspection** — Kuning: dalam masa inspeksi/belum diperiksa

---

## ⚠️ Troubleshooting

| Masalah | Solusi |
|---|---|
| `ECONNREFUSED` pada `DATABASE_URL` | Pastikan `docker compose up -d` berjalan, lalu `set -a && . ./.env && set +a` sebelum `npm run db:migrate` |
| DXF stuck di "processing" | Pastikan worker berjalan: `npm run worker` |
| Login gagal setelah seed | Pastikan `ADMIN_PASSWORD` ≥ 12 karakter; cek `.env` |
| Upload dokumen gagal (signature) | Pastikan file sesuai tipe MIME; sistem memvalidasi magic bytes |
| Port 5432/6379/9100 sudah dipakai | Edit `compose.yaml`, ganti port mapping |
| CORS/CSP error | Periksa `APP_URL` di `.env` sesuai origin yang diakses |
| Performa lambat pada DXF besar | Gunakan background worker, jangan parse di browser; file >10MB hanya via worker |

---

## 📚 Dokumentasi Tambahan

Dokumen lengkap tersedia di folder [`docs/`](docs/):

| Dokumen | Deskripsi |
|---|---|
| [`docs/user-guide.md`](docs/user-guide.md) | Panduan penggunaan aplikasi (UI) |
| [`docs/admin-guide.md`](docs/admin-guide.md) | Panduan administrator (role, backup, secret management) |
| [`docs/operations.md`](docs/operations.md) | Operasional runbook (dev, health, backup/restore, prod requirements) |
| [`docs/sop-dxf.md`](docs/sop-dxf.md) | SOP upload & publish DXF |
| [`docs/go-live-checklist.md`](docs/go-live-checklist.md) | Checklist pra go-live produksi |
| [`docs/uat-checklist.md`](docs/uat-checklist.md) | Checklist UAT & testing browser |
| [`docs/phase-0-data-audit.md`](docs/phase-0-data-audit.md) | Audit data awal (aset & DXF) |
| [`docs/incident-runbook.md`](docs/incident-runbook.md) | Panduan incident response |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Pedoman kontribusi & aturan commit |

---

## 📄 Lisensi

Proyek ini bersifat **private/perusahaan**. Lihat [`CONTRIBUTING.md`](CONTRIBUTING.md) untuk aturan kontribusi dan konvensi kode.

---

*Dokumen ini generatif — untuk pertanyaan atau koreksi, buat issue di repository atau hubungi tim platform.*
