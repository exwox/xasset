# XAsset Command Center

XAsset adalah aplikasi manajemen aset berbasis peta untuk bandara dan site operasional. Aplikasi menggabungkan data aset, posisi titik atau polygon, foto dan dokumen, serta gambar teknik DXF dalam satu dashboard geospasial.

Repository: [github.com/exwox/xasset](https://github.com/exwox/xasset)

## Fitur utama

| Area           | Fitur                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Dashboard peta | Cesium 2D/3D, fallback Leaflet, basemap peta/satelit, pencarian, filter, dan detail aset                               |
| Posisi aset    | Titik koordinat dan polygon yang dapat dibuat atau diubah melalui peta                                                 |
| Data aset      | CRUD, soft archive, optimistic locking, pagination, import/export XLSX, dan foto tertanam                              |
| DXF            | Upload, versioning, background processing, georeference, layer control, editor web, publish, archive, dan overlay peta |
| Dokumen        | Foto, PDF, TXT, CSV, XLSX, dan DOCX menggunakan signed URL dan validasi file                                           |
| Admin          | Manajemen site, lokasi awal peta, pengguna, role, status aktif, dan audit log                                          |
| Operasional    | Health check, metrics Admin, backup/restore database, worker DXF, dan deployment Docker                                |

Modul Maintenance sudah dihapus. Status lifecycle `Under Maintenance` tetap tersedia sebagai status aset.

## Role dan hak akses

| Role   | Akses                                                                         |
| ------ | ----------------------------------------------------------------------------- |
| Admin  | Seluruh fitur, Admin Panel, metrics, pengelolaan pengguna, dan archive massal |
| User   | Dashboard, pengelolaan aset, posisi/polygon, dokumen, DXF, import, dan export |
| Viewer | Melihat dashboard, aset, dan overlay DXF                                      |

Perubahan role atau status aktif pengguna langsung berlaku karena session diverifikasi kembali ke database. Admin aktif terakhir tidak dapat dinonaktifkan atau diturunkan role-nya.

## Persyaratan

### Development

- Linux, macOS, atau Windows dengan WSL2.
- Node.js 24+ dan npm.
- Docker Engine dengan plugin Docker Compose.

### Production VPS

- VPS Linux dengan Docker Engine, Docker Compose, Git, dan OpenSSL.
- Domain aplikasi dan subdomain storage yang mengarah ke IP VPS.
- Port TCP `80` dan `443` serta UDP `443` terbuka.
- Port `80` dan `443` tidak sedang dipakai reverse proxy lain.

Node.js dan npm tidak perlu dipasang pada host production karena build dan runtime berjalan di Docker.

## Quick start development

```bash
git clone https://github.com/exwox/xasset.git
cd xasset
./run.sh
```

Pada clone baru, runner otomatis:

1. Membuat `.env` dari `.env.example` jika belum ada.
2. Menjalankan `npm ci` jika dependency belum terpasang.
3. Menyalakan PostgreSQL/PostGIS, Redis, dan MinIO.
4. Menunggu seluruh dependency sehat.
5. Menjalankan migration dan seed Admin.
6. Membuat bucket MinIO.
7. Menjalankan Next.js dan worker DXF.

Sebelum digunakan untuk data penting, ubah `AUTH_SECRET` dan `ADMIN_PASSWORD` di `.env`. Aplikasi development tersedia di [http://localhost:3000](http://localhost:3000).

Service development:

| Service            | Alamat           |
| ------------------ | ---------------- |
| PostgreSQL/PostGIS | `127.0.0.1:5432` |
| Redis              | `127.0.0.1:6379` |
| MinIO API          | `127.0.0.1:9100` |
| MinIO Console      | `127.0.0.1:9101` |

Tekan `Ctrl+C` untuk menghentikan web dan worker. Container dependency tetap berjalan agar startup berikutnya lebih cepat.

## Deployment dari GitHub ke VPS

Deployment production menggunakan satu stack Docker yang berisi:

- PostgreSQL 17 dengan PostGIS.
- Redis dengan autentikasi.
- MinIO dan initializer bucket.
- Migrator database satu kali.
- Next.js standalone server.
- Background worker DXF.
- Caddy sebagai reverse proxy dan pengelola HTTPS otomatis.

### 1. Siapkan DNS

Jika domain aplikasi adalah `app.example.com`, buat dua record DNS yang mengarah ke IP publik VPS:

```text
app.example.com
storage.app.example.com
```

Tunggu sampai kedua record dapat di-resolve sebelum deployment agar Caddy dapat memperoleh sertifikat TLS.

### 2. Clone dan deploy

```bash
git clone https://github.com/exwox/xasset.git
cd xasset
./run.sh prod app.example.com
```

Gunakan hostname tanpa `http://`, `https://`, path, atau port.

Pada deployment pertama, [run.sh](run.sh) akan:

1. Membuat `.env.production` dengan permission `600`.
2. Menghasilkan password PostgreSQL, Redis, MinIO, `AUTH_SECRET`, dan password Admin secara acak.
3. Memvalidasi konfigurasi Docker Compose.
4. Membangun image web, worker, dan migrator.
5. Menyalakan dependency dan menunggu health check.
6. Menjalankan seluruh migration secara berurutan.
7. Membuat atau memperbarui akun Admin.
8. Menyalakan web, worker, MinIO, dan Caddy.

Password Admin awal hanya ditampilkan ketika `.env.production` pertama kali dibuat. Simpan password tersebut di password manager. Jangan commit `.env.production`.

### 3. Deploy pembaruan

```bash
cd xasset
git pull --ff-only
./run.sh prod
```

Runner selalu menyelesaikan migration dan seed sebelum mengganti atau menyalakan service aplikasi.

### 4. Periksa deployment

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs -f web worker caddy
curl -fsS https://app.example.com/api/health
```

Health endpoint memeriksa PostgreSQL, Redis, dan MinIO. Respons sehat menggunakan status HTTP `200`.

### 5. Menghentikan service

```bash
./run.sh clean
```

Perintah tersebut tidak menghapus database atau object storage.

> **Peringatan:** `./run.sh clean --volumes` menghapus seluruh named volume, termasuk database, bucket MinIO, Redis, dan data sertifikat Caddy. Gunakan hanya jika data memang boleh dihapus atau backup sudah diverifikasi.

## Perintah runner

| Perintah                        | Fungsi                                                   |
| ------------------------------- | -------------------------------------------------------- |
| `./run.sh`                      | Menjalankan development stack                            |
| `./run.sh dev`                  | Sama dengan `./run.sh`                                   |
| `./run.sh prod app.example.com` | Bootstrap deployment production pertama                  |
| `./run.sh prod`                 | Build, migrate, seed, dan deploy ulang production        |
| `./run.sh clean`                | Menghentikan container tanpa menghapus data              |
| `./run.sh clean --volumes`      | Menghentikan container dan menghapus seluruh data Docker |

## Menjalankan development secara manual

```bash
npm ci
cp .env.example .env
docker compose up -d --wait

set -a
. ./.env
set +a

npm run db:migrate
npm run db:seed-admin
bash scripts/init-s3.sh
```

Jalankan web dan worker pada terminal terpisah:

```bash
npm run dev
```

```bash
set -a
. ./.env
set +a
npm run worker
```

## Deployment production secara manual

Setelah `.env.production` dibuat oleh deployment pertama, alur manual yang setara adalah:

```bash
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml build web worker migrate
docker compose --env-file .env.production -f compose.production.yaml run --rm migrate
docker compose --env-file .env.production -f compose.production.yaml run --rm migrate ./node_modules/.bin/tsx scripts/seed-admin.ts
docker compose --env-file .env.production -f compose.production.yaml up -d --no-build --wait web worker caddy
```

Gunakan runner untuk deployment normal agar urutan migration, seed, dan startup tetap konsisten.

## Konfigurasi environment

| Variabel              | Keterangan                                                  |
| --------------------- | ----------------------------------------------------------- |
| `NODE_ENV`            | `development`, `test`, atau `production`                    |
| `APP_URL`             | Origin lengkap aplikasi, misalnya `https://app.example.com` |
| `APP_DOMAIN`          | Hostname aplikasi untuk Caddy, tanpa skema                  |
| `S3_DOMAIN`           | Hostname publik MinIO untuk Caddy                           |
| `ACME_EMAIL`          | Email pendaftaran sertifikat TLS Caddy                      |
| `DATABASE_URL`        | Connection string PostgreSQL/PostGIS                        |
| `POSTGRES_DB`         | Nama database PostgreSQL production                         |
| `POSTGRES_USER`       | Pengguna PostgreSQL production                              |
| `POSTGRES_PASSWORD`   | Password PostgreSQL production                              |
| `REDIS_URL`           | Connection string Redis                                     |
| `REDIS_PASSWORD`      | Password Redis production                                   |
| `AUTH_SECRET`         | Secret session, minimal 32 karakter                         |
| `SESSION_TTL_SECONDS` | Durasi session dalam detik; default `28800`                 |
| `S3_ENDPOINT`         | Endpoint internal yang digunakan server/worker              |
| `S3_PUBLIC_ENDPOINT`  | Endpoint HTTPS yang digunakan untuk signed URL browser      |
| `S3_REGION`           | Region S3; default `ap-southeast-1`                         |
| `S3_BUCKET`           | Nama bucket object storage                                  |
| `S3_ACCESS_KEY`       | Access key MinIO/S3                                         |
| `S3_SECRET_KEY`       | Secret key MinIO/S3                                         |
| `S3_FORCE_PATH_STYLE` | Gunakan `true` untuk MinIO                                  |
| `LOG_LEVEL`           | Level log Pino                                              |
| `ADMIN_EMAIL`         | Email akun Admin awal                                       |
| `ADMIN_PASSWORD`      | Password akun Admin, minimal 12 karakter                    |

`S3_ENDPOINT` dan `S3_PUBLIC_ENDPOINT` sengaja dipisahkan. Container memakai alamat internal `http://minio:9000`, sedangkan browser memakai domain HTTPS seperti `https://storage.app.example.com`.

## Script npm

| Perintah                                | Fungsi                                               |
| --------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                           | Menjalankan Next.js development server               |
| `npm run build`                         | Membuat build production                             |
| `npm start`                             | Menjalankan hasil build production                   |
| `npm run worker`                        | Menjalankan worker DXF                               |
| `npm run db:migrate`                    | Menjalankan migration database yang belum diterapkan |
| `npm run db:seed-admin`                 | Membuat atau memperbarui Admin awal                  |
| `npm run check`                         | Typecheck, lint, dan unit test                       |
| `npm run typecheck`                     | Pemeriksaan TypeScript                               |
| `npm run lint`                          | Pemeriksaan ESLint                                   |
| `npm test`                              | Menjalankan test Vitest                              |
| `npm run test:integration`              | Menjalankan integration test database                |
| `npm run smoke:all`                     | Menjalankan smoke suite Docker                       |
| `npm run smoke:e2e`                     | Menjalankan critical-flow smoke test                 |
| `npm run smoke:deployment`              | Menjalankan deployment smoke test                    |
| `npm run test:security`                 | Menjalankan security smoke test                      |
| `npm run test:load`                     | Menjalankan load test                                |
| `npm run import:assets -- file.xlsx`    | Mengimpor aset dari XLSX                             |
| `npm run reconcile:assets -- file.xlsx` | Membandingkan workbook dengan database               |
| `npm run validate:dxf -- file.dxf`      | Memvalidasi file DXF                                 |

Script berbasis `tsx` tidak otomatis membaca `.env`. Export environment terlebih dahulu ketika menjalankannya secara manual:

```bash
set -a
. ./.env
set +a
npm run db:migrate
```

## Backup dan restore

Untuk development atau database eksternal yang dapat dijangkau dari host, gunakan script repository dengan `DATABASE_URL` yang sesuai:

```bash
set -a
. ./.env
set +a
bash scripts/backup.sh /absolute/path/backups
```

Pada stack production VPS, PostgreSQL hanya tersedia di jaringan Docker. Buat backup melalui container:

```bash
mkdir -p /absolute/path/backups
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres \
  pg_dump -U xasset -d xasset --format=custom > /absolute/path/backups/xasset.dump
sha256sum /absolute/path/backups/xasset.dump > /absolute/path/backups/xasset.dump.sha256
```

Pastikan file backup dapat dibaca dan uji restore pada environment staging sebelum membutuhkannya untuk insiden. Jangan melakukan restore langsung ke production tanpa backup terbaru dan target database yang telah diverifikasi. Backup database tidak menggantikan backup volume MinIO; aktifkan versioning atau replikasi object storage dan simpan salinan di luar VPS.

## Keamanan production

- PostgreSQL, Redis, dan MinIO tidak dipublikasikan langsung oleh Compose production.
- Caddy menjadi satu-satunya entry point pada port `80` dan `443`.
- Session production menggunakan cookie HTTP-only dan secure.
- Password disimpan menggunakan scrypt.
- Mutasi API memvalidasi origin/CSRF.
- Login memiliki rate limiting.
- Upload memakai signed URL serta validasi MIME/signature.
- Log meredaksi password, authorization, cookie, secret, dan token.
- Perubahan penting dicatat di audit log.
- Secret tersimpan di `.env.production` yang diabaikan Git dan dibuat dengan permission `600`.

Untuk hardening lanjutan, gunakan firewall, backup off-site, monitoring, alerting, dan rotasi secret berkala. Lihat [operations runbook](docs/operations.md) dan [go-live checklist](docs/go-live-checklist.md).

## Struktur repository

```text
db/migrations/       Migration PostgreSQL/PostGIS
deploy/              Konfigurasi reverse proxy Caddy
docs/                Runbook dan panduan operasional
public/              Asset publik; runtime Cesium dihasilkan otomatis
scripts/             Migration, seed, backup, smoke test, import, dan utility
src/app/             Next.js pages dan route handlers
src/components/      Dashboard, peta, modal, dan komponen UI
src/lib/             Parser XLSX/DXF, koordinat, status, dan tipe domain
src/server/          Database, auth, storage, schema, audit, dan service
src/worker/          Background worker DXF
```

## Kontribusi dan merge

Sebelum membuat pull request:

```bash
npm ci
npm run check
npm run build
```

Pastikan juga:

- Tidak ada marker konflik Git seperti `<<<<<<<`, `=======`, atau `>>>>>>>`.
- `.env`, `.env.production`, backup, workbook produksi, dan file DXF produksi tidak ikut di-commit.
- Migration yang sudah diterapkan tidak diubah lagi; tambahkan migration baru untuk perubahan schema berikutnya.
- Perubahan deployment diuji dengan `docker compose config`.

Ikuti [CONTRIBUTING.md](CONTRIBUTING.md) untuk konvensi branch, commit, dan pull request.
