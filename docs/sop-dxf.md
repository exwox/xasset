# SOP Upload dan Publish DXF

1. Pastikan nama, unit, building/floor, dan change note benar.
2. Upload `.dxf`; sistem memvalidasi size, key, MIME, signature SECTION, lalu worker mengonversinya menjadi JSON compact terkompresi. DXF asli hanya dipertahankan untuk audit, unduh, dan pembuatan versi.
3. Review entity count, layer, bounds, unsupported entity, preview, dan error.
4. Tentukan control point hasil survei. Jangan menebak unit atau koordinat.
5. Pastikan residual sesuai toleransi pemilik CAD dan overlay cocok dengan aset referensi.
6. Uji compare serta buka export pada aplikasi CAD target.
7. Publish versi yang disetujui dan catat tiket/approval pada change note.
8. Jika regresi, publish versi lama sebagai rollback; jangan menghapus source object.

Warna overlay peta mengikuti warna masing-masing layer CAD. Warna dapat disesuaikan dari kontrol warna layer dan perubahan langsung dipakai endpoint render peta.

Menu **Hapus DXF** melakukan soft-delete pada dokumen: DXF hilang dari daftar dan peta, sedangkan file sumber tetap disimpan untuk audit. Aksi ini memerlukan permission publish dan harus dikonfirmasi pengguna.

Editor MVP memakai normalized cap. File produksi besar wajib melalui validasi fidelity CAD sebelum mengganti versi aktif.

Peta dan editor tidak membaca DXF mentah. Keduanya mengambil render JSON schema v2: koordinat disimpan sebagai tuple, nama layer disimpan satu kali sebagai indeks, dan artefak object storage memakai gzip. Endpoint render tetap dapat membaca artefak schema v1 agar versi lama tidak harus dimigrasikan serentak.
