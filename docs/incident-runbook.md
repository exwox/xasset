# Incident Runbook XAsset

## Severity

- SEV-1: data terekspos/korup, seluruh aplikasi gagal. Hubungi incident commander, security, DBA, dan owner bisnis segera.
- SEV-2: fungsi kritis terganggu tanpa kehilangan data. Respons maksimal 30 menit.
- SEV-3: degradasi non-kritis. Masuk backlog terjadwal.

## Triage dan recovery

1. Catat waktu, reporter, environment, request ID, dampak, dan perubahan terakhir.
2. Cek health, metrics, log web/worker, queue, database, Redis, storage, disk, dan sertifikat.
3. Hentikan publish/import bila integritas belum pasti. Jangan menghapus evidence.
4. Mitigasi dengan rollback image atau versi DXF lama. Restore database hanya setelah approval dan verifikasi backup.
5. Jalankan deployment smoke, reconciliation, dan critical flow setelah recovery.
6. Tutup dengan timeline, root cause, corrective action, owner, dan due date.

Credential exposure wajib diikuti revoke/rotate secret, invalidasi session, audit access, dan notifikasi sesuai kebijakan perusahaan.
