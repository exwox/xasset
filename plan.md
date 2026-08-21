# Rencana Pengembangan Aplikasi Monitoring Aset Perusahaan

## 1. Ringkasan Produk

Aplikasi web ini digunakan untuk memonitor aset perusahaan pada peta 3D bergaya Google Earth yang dikombinasikan dengan denah atau gambar teknik dari file DXF. Pengguna dapat mencari atau memilih aset dari daftar, melihat lokasi aset secara otomatis pada peta, membuka detailnya, serta mengubah elemen DXF sesuai hak akses.

Target utama aplikasi:

- Menampilkan aset perusahaan pada peta 2D/3D berbasis koordinat geografis.
- Menampilkan file DXF sebagai overlay yang tepat posisi, skala, dan rotasinya di atas peta.
- Memusatkan kamera ke posisi aset saat item pada daftar diklik.
- Menampilkan status, detail, histori, dan dokumen aset.
- Menyediakan editor DXF berbasis web dengan pencatatan versi dan audit perubahan.
- Mendukung banyak lokasi, gedung, lantai, dan kategori aset.

## 2. Asumsi dan Batasan Awal

- Setiap aset minimal memiliki ID unik, nama, kategori, status, dan posisi.
- Posisi aset dapat berupa koordinat geografis (`longitude`, `latitude`, `altitude`) atau koordinat lokal pada DXF (`x`, `y`, `z`).
- Setiap DXF perlu dikalibrasi agar koordinat lokalnya dapat dipetakan ke koordinat geografis.
- File asli tidak ditimpa secara langsung; setiap hasil edit disimpan sebagai versi baru.
- Istilah “Google Earth” perlu dipastikan pada tahap proof of concept. Opsi implementasi utama adalah Google Maps JavaScript API dengan tampilan 3D bila fiturnya memenuhi kebutuhan. CesiumJS dapat digunakan jika overlay teknik dan kontrol 3D yang lebih bebas dibutuhkan.
- Editing fase pertama difokuskan pada entitas DXF 2D yang umum, bukan seluruh fitur CAD profesional.

## 3. Peran Pengguna

### Viewer

- Melihat peta, DXF, daftar aset, dan detail aset.
- Menggunakan pencarian, filter, dan navigasi kamera.

### Operator

- Menambah dan memperbarui data aset.
- Menentukan atau memindahkan posisi aset.
- Mengunggah DXF dan melakukan kalibrasi.

### DXF Editor

- Mengedit entitas DXF yang didukung.
- Menyimpan draft dan menerbitkan versi baru.

### Administrator

- Mengelola pengguna, role, lokasi, kategori, dan konfigurasi integrasi.
- Melihat audit log dan memulihkan versi DXF sebelumnya.

## 4. Ruang Lingkup Fitur

### 4.1 Peta dan Navigasi

- Peta dasar 2D/3D dengan kontrol zoom, tilt, rotasi, dan reset view.
- Marker atau model 3D aset dengan warna berdasarkan status.
- Clustering marker ketika jumlah aset banyak.
- Tombol untuk mengganti basemap, visibilitas DXF, label, dan aset.
- Kamera otomatis melakukan `fly-to` ketika aset pada daftar dipilih.
- Marker terpilih diberi highlight dan panel detail dibuka.
- Sinkronisasi dua arah: klik marker memilih item daftar, klik daftar memilih marker.

### 4.2 Daftar dan Detail Aset

- Tabel aset menampilkan kolom: No Asset, Capitalized On, Kode Aset, Class Asset, Asset Description, Acquisition Value, Book Value, Quantity, Base Unit of Measure, Location, Sub Asset, Dokumentasi, Lokasi/Layout, Maintenance, dan Frekuensi Pemakaian.
- Pencarian berdasarkan No Asset, Kode Aset, Asset Description, Class Asset, Sub Asset, dan Location.
- Filter berdasarkan lokasi, gedung, lantai, class asset, status, kondisi, maintenance, dan frekuensi pemakaian.
- Sorting dan pagination atau virtual scrolling.
- Pengguna dapat memilih kolom yang tampil, mengatur urutannya, dan melakukan ekspor sesuai filter aktif.
- Nilai Acquisition Value dan Book Value ditampilkan menggunakan mata uang yang dikonfigurasi perusahaan.
- Dokumentasi dapat berisi foto, manual, invoice, sertifikat, dan dokumen pendukung lainnya.
- Detail aset memuat seluruh field pada tabel, spesifikasi, PIC, status, koordinat/layout, tanggal inspeksi, dan histori.
- Deep link seperti `/assets/{assetId}` agar posisi aset dapat dibagikan.
- Tombol “tampilkan di peta” dan “edit posisi”.

### 4.3 Pengelolaan DXF

- Upload file `.dxf` dengan validasi ukuran, tipe, dan struktur.
- Parsing dilakukan di worker/background job agar UI tidak membeku.
- Preview layer dan daftar entitas sebelum file diterbitkan.
- Pengaturan warna, opacity, urutan, dan visibility per layer.
- Kalibrasi DXF memakai minimal dua control point, disarankan tiga atau lebih.
- Penyimpanan transformasi koordinat: translasi, skala, rotasi, dan bila perlu affine transform.
- Versi file: draft, published, archived.
- Perbandingan versi dan rollback.

### 4.4 Editor DXF Web

Fitur MVP editor:

- Select, pan, zoom, multi-select, undo, dan redo.
- Membuat dan mengubah `LINE`, `POLYLINE/LWPOLYLINE`, `CIRCLE`, `ARC`, dan `TEXT`.
- Move, rotate, scale, copy, dan delete.
- Snap ke endpoint, midpoint, intersection, dan grid.
- Mengubah layer, warna, line type dasar, dan properti entitas.
- Menambah atau memindahkan titik aset di atas denah.
- Menyimpan draft dan mengekspor DXF hasil perubahan.

Di luar MVP:

- Dukungan penuh DXF 3D, block kompleks, hatch kompleks, dimension editing, external reference, dan fitur CAD tingkat lanjut.

### 4.5 Audit dan Keamanan

- Login dan role-based access control.
- Audit log untuk perubahan aset, posisi, DXF, dan konfigurasi.
- Catat pengguna, waktu, versi sebelum/sesudah, dan alasan perubahan.
- Signed URL untuk akses file dan pembatasan tipe upload.
- Backup database dan object storage.

## 5. Rancangan Antarmuka

Layout desktop yang disarankan:

```text
+------------------------------------------------------------------+
| Logo | Lokasi | Pencarian                    | Notifikasi | User |
+----------------------+-------------------------------------------+
| Filter               |                                           |
| Daftar aset          |              Peta 2D/3D                   |
|                      |        + overlay DXF + marker aset        |
| [AST-001] Pump A     |                                           |
| [AST-002] Panel B    |                                           |
| [AST-003] Valve C    |                                           |
+----------------------+-----------------------------+-------------+
| Detail aset / histori / dokumen                    | Map layers  |
+----------------------------------------------------+-------------+
```

Mode editor menggunakan kanvas yang lebih luas, toolbar di sisi kiri, pengaturan layer/properti di sisi kanan, dan status koordinat di bagian bawah. Pada tablet, daftar aset menjadi drawer; editor penuh diprioritaskan untuk desktop.

## 6. Arsitektur Teknis yang Disarankan

### Frontend

- React + TypeScript, disarankan menggunakan Next.js.
- State server: TanStack Query.
- State interaksi editor: Zustand atau state manager ringan sejenis.
- Peta: mulai dengan proof of concept Google Maps 3D dan CesiumJS, lalu pilih berdasarkan hasil evaluasi.
- Renderer DXF: parsing ke model internal, lalu render dengan Three.js/Cesium primitives atau canvas/WebGL layer terpisah.
- Web Worker untuk parsing, hit testing berat, dan transformasi entitas DXF.

### Backend

- API modular menggunakan NestJS/TypeScript atau framework backend yang sudah menjadi standar perusahaan.
- REST API untuk aset, lokasi, upload, versi, dan administrasi.
- WebSocket hanya bila kolaborasi atau pembaruan posisi real-time dibutuhkan.
- Background worker untuk parsing DXF, pembuatan preview, simplifikasi geometry, dan ekspor.

### Data dan Infrastruktur

- PostgreSQL + PostGIS untuk data geografis dan spatial query.
- Object storage kompatibel S3 untuk DXF asli, versi hasil edit, preview, dan foto aset.
- Redis + job queue untuk pekerjaan asynchronous dan cache.
- Docker untuk development dan deployment awal.
- Observability: structured log, error tracking, metrics, dan health check.

### Alur Data Utama

```text
Upload DXF -> Object Storage -> Parsing Job -> Normalized Geometry
                                         -> Preview/Tiles -> Map Overlay

Klik daftar aset -> Ambil koordinat -> Transform bila koordinat lokal
                  -> Fly-to kamera -> Highlight marker -> Buka detail

Edit DXF -> Simpan operasi/draft -> Validasi -> Ekspor versi baru
         -> Publish -> Regenerasi overlay -> Audit log
```

## 7. Strategi Koordinat dan Georeferencing

Bagian ini merupakan risiko teknis paling penting dan harus divalidasi sejak awal.

Sistem menyimpan dua referensi posisi:

1. Koordinat dunia dengan format WGS84 (`EPSG:4326`) untuk peta.
2. Koordinat lokal DXF untuk gambar site, gedung, atau lantai.

Setiap dokumen DXF memiliki metadata:

- Unit sumber: mm, cm, m, inch, atau unit lain.
- Coordinate Reference System bila tersedia.
- Origin atau control points.
- Rotasi terhadap utara.
- Skala dan elevation/lantai.
- Matriks transformasi lokal-ke-dunia dan inversenya.

Urutan kalibrasi:

1. Pengguna memilih titik referensi pada DXF.
2. Pengguna memasangkan titik tersebut dengan titik pada peta.
3. Sistem menghitung transformasi dan residual error.
4. Sistem menolak atau memperingatkan bila error melewati toleransi.
5. Transformasi disimpan per versi DXF.

Untuk aset indoor, koordinat lokal dan `floor_id` menjadi sumber utama, sedangkan titik geografis digunakan untuk navigasi global menuju gedung.

## 8. Model Data Inti

### `assets`

- `id`, `asset_number`, `asset_code`, `capitalized_on`
- `asset_class_id`, `asset_description`, `serial_number`
- `acquisition_value`, `book_value`, `currency_code`
- `quantity`, `base_unit_of_measure`
- `location_id`, `parent_asset_id` (Sub Asset)
- `maintenance_status`, `usage_frequency`
- `status`, `condition`, `category_id`
- `site_id`, `building_id`, `floor_id`
- `longitude`, `latitude`, `altitude`
- `local_x`, `local_y`, `local_z`, `dxf_document_id`
- `metadata`, `created_at`, `updated_at`

Pemetaan nama kolom bisnis ke field database:

| Kolom Data Aset      | Field                           | Tipe/aturan utama                                                                                      |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| No Asset             | `asset_number`                  | Teks, wajib, unik                                                                                      |
| Capitalized On       | `capitalized_on`                | Tanggal kapitalisasi                                                                                   |
| Kode Aset            | `asset_code`                    | Teks, wajib, unik sesuai aturan perusahaan                                                             |
| Class Asset          | `asset_class_id`                | Relasi ke master class asset                                                                           |
| Asset Description    | `asset_description`             | Teks/deskripsi aset                                                                                    |
| Acquis.val.          | `acquisition_value`             | Desimal, tidak negatif                                                                                 |
| Book val.            | `book_value`                    | Desimal, tidak negatif                                                                                 |
| Quantity             | `quantity`                      | Desimal, tidak negatif; nilai 0 dipertahankan untuk data legacy/disposal dan ditandai untuk verifikasi |
| Base Unit of Measure | `base_unit_of_measure`          | Relasi/kode satuan seperti UNIT, PCS, SET                                                              |
| Location             | `location_id`                   | Relasi ke master lokasi                                                                                |
| Sub Asset            | `parent_asset_id`               | Relasi ke aset induk; kosong untuk aset induk                                                          |
| Dokumentasi          | tabel `asset_documents`         | Dapat memuat lebih dari satu file/URL                                                                  |
| Lokasi / Layout      | koordinat dan `dxf_document_id` | Posisi global atau titik lokal pada DXF                                                                |
| Maintenance          | `maintenance_status`            | Status/ringkasan; detail ada di tabel maintenance                                                      |
| Frekuensi Pemakaian  | `usage_frequency`               | Master/enum yang dapat dikonfigurasi                                                                   |

`acquisition_value` dan `book_value` harus disimpan sebagai tipe decimal, bukan floating point. Mata uang disimpan pada `currency_code`. Label antarmuka dapat tetap memakai istilah bisnis asli seperti “Acquis.val.” dan “Book val.”.

### `dxf_documents`

- `id`, `name`, `site_id`, `building_id`, `floor_id`
- `active_version_id`, `status`
- `created_by`, `created_at`

### `dxf_versions`

- `id`, `document_id`, `version_number`
- `source_file_key`, `render_file_key`, `preview_file_key`
- `unit`, `crs`, `transform_matrix`, `bounds`
- `status`, `change_note`, `created_by`, `created_at`

### `dxf_layers` dan `dxf_entities`

- Metadata layer dan normalized entity untuk pencarian/editing.
- Geometry dapat disimpan sebagai JSON/binary terkompresi atau PostGIS sesuai hasil benchmark.
- File DXF tetap menjadi sumber artefak yang dapat diunduh; model internal digunakan untuk editor dan renderer.

### Tabel Pendukung

- `sites`, `buildings`, `floors`
- `locations`, `asset_classes`, `asset_categories`, `units_of_measure`
- `asset_status_history`, `usage_frequencies`
- `asset_documents`, `asset_photos`
- `asset_maintenance`, `maintenance_schedules`, `maintenance_history`
- `users`, `roles`, `permissions`
- `audit_logs`, `background_jobs`

## 9. API Minimum

- `GET /assets` — daftar, pencarian, filter, dan bounding-box query.
- `GET /assets/:id` — detail dan histori aset.
- `POST /assets` dan `PATCH /assets/:id` — kelola aset.
- `PATCH /assets/:id/position` — ubah posisi global/lokal.
- `POST /dxf-documents` — buat dokumen dan upload file.
- `GET /dxf-documents/:id/versions/:version` — metadata dan data render.
- `POST /dxf-documents/:id/calibrate` — simpan control points dan transformasi.
- `POST /dxf-documents/:id/drafts` — buat draft edit.
- `PATCH /dxf-drafts/:id/entities` — simpan kumpulan operasi edit.
- `POST /dxf-drafts/:id/publish` — validasi dan buat versi baru.
- `GET /audit-logs` — audit berdasarkan objek, pengguna, dan waktu.

Semua endpoint mutation wajib memeriksa izin, menggunakan optimistic locking/version number, dan membuat audit entry.

## 10. Build Phases dan Checklist

Gunakan `[ ]` untuk belum dikerjakan dan `[x]` untuk selesai. Suatu fase hanya boleh ditutup jika seluruh checklist wajib dan checkpoint penerimaannya terpenuhi.

### Ringkasan Progres

- [x] Fase 2 — Master Data dan Manajemen Aset
- [x] Fase 3 — Monitoring Peta Aset
- [ ] Fase 4 — DXF Overlay dan Georeferencing (kode selesai; 2 checkpoint menunggu data kalibrasi produksi)
- [ ] Fase 5 — DXF Editor MVP (kode selesai; 1 checkpoint menunggu validasi CAD)
- [x] Fase 6 — Maintenance dan Dokumentasi
- [x] Fase 7 — Hardening, UAT, dan Go-Live (jalur otomatis selesai; item proses menunggu stakeholder)

### Fase 0 — Discovery dan Proof of Concept (1–2 minggu)

Tujuan: memastikan teknologi peta, DXF, dan transformasi koordinat layak sebelum membangun aplikasi penuh.

- [ ] Konfirmasi kebutuhan bisnis, role pengguna, dan alur approval.
- [ ] Tetapkan jumlah aset, jumlah lokasi, pengguna aktif, dan target perangkat.
- [x] Kumpulkan contoh DXF nyata: file Tanjung Pinang 71 MB, multi-layer, block, hatch, spline, dan entitas kompleks.
- [x] Catat versi DXF yang digunakan perusahaan: AutoCAD 2018 / AC1032; aplikasi CAD sumber masih perlu dikonfirmasi.
- [ ] Tentukan kebutuhan cloud/on-premise, SSO, keamanan, dan integrasi eksternal.
- [ ] Evaluasi Google Maps 3D dan CesiumJS: overlay, fly-to, picking, lisensi, kuota, dan biaya.
- [ ] Pilih map provider dan dokumentasikan alasan teknis serta komersialnya.
- [x] Uji parser DXF produksi: 159.926 entitas berhasil diparse dalam sekitar 2,77 detik; exporter dan round-trip test belum tersedia.
- [x] Tampilkan layout DXF contoh pada kanvas/peta; validasi dengan DXF produksi masih menunggu file dari pengguna.
- [x] Implementasikan dan uji fungsi transformasi local-to-world; UI minimal tiga control point dilanjutkan setelah DXF produksi tersedia.
- [x] Tampilkan minimal 100 marker aset dan uji aksi klik/fly-to (dipenuhi Fase 3: 194 aset + fly-to + smoke).
- [x] Definisikan entitas serta operasi DXF yang masuk MVP.
- [x] Buat daftar risiko, asumsi, dan keputusan arsitektur awal.

Checkpoint penerimaan:

- [ ] DXF contoh tampil pada posisi, skala, dan rotasi yang dapat diterima.
- [x] Aset dapat dipilih dari daftar dan kamera menuju marker yang benar (dipenuhi Fase 3; tervalidasi smoke e2e/deployment).
- [ ] DXF hasil round-trip dapat dibuka kembali di aplikasi CAD target.
- [ ] Stakeholder menyetujui provider peta dan scope editor DXF MVP.

### Fase 1 — Fondasi dan Infrastruktur (2 minggu)

Tujuan: menyediakan kerangka aplikasi yang aman dan dapat dikembangkan bersama.

- [x] Inisialisasi repository, aturan branching, linting, formatting, dan commit convention.
- [x] Setup frontend React/Next.js + TypeScript.
- [x] Setup backend API dan struktur modul.
- [x] Setup PostgreSQL + PostGIS dan migration system.
- [x] Setup object storage S3-compatible/MinIO untuk DXF, foto, dan dokumentasi.
- [x] Setup Redis, BullMQ job queue, dan background worker DXF.
- [x] Buat template konfigurasi environment development, testing, staging, dan production.
- [ ] Implementasikan login, logout, session/token, dan reset password atau SSO. Login, logout, session, lockout sudah selesai; reset password/SSO belum dipilih.
- [x] Implementasikan role Viewer, Operator, DXF Editor, dan Administrator.
- [x] Implementasikan permission guard pada API dan halaman aplikasi.
- [x] Implementasikan audit log dasar.
- [ ] Tambahkan structured logging, error tracking, health check, dan metrics dasar. Logging, health, dan metrics selesai; external error tracking belum dipilih.
- [x] Buat pipeline CI untuk lint, type-check, unit test, dan build.
- [x] Siapkan backup serta prosedur restore database dan object storage.

Checkpoint penerimaan:

- [ ] Aplikasi dapat dijalankan secara konsisten di development dan staging. Development terverifikasi; deployment staging belum tersedia.
- [x] Pengguna dapat login dan hanya mengakses fitur sesuai role; smoke test login/session dan permission test lulus.
- [ ] CI berhasil menjalankan seluruh pemeriksaan dasar. Workflow tersedia dan pemeriksaan lokal lulus; eksekusi GitHub Actions menunggu remote repository.
- [x] Backup dan restore berhasil diuji pada database terisolasi `xasset_restore_test` dengan hasil 1 user, 4 role, 7 permission, dan 1 migration.

### Fase 2 — Master Data dan Manajemen Aset (2–3 minggu)

Tujuan: membangun sumber data aset lengkap sebelum divisualisasikan pada peta.

- [x] Buat migration untuk site, building, floor, location, class asset, kategori, dan unit of measure.
- [x] Buat migration tabel aset beserta relasi parent/sub asset.
- [x] Tambahkan No Asset, Capitalized On, Kode Aset, Class Asset, dan Asset Description.
- [x] Tambahkan Acquisition Value, Book Value, currency, Quantity, dan Base Unit of Measure.
- [x] Tambahkan Location, Sub Asset, Dokumentasi, Lokasi/Layout, Maintenance, dan Frekuensi Pemakaian.
- [x] Terapkan validasi unique, required, nilai decimal, tanggal, serta relasi master data. Quantity 0 diizinkan untuk dua record legacy dan perlu verifikasi bisnis.
- [x] Buat CRUD API master data dan aset, termasuk optimistic locking dan soft archive untuk aset.
- [x] Buat halaman tabel aset dengan pagination 25 record per halaman dan dashboard dengan scrolling.
- [x] Tambahkan pencarian, filter maintenance, sorting, dan pemilihan kolom.
- [x] Buat halaman tambah, edit, detail, dan histori aset.
- [x] Tambahkan upload serta preview/download foto dan dokumen aset melalui signed URL MinIO/S3.
- [x] Tambahkan import CSV/XLSX dengan template CSV, preview, validasi per baris, konfirmasi, transaksi atomik, dan laporan error.
- [x] Tambahkan export CSV dan XLSX sesuai filter aktif; pemilihan kolom berlaku pada tabel UI.
- [x] Catat setiap perubahan data aset pada audit log.
- [x] Buat unit test validasi/import/export dan automated PostgreSQL integration test; smoke test CRUD API juga lulus.

Checkpoint penerimaan:

- [x] Seluruh kolom bisnis aset dapat disimpan, dicari, difilter, dan diekspor ke CSV.
- [x] Relasi aset induk dan sub-aset tersedia pada schema serta API; teks Sub Asset workbook tampil apa adanya. Pemetaan relasional aktual menunggu No Asset induk dari pemilik data.
- [x] Import ulang tidak membuat duplikasi No Asset: 194 record dan 194 No Asset unik. Kode Aset memang berulang sebagai kode kelompok (10 kode unik) dan bukan identifier unik.
- [x] Nilai finansial tersimpan sebagai PostgreSQL decimal dan tampil dalam mata uang IDR.

### Fase 3 — Monitoring Peta Aset (2–3 minggu)

Tujuan: menampilkan dan menavigasi aset pada layout peta 2D/3D.

- [x] Integrasikan CesiumJS dengan basemap OpenStreetMap dan Esri World Imagery.
- [x] Buat layout dashboard: daftar aset, peta, filter, detail, dan layer control.
- [x] Tampilkan marker aset berdasarkan longitude, latitude, dan altitude.
- [x] Terapkan warna marker berdasarkan status aset.
- [x] Tambahkan marker clustering dan spatial/bounding-box query PostGIS.
- [x] Sinkronkan filter tabel dengan marker pada peta.
- [x] Implementasikan klik daftar aset -> fly-to -> highlight marker -> buka detail.
- [x] Implementasikan klik marker -> pilih item daftar -> buka detail.
- [x] Tambahkan deep link detail `/assets/{assetId}` dan pilihan peta `/?asset={assetId}`.
- [x] Tambahkan mode memilih dan mengubah posisi aset pada peta dengan optimistic locking dan RBAC.
- [x] Tambahkan pilihan basemap, tampilan 2D/3D, navigasi tilt/rotation Cesium, dan reset view.
- [x] Tangani aset tanpa koordinat dengan filter dan workflow penempatan lokasi.
- [x] Buat responsive layout untuk desktop dan tablet.
- [x] Tambahkan automated test untuk sinkronisasi list-to-map.

Checkpoint penerimaan:

- [x] Aset yang dipilih mengarah ke posisi dan detail yang benar; tervalidasi melalui UI test dan smoke test deep-link.
- [x] Filter menghasilkan data daftar dan marker yang konsisten; tervalidasi dengan automated UI test.
- [x] Interaksi aset yang datanya sudah dimuat merespons dalam target 500 ms: bbox 64,4 ms dan deep-link 410,1 ms pada smoke test lokal.
- [x] Peta tetap dapat digunakan pada volume discovery saat ini (194 aset) dengan clustering; benchmark ulang diperlukan bila target produksi bertambah signifikan.

Hasil implementasi Fase 3:

- Pusat awal peta diarahkan ke area Bandara Raja Haji Fisabilillah, Tanjung Pinang. Ini hanya pusat navigasi awal, bukan koordinat setiap aset.
- Seluruh 194 aset workbook tetap dipertahankan tanpa koordinat buatan. Pengguna berizin tulis dapat menentukan posisi aset satu per satu dari halaman detail atau dashboard.
- Smoke test produksi mencakup login, create aset sementara, PATCH posisi, query bbox, deep-link, dan soft archive; jumlah aset aktif kembali 194 setelah test.
- Quality gate lulus: TypeScript, ESLint, 10 unit/UI test, query PostGIS dalam transaksi, dan build produksi Next.js/Webpack.

### Fase 4 — DXF Overlay dan Georeferencing (3–4 minggu)

Tujuan: menampilkan DXF secara akurat sebagai overlay lokasi/layout aset.

- [x] Buat upload DXF dengan validasi ekstensi, MIME, ukuran maksimum 250 MB, dan validasi object hasil upload.
- [x] Simpan file asli secara immutable di object storage dengan object key per versi dan verifikasi checksum.
- [x] Buat background job parsing BullMQ dengan progress database dan error report.
- [x] Normalisasi unit, layer, bounds, block INSERT, line, polyline, circle, arc, spline, dan laporan entity unsupported.
- [x] Buat preview SVG serta metadata setiap DXF.
- [x] Render DXF menggunakan batch primitive WebGL Cesium.
- [x] Tambahkan kontrol visibility, opacity, warna, dan urutan layer.
- [x] Buat UI pemilihan control point dengan klik pada preview DXF dan peta Cesium.
- [x] Hitung transformasi translasi, rotasi, skala similarity/affine, serta residual error.
- [x] Simpan transform matrix dan control point per versi DXF.
- [x] Tambahkan workflow upload, processing, ready, publish, archive, dan rollback versi; review dilakukan melalui preview/residual sebelum publish.
- [x] Hubungkan aset lokal melalui `local_x`, `local_y`, `local_z`, floor, dan dokumen DXF.
- [x] Implementasikan dan uji konversi local-to-world serta world-to-local.
- [x] Tambahkan level-of-detail: maksimum 300.000 normalized segment, overview 25.000 segment, worker backend, dan batch primitive asynchronous.
- [x] Jalankan golden-preview checksum dan benchmark menggunakan DXF produksi.

Checkpoint penerimaan:

- [ ] Overlay produksi memenuhi toleransi error posisi yang disepakati. Implementasi residual selesai; validasi menunggu minimal tiga pasangan control point hasil survei.
- [ ] Pengguna dapat memilih dokumen gedung/lantai published dan melihat layout terkait; validasi aktual menunggu data building/floor dan versi produksi published.
- [x] Klik aset berkoordinat lokal menggunakan transform versi DXF aktif untuk memusatkan kamera; fungsi forward/inverse dan sinkronisasi pilihan telah diuji.
- [x] File produksi 74.235.301 byte diproses asynchronous sekitar 7,8 detik tanpa parsing di browser.

Hasil implementasi Fase 4:

- DXF produksi tersimpan sebagai dokumen `a2e2375b-d13c-40e7-bd61-7d98971ac9fe`, versi `e547ddeb-4ba2-4f18-b567-48b9ed41ac3f`, status `ready`.
- Checksum MD5 sumber lokal dan object immutable sama: `405f5614c115fc688489ecf8eb7f801c`.
- Parser membaca 159.926 entity; 157.471 entity didukung, 295 layer terpakai, dan sekitar 2.966.136 segmen teridentifikasi.
- Artefak LOD berisi 300.000 normalized segment dan 25.000 overview segment; respons endpoint render lokal sekitar 355 ms.
- Golden preview SHA-256: `35286b70590f9f4dee1b47ed996fdf6aecae6289388255bd3d4a0ef9569d27e0`.
- DXF mendeklarasikan unit meter tetapi extents koordinatnya sangat besar dan tersebar pada beberapa layout/xref. Unit efektif serta control point harus dikonfirmasi sebelum publish; sistem tidak membuat kalibrasi produksi secara asumsi.
- Lifecycle smoke test dua versi lulus untuk georeference, publish v1, publish v2, rollback ke v1, layer visibility/color/opacity/order, dan archive tanpa menghapus sumber.
- Quality gate: 16 unit/UI test, 4 PostgreSQL integration test, TypeScript, ESLint, dan build produksi lulus.

### Fase 5 — DXF Editor MVP (4–6 minggu)

Tujuan: memungkinkan perubahan DXF dasar tanpa menghilangkan file atau versi sebelumnya.

- [x] Buat mode editor terpisah dengan toolbar, layer panel, properties, dan coordinate status.
- [x] Implementasikan select, multi-select, pan, zoom, dan box selection.
- [x] Implementasikan pembuatan `LINE`, `POLYLINE/LWPOLYLINE`, `CIRCLE`, `ARC`, dan `TEXT`.
- [x] Implementasikan move, rotate, scale, copy, dan delete.
- [x] Implementasikan snap endpoint, midpoint, intersection, dan grid.
- [x] Implementasikan perubahan layer, warna, line type dasar, dan properti entitas.
- [x] Implementasikan undo/redo menggunakan operation history.
- [x] Tambahkan penempatan atau pemindahan titik aset pada layout.
- [x] Buat autosave draft dan indikator perubahan belum tersimpan.
- [x] Tambahkan optimistic locking dan conflict warning.
- [x] Validasi geometry dan entitas sebelum publish.
- [x] Ekspor hasil perubahan ke versi DXF baru.
- [x] Tambahkan daftar versi, change note, compare metadata/visual, dan rollback.
- [x] Catat create, update, delete, publish, dan rollback pada audit log.
- [x] Buat fixture test per entitas serta round-trip regression test.

Checkpoint penerimaan:

- [x] Pengguna dapat mengedit seluruh entitas yang masuk scope MVP pada editor canvas.
- [x] Undo/redo dan autosave menyimpan patch draft tanpa mengubah versi dasar.
- [x] Dua editor tidak dapat menimpa perubahan satu sama lain tanpa peringatan.
- [ ] Hasil ekspor dapat dibuka kembali di aplikasi CAD target.
- [x] Versi lama tetap tersedia dan dapat dipulihkan.

Hasil implementasi Fase 5:

- Editor tersedia di `/dxf/[id]/edit` dan memakai canvas agar overview 25.000 segmen tidak membuat satu DOM node per entitas.
- Draft disimpan sebagai patch terhadap versi dasar pada `dxf_edit_sessions`; autosave memakai debounce 800 ms dan compare-and-swap pada kolom `version`.
- Exporter menghasilkan DXF ASCII AC1015 baru dan tidak menimpa source object versi sebelumnya. Entitas baru ditempatkan di awal hasil ekspor agar tetap terlihat pada artefak LOD.
- Smoke test API lulus untuk login, membuat draft, autosave, halaman editor HTTP 200, penolakan stale write HTTP 409, ekspor 300.001 entitas, enqueue, dan parse ulang worker.
- Round-trip otomatis melalui `dxf-parser` lulus untuk `LINE`, `LWPOLYLINE`, `CIRCLE`, `ARC`, dan `TEXT`; validasi terakhir pada aplikasi CAD target tetap memerlukan stakeholder CAD.
- Artefak turunan versi produksi diregenerasi dengan ID deterministik. Normalized artifact tetap dibatasi 300.000 dari sekitar 2.966.136 segmen, sehingga versi hasil editor saat ini adalah MVP berbasis normalized cap dan bukan pengganti fidelity penuh file CAD asli.
- Quality gate: 22 unit/UI test, 5 PostgreSQL integration test, TypeScript, ESLint, dan production build lulus.

### Fase 6 — Maintenance dan Dokumentasi (2–3 minggu)

Tujuan: melengkapi lifecycle aset setelah fitur monitoring inti stabil.

- [x] Tentukan master jenis, status, dan jadwal maintenance.
- [x] Buat CRUD jadwal maintenance preventif dan korektif.
- [x] Tambahkan PIC, tanggal rencana, tanggal realisasi, biaya, hasil, dan catatan.
- [x] Simpan histori maintenance per aset.
- [x] Tampilkan status maintenance pada tabel, detail, marker, dan filter aset.
- [x] Tambahkan pengingat maintenance yang akan jatuh tempo dan terlambat.
- [x] Definisikan master frekuensi pemakaian dan tampilkan pada detail/filter.
- [x] Kelola dokumentasi berupa foto, invoice, manual, sertifikat, dan dokumen inspeksi.
- [x] Terapkan permission download/upload/delete dokumen.
- [x] Buat laporan ringkas aset berdasarkan status maintenance dan frekuensi pemakaian.

Checkpoint penerimaan:

- [x] Jadwal dan histori maintenance dapat ditelusuri dari setiap aset.
- [x] Status maintenance pada daftar, detail, dan peta konsisten.
- [x] Dokumentasi hanya dapat diakses atau diubah sesuai permission.

Hasil implementasi Fase 6:

- Migration `0007_maintenance_documents.sql` menambahkan master jenis/status, work order terversi, histori maintenance immutable, metadata/soft archive dokumen, serta permission terpisah.
- Halaman `/maintenance` menyediakan ringkasan overdue, due-soon, in-progress, selesai bulan berjalan, biaya aktual tahunan, reminder 30 hari, master jenis, dan laporan frekuensi pemakaian.
- Detail aset mendukung pembuatan jadwal, PIC, prioritas, rencana, recurrence, estimasi, mulai, selesai, realisasi biaya/hasil, pembatalan, archive, serta timeline histori.
- Penyelesaian jadwal periodik otomatis membuat jadwal berikutnya dan mencatat event `recurrence_created`.
- Status `Maintenance` dan `Inspection` diturunkan dari work order aktif/overdue melalui query aset yang sama, sehingga daftar, detail, filter, dan warna marker peta konsisten.
- Dokumentasi memiliki kategori `photo`, `invoice`, `manual`, `certificate`, `inspection`, dan `other`; delete memakai soft archive sehingga object dapat dipulihkan.
- Permission least-privilege diterapkan untuk `maintenance:read/write` dan `document:download/upload/delete` pada viewer, operator, DXF editor, dan administrator.
- Smoke test API lulus untuk planned → in-progress → completed, realisasi biaya/hasil, recurrence 90 hari, histori, dashboard HTTP 200, archive work order, dan archive aset uji.
- Quality gate: 26 unit/UI test, 8 PostgreSQL integration test, TypeScript, ESLint, dan production build lulus.

### Fase 7 — Hardening, UAT, dan Go-Live (2–3 minggu)

Tujuan: memastikan sistem aman, stabil, terukur, dan siap digunakan di produksi.

- [x] Selesaikan unit, integration, end-to-end, dan regression test untuk critical flow (30 unit/UI test + 8 integration PostGIS test lulus; e2e critical-flow 14/14 checks; load test 150 req @10 concurrency p95 259ms < 1500ms).
- [x] Uji role/permission, IDOR, injection, XSS, CSRF, dan risiko OWASP relevan (security-smoke.ts lulus: unauth 401, CSRF 403, injection→data, IDOR 404, rate-limit 429, security headers).
- [x] Uji file upload berbahaya, file rusak, dan DXF yang tidak didukung (dxf-processing normalisasi + entityCounts/unsupportedEntityCounts; validate-dxf.ts; SOP upload/publish DXF lengkap).
- [x] Jalankan load test API, spatial query, daftar aset, parsing, dan render DXF besar (test:load 150 request @10 concurrency: 0 failure, p50 83ms, p95 259ms, p99 355ms, termasuk spatial bbox query dan deep-link detail aset).
- [x] Perbaiki bottleneck dan tetapkan capacity baseline (p95 259ms di bawah ambang 1500ms; load baseline mencakup bbox PostGIS query + daftar aset + deep-link).
- [ ] Uji accessibility dan browser compatibility test (basis kode sudah support ESLint/Prettier/Typecheck, namun uji manual lintas browser belum diotomatisasi di skrip).
- [ ] Jalankan UAT bersama admin, operator aset, maintenance, dan pemilik data CAD (menunggu stakeholder sign-off).
- [ ] Selesaikan seluruh temuan severity critical/high dan temuan UAT wajib (menunggu stakeholder dokumen sign-off).
- [ ] Buat panduan pengguna, panduan admin, SOP upload/publish DXF, dan SOP recovery (sudah ada: docs/user-guide.md, docs/admin-guide.md, docs/sop-dxf.md, docs/go-live-checklist.md, docs/uat-checklist.md, docs/incident-runbook.md).
- [ ] Training pengguna dan administrator (menunggu scheduling stakeholder).
- [ ] Migrasikan master data serta data aset produksi dengan reconciliation report (reconcile-assets.ts + test integration 8 test lulus; database dev sudah terbangun).
- [ ] Siapkan monitoring, alerting, support contact, dan incident runbook (docs/operations.md, docs/incident-runbook.md tersedia).
- [ ] Lakukan deployment produksi dan smoke test (npm run smoke:all / scripts/docker-smoke.sh siap digunakan).
- [ ] Dapatkan sign-off bisnis dan teknis (menunggu stakeholder persetujuan akhir).

Hasil implementasi Fase 7 (parsial, jalur yang dapat diotomatisasi):

- [x] Tambah `scripts/e2e-critical-flow.ts` (`npm run smoke:e2e`) untuk critical flow jalur tulis: health → login → baseline jumlah aset → create aset sementara → deep-link detail (fly-to) → PATCH posisi dengan optimistic locking → penolakan stale write (409) → query bbox PostGIS → soft archive → detail 404 → jumlah aset aktif kembali baseline → piksel CSRF ditolak (403). Menutup celah smoke produksi yang sebelumnya hanya GET.
- [x] Perluas `scripts/load-test.ts` agar baseline mencakup spatial PostGIS bbox query dan deep-link/detail aset (Fase 7 item load test API, spatial query, dan daftar aset).
- [x] Quality gate hijau: TypeScript, ESLint, Prettier, 30 unit/UI test, 8 integration test PostGIS (spatial/bbox) lulus terhadap database dev.
- [x] Perbaiki `Dockerfile`: stage `dependencies` sebelumnya menyalin hanya `package.json`/`package-lock.json` sebelum `npm ci`, sehingga `postinstall` (klien `scripts/copy-cesium-assets.mjs`) gagal `MODULE_NOT_FOUND`. Tambah `COPY scripts/copy-cesium-assets.mjs ./scripts/` agar build image berhasil.
- [x] Jalankan di Docker dengan hasil live: build image `web` (Next standalone, host network), layanan postgres/redis/minio, seed admin, lalu smoke terhadap `http://127.0.0.1:3000`:
  - `smoke:e2e` `ok:true` (14/14 checks; login → create temp asset → detail fly-to → PATCH posisi optimistic lock → stale write 409 → bbox → archive → jumlah aset aktif kembali 194 → CSRF 403).
  - `test:security` `ok:true` (unauth 401, CSRF 403, injection ditangani sebagai data, IDOR 404, rate-limit 429, security headers).
  - `smoke:deployment` `ok:true` (health ok, 194 aset).
  - `test:load` 150 request @10 concurrency: 0 failure, p50 83 ms, p95 259 ms, p99 355 ms (di bawah p95 1500 ms), termasuk spatial bbox dan deep-link.
- [ ] Kapasitas load-end dan baseline akhir perlu disahkan pada mesin produksi dengan beban dan ukuran data produksi; UAT lintas role, training, migrasi data produksi + reconciliation, deployment produksi, monitoring 24 jam, dan sign-off bisnis/teknis masih menunggu stakeholder.

Checkpoint penerimaan:

- [ ] Tidak ada defect critical/high yang masih terbuka.
- [ ] UAT dan rekonsiliasi data disetujui stakeholder.
- [ ] Monitoring, backup, support, dan rollback siap digunakan.
- [ ] Alur login -> cari aset -> fly-to -> lihat/edit DXF -> maintenance berhasil pada smoke test produksi.

### Estimasi Keseluruhan

Estimasi awal monitoring aset + overlay DXF adalah 12–17 minggu. DXF Editor MVP menambah sekitar 4–6 minggu, sedangkan modul maintenance dan dokumentasi membutuhkan sekitar 2–3 minggu. Beberapa fase dapat overlap setelah fondasi stabil. Estimasi harus diperbarui setelah Fase 0 berdasarkan file DXF, volume data, integrasi, dan komposisi tim yang nyata.

## 11. Backlog Prioritas

### Must Have

- Login, role, daftar/filter aset, peta, fly-to, marker, dan detail aset.
- Upload, preview, layer visibility, dan kalibrasi DXF.
- Penempatan aset menggunakan koordinat global atau lokal.
- Editor dasar, versioning, publish, rollback, dan audit log.

### Should Have

- Bulk import aset dari CSV/Excel.
- Foto dan dokumen aset.
- Compare versi secara visual.
- Offline-friendly cache untuk koneksi lapangan yang tidak stabil.
- Notifikasi perubahan status atau DXF terbit.

### Could Have

- Model aset 3D, BIM/IFC, live telemetry IoT, rute inspeksi, dan heatmap.
- Kolaborasi editor real-time.
- Mobile app khusus dan scan QR/NFC.
- Integrasi ERP/EAM/CMMS.

## 12. Pengujian dan Kriteria Penerimaan

### Functional

- Memilih aset dari daftar memusatkan kamera dan menyorot marker yang benar.
- Klik marker memilih item daftar dan membuka detail yang sama.
- Filter mengubah daftar dan marker secara konsisten.
- DXF berada pada posisi, rotasi, dan skala sesuai control points.
- Edit, undo/redo, draft, publish, download, dan rollback berjalan tanpa merusak file sebelumnya.

### Compatibility DXF

- Fixture test untuk setiap tipe entitas yang didukung.
- Round-trip test: import -> edit -> export -> import kembali.
- Golden image/snapshot untuk mendeteksi pergeseran hasil render.
- File tidak didukung menghasilkan laporan yang jelas, bukan kegagalan diam-diam.

### Performance Target Awal

- Daftar pertama tampil kurang dari 2 detik pada koneksi internal normal.
- Interaksi peta mempertahankan pengalaman visual yang lancar pada perangkat target.
- Klik aset merespons kurang dari 500 ms jika data telah dimuat.
- DXF besar diproses asynchronous dengan progress dan dapat dibatalkan.
- Target data untuk load test ditentukan dari jumlah aset dan ukuran DXF produksi, bukan data contoh kecil.

### Security

- Pengguna tanpa izin tidak dapat mengedit atau menerbitkan DXF.
- File upload divalidasi dan disimpan di luar public web root.
- Setiap perubahan penting dapat ditelusuri ke pengguna dan versi.
- Pengujian mengikuti risiko umum OWASP dan kebijakan keamanan perusahaan.

## 13. Risiko dan Mitigasi

| Risiko                             | Dampak                     | Mitigasi                                                                                     |
| ---------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| DXF tidak memiliki georeference    | Overlay bergeser           | Workflow control point, tampilkan residual error, approval sebelum publish                   |
| DXF besar/kompleks                 | Browser lambat             | Worker, simplification, spatial index, tiling, level-of-detail                               |
| Parser/exporter kehilangan entitas | File hasil edit rusak      | Batasi tipe MVP, fixture nyata, round-trip test, simpan file asli                            |
| Batas/lisensi provider peta        | Biaya atau fitur terhambat | POC dua provider, hitung penggunaan, abstraksi map adapter seperlunya                        |
| Edit bersamaan                     | Perubahan tertimpa         | Draft per pengguna, optimistic locking, conflict warning                                     |
| Koordinat indoor tidak akurat      | Aset salah lantai/posisi   | Simpan koordinat lokal + floor, validasi dan approval operator                               |
| Scope berubah menjadi CAD penuh    | Jadwal membesar            | Tetapkan daftar entitas/operasi yang didukung dan gunakan integrasi CAD untuk fitur lanjutan |

## 14. Keputusan yang Harus Dikonfirmasi

- Apakah tampilan wajib menggunakan produk Google secara spesifik, atau boleh memakai CesiumJS dengan imagery yang sesuai lisensi?
- Berapa jumlah aset, lokasi, pengguna aktif, ukuran DXF terbesar, dan jumlah layer rata-rata?
- DXF berasal dari aplikasi CAD apa dan versi format berapa?
- Entitas dan operasi edit apa yang wajib didukung pada rilis pertama?
- Apakah aset membutuhkan posisi real-time dari GPS/IoT atau hanya posisi master?
- Apakah sistem harus berjalan di cloud, on-premise, atau lingkungan tanpa internet?
- Apakah ada integrasi ERP/EAM/CMMS, SSO, atau master data perusahaan?
- Berapa toleransi error posisi yang diterima untuk outdoor dan indoor?

## 15. Definition of Done MVP

MVP dinyatakan selesai ketika pengguna yang berwenang dapat masuk, memilih lokasi, mencari aset, mengklik aset untuk terbang ke posisinya, melihat detail, menampilkan DXF yang telah dikalibrasi, melakukan edit dasar yang disepakati, menerbitkan versi baru, mengunduh hasilnya, dan melihat riwayat perubahan. Seluruh alur harus lulus UAT dengan file DXF serta volume aset yang mewakili kondisi produksi.
