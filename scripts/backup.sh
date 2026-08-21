#!/usr/bin/env bash
set -euo pipefail

backup_dir="${1:?Usage: scripts/backup.sh /absolute/backup/directory}"
case "$backup_dir" in /*) ;; *) echo "Backup directory must be absolute" >&2; exit 2;; esac
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="$backup_dir/xasset-$timestamp.dump"
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --format=custom --file="$dump_file" "${DATABASE_URL:?DATABASE_URL is required}"
  pg_restore --list "$dump_file" >/dev/null
elif command -v docker >/dev/null 2>&1; then
  container_file="/tmp/xasset-$timestamp.dump"
  docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-xasset}" -d "${POSTGRES_DB:-xasset}" --format=custom --file="$container_file"
  docker compose exec -T postgres pg_restore --list "$container_file" >/dev/null
  docker compose cp "postgres:$container_file" "$dump_file"
  docker compose exec -T postgres rm -f "$container_file"
else
  echo "pg_dump or Docker Compose is required" >&2; exit 4
fi
sha256sum "$dump_file" > "$dump_file.sha256"
echo "Database backup created: $dump_file"
echo "Object storage versioning/replication must be configured separately; see docs/operations.md"
