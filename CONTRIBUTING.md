# Kontribusi XAsset

- Branch: `feature/<ticket>-<nama>`, `fix/<ticket>-<nama>`, atau `chore/<nama>`.
- Commit mengikuti Conventional Commits, misalnya `feat(auth): add session login`.
- Jangan commit `.env`, credential, DXF produksi, workbook produksi, atau file hasil backup.
- Sebelum pull request jalankan `npm run check`.
- Perubahan schema wajib menyertakan migration maju; migration yang sudah dipakai tidak boleh diubah.
- Pull request wajib menjelaskan dampak permission, migration, audit log, serta cara verifikasi.
