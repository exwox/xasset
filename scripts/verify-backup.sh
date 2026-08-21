#!/usr/bin/env bash
set -euo pipefail
dump_file="${1:?Usage: scripts/verify-backup.sh /absolute/path/to/backup.dump}"
case "$dump_file" in /*) ;; *) echo "Backup path must be absolute" >&2; exit 2;; esac
test -s "$dump_file"
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$dump_file" >/dev/null
elif command -v docker >/dev/null 2>&1; then
  container_file="/tmp/xasset-verify-$$.dump"
  docker compose cp "$dump_file" "postgres:$container_file"
  docker compose exec -T postgres pg_restore --list "$container_file" >/dev/null
  docker compose exec -T postgres rm -f "$container_file"
else
  echo "pg_restore or Docker Compose is required" >&2; exit 4
fi
sha256sum "$dump_file"
echo "Backup archive is readable: $dump_file"
