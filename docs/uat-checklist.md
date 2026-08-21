# Checklist UAT dan Browser

Isi tester, tanggal, environment, bukti, dan status untuk setiap kasus.

| Area | Skenario | Role | Hasil |
|---|---|---|---|
| Login | valid, salah 5x, lockout, logout | semua | ☐ |
| Aset | cari, filter, detail, edit conflict, import/export | operator | ☐ |
| Peta | marker, fly-to, posisi global/lokal, layout selector | viewer/operator | ☐ |
| DXF | upload, parse gagal, georef, editor, export CAD, publish/rollback | DXF editor | ☐ |
| Maintenance | overdue, mulai, selesai, recurrence, histori | operator | ☐ |
| Dokumen | signature valid/palsu, download, archive, forbidden role | semua | ☐ |
| Recovery | backup verify, restore staging, rollback deployment | admin | ☐ |

Browser minimum: Chrome/Edge versi organisasi saat ini, Firefox ESR, dan Safari terbaru yang didukung. Uji desktop 1366×768 dan mobile 390×844. Defect harus memuat severity, reproduksi, bukti, owner, serta target fix. Sign-off hanya setelah critical/high nol.
