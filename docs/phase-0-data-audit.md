# Audit Data Fase 0 — Tanjung Pinang

Tanggal audit: 14 Agustus 2026

## Dataset Aset

Sumber: `Daftar Sampel Aset & Kebutuhan Data - Tj. Pinang.xlsx`

- Ukuran file: sekitar 12 MB.
- Worksheet: `Daftar Sampel aset`.
- Jumlah aset: 194 baris data, dari baris 3 sampai 196.
- Shared string: 563 nilai unik dan 1.541 penggunaan.
- Kolom bisnis berada di B–R.
- Worksheet memiliki formatting kosong hingga `XEK1048530`, sehingga XML internal menjadi sekitar 69 MB. Importer tidak boleh membaca used range secara naif.
- Terdapat foto/dokumentasi tertanam di dalam workbook.

Kolom yang ditemukan:

| Kolom | Nama sumber | Pemetaan aplikasi |
|---|---|---|
| B | No Asset | `asset_number` |
| C | Capitalized on | `capitalized_on` |
| D | Kode Aset | `asset_code` |
| E | Class Asset | `asset_class` |
| F | Asset description | `asset_description` |
| G | Acquis.val. | `acquisition_value` |
| H | Book val. | `book_value` |
| I | Quantity | `quantity` |
| J | Base Unit of Measure | `base_unit_of_measure` |
| K | Location | `location` |
| L | Sub Asset | `sub_asset` |
| M | Kebutuhan Data | `data_requirements` |
| N | Dokumentasi | `documentation` |
| O | Lokasi / Layout | `layout_location` |
| P | Biaya Pemeliharaan/Maintenance | `maintenance_cost` |
| Q | Frekuensi Pemakaian | `usage_frequency` |
| R | Layout | `layout_reference` |

Catatan implementasi:

- Importer harus membatasi pembacaan pada kolom B–R dan baris yang memiliki `No Asset`.
- Nilai tanggal Excel harus dikonversi dari serial date ke ISO date.
- Nilai finansial harus masuk ke tipe decimal.
- Foto embedded harus diekstrak sebagai dokumentasi dan direlasikan ke aset berdasarkan anchor pada worksheet.
- `Kebutuhan Data` adalah daftar kebutuhan, bukan data maintenance aktual; field ini tidak boleh disamakan dengan status maintenance.
- Dataset belum memuat longitude/latitude atau control point yang menghubungkan aset ke DXF.

## Dataset DXF

Sumber: `UPDATE DENAH TERMINAL 1 N 2.dxf`

- Ukuran file: sekitar 71 MB.
- Format: AutoCAD 2018 / `AC1032`.
- Entitas yang berhasil diparse: 159.926.
- Jumlah layer: 371.
- Waktu parse Node.js: sekitar 2,77 detik.
- Peak resident memory saat parse: sekitar 940 MB.

Distribusi entitas hasil parser:

| Entitas | Jumlah |
|---|---:|
| LINE | 118.472 |
| LWPOLYLINE | 17.158 |
| INSERT | 9.946 |
| ARC | 5.432 |
| SPLINE | 5.173 |
| CIRCLE | 2.200 |
| TEXT | 630 |
| MTEXT | 530 |
| ELLIPSE | 247 |
| DIMENSION | 91 |
| ATTDEF | 25 |
| POINT | 14 |
| POLYLINE | 8 |

Layer terbesar adalah `P` dengan 82.603 entitas, diikuti layer `0` dengan 29.772 entitas dan `FURNITURE` dengan 7.121 entitas.

Catatan implementasi:

- File ini tidak aman diparse sinkron di browser karena penggunaan memori mendekati 1 GB.
- Upload harus masuk object storage lalu diproses background worker dengan memory limit dan progress status.
- Geometry perlu dinormalisasi, dipisahkan per layer, disederhanakan, dan dibuat menjadi tile/level-of-detail sebelum dikirim ke browser.
- Renderer tidak boleh membuat satu Cesium Entity untuk setiap entitas. Gunakan batched primitives atau geometry tile.
- `INSERT`, block definition, `SPLINE`, `HATCH`, dan teks perlu pipeline khusus agar tampilan mendekati hasil CAD.
- Extent header sangat lebar dan mengandung nilai Z negatif/positif; bounds perlu dihitung ulang dari entity yang dipilih, bukan mempercayai `$EXTMIN/$EXTMAX` secara langsung.

## Blocker Georeferencing

DXF belum dapat ditempatkan secara akurat di peta karena belum ada pasangan control point DXF-ke-dunia. Diperlukan minimal tiga pasangan:

1. Koordinat lokal `X,Y` pada DXF.
2. Longitude/latitude WGS84 untuk titik fisik yang sama.
3. Konfirmasi unit gambar dan orientasi utara.

Tanpa data tersebut, menempatkan denah di peta hanya berdasarkan perkiraan berisiko menampilkan lokasi aset yang salah.

## Keputusan Teknis

- CesiumJS tetap digunakan untuk POC peta 3D.
- Parser browser hanya diperbolehkan untuk DXF kecil; batas awal yang disarankan 10 MB.
- DXF produksi seperti sampel Tanjung Pinang wajib memakai preprocessing backend.
- Import Excel wajib memakai pembacaan selektif/streaming karena used range workbook tidak mencerminkan jumlah data sebenarnya.
