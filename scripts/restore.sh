#!/usr/bin/env bash
set -euo pipefail

dump_file="${1:?Usage: scripts/restore.sh /absolute/path/to/backup.dump}"
case "$dump_file" in /*) ;; *) echo "Backup path must be absolute" >&2; exit 2;; esac
test -f "$dump_file"
test "${CONFIRM_RESTORE:-}" = "RESTORE_XASSET" || { echo "Set CONFIRM_RESTORE=RESTORE_XASSET to continue" >&2; exit 3; }
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --clean --if-exists --no-owner --dbname="${DATABASE_URL:?DATABASE_URL is required}" "$dump_file"
elif command -v docker >/dev/null 2>&1; then
  restore_database="${RESTORE_DATABASE:?RESTORE_DATABASE must name the exact target database for Docker restore}"
  container_file="/tmp/xasset-restore-$$.dump"
  docker compose cp "$dump_file" "postgres:$container_file"
  docker compose exec -T postgres pg_restore -U "${POSTGRES_USER:-xasset}" -d "$restore_database" --clean --if-exists --no-owner "$container_file"
  docker compose exec -T postgres rm -f "$container_file"
else
  echo "pg_restore or Docker Compose is required" >&2; exit 4
fi
echo "Database restored from: $dump_file"
