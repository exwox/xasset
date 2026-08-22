# Operations Runbook

## Development

1. Copy `.env.example` to `.env` and replace all secrets. MinIO API/console lokal tersedia pada port 9100/9101.
2. Start dependencies with `docker compose up -d`.
3. Run `npm run db:migrate` and `npm run db:seed-admin`.
4. Start web with `npm run dev` and worker with `npm run worker` in separate terminals.

## Health and Metrics

- `GET /api/health` checks PostgreSQL and Redis readiness.
- `GET /api/metrics` exposes Prometheus metrics only to an administrator session.
- Application logs are JSON and redact password, cookie, authorization, secret, and token fields.

## Backup and Restore

- Run `scripts/backup.sh /absolute/backup/directory` with `DATABASE_URL` set.
- Enable bucket versioning and off-site replication on production S3/object storage.
- Restore only to an empty/staging environment first: `CONFIRM_RESTORE=RESTORE_XASSET scripts/restore.sh /absolute/path.dump`.
- After restore, run migration, verify row counts, object references, login, and critical application flow.

## Production Requirements

- Arahkan domain aplikasi dan subdomain `storage` ke VPS, lalu deploy pertama kali dengan `./run.sh prod app.example.com`.
- Backup named volume PostgreSQL dan MinIO sebelum upgrade; jangan gunakan `./run.sh clean --volumes` pada production kecuali seluruh data memang akan dihapus.
- Store secrets in a secrets manager; never bake them into an image.
- Terminate TLS at the ingress and pass trusted proxy headers.
- Restrict PostgreSQL, Redis, MinIO, metrics, and admin endpoints to private networks.
- Configure alerting for health failure, worker failure, queue backlog, disk space, database connections, and elevated login failure.
