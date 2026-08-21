#!/usr/bin/env bash
# Menjalankan seluruh suite smoke Fase 7 di Docker dalam satu perintah.
# Membuat image web, menghidupkan postgres/redis/minio, seed admin,
# deploy app di host network, lalu menjalankan e2e/security/deployment/load.
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="${XASSET_IMAGE:-xasset-web:e2e}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
WEB_NAME="${WEB_NAME:-xasset-web-smoke}"
SMOKE_EMAIL="${SMOKE_EMAIL:-admin@xasset.local}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-E2E-Admin-Pass-2026}"

env_file="$(mktemp)"
cleanup() {
  docker rm -f "$WEB_NAME" >/dev/null 2>&1 || true
  rm -f "$env_file"
}
trap cleanup EXIT

cat > "$env_file" <<EOF
NODE_ENV=production
APP_URL=$BASE_URL
DATABASE_URL=${DATABASE_URL:-postgresql://xasset:xasset_local_password@127.0.0.1:5432/xasset}
REDIS_URL=${REDIS_URL:-redis://127.0.0.1:6379}
AUTH_SECRET=${AUTH_SECRET:-xasset-e2e-secret-at-least-32-characters-long}
SESSION_TTL_SECONDS=3600
S3_ENDPOINT=${S3_ENDPOINT:-http://127.0.0.1:9100}
S3_REGION=${S3_REGION:-ap-southeast-1}
S3_BUCKET=${S3_BUCKET:-xasset}
S3_ACCESS_KEY=${S3_ACCESS_KEY:-xasset}
S3_SECRET_KEY=${S3_SECRET_KEY:-xasset_local_secret}
S3_FORCE_PATH_STYLE=true
LOG_LEVEL=${LOG_LEVEL:-info}
ADMIN_EMAIL=$SMOKE_EMAIL
ADMIN_PASSWORD=$SMOKE_PASSWORD
EOF

echo "==> [1/5] Menghidupkan postgres/redis/minio"
docker compose up -d

echo "==> [2/5] Membuild image web (${IMAGE})"
docker build --progress=plain -t "$IMAGE" --target web .

echo "==> [3/5] Seed administrator ${SMOKE_EMAIL}"
db_url="$(grep '^DATABASE_URL=' "$env_file" | cut -d= -f2-)"
DATABASE_URL="$db_url" ADMIN_EMAIL="$SMOKE_EMAIL" ADMIN_PASSWORD="$SMOKE_PASSWORD" npm run db:seed-admin

echo "==> [4/5] Deploy web di host network (${WEB_NAME})"
docker rm -f "$WEB_NAME" >/dev/null 2>&1 || true
docker run -d --name "$WEB_NAME" --network host --env-file "$env_file" "$IMAGE"

echo "==> Menunggu kesehatan aplikasi"
healthy=0
for _ in $(seq 1 20); do
  if curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 3
done
if [ "$healthy" != 1 ]; then
  echo "Aplikasi tidak sehat dalam batas waktu." >&2
  docker logs "$WEB_NAME" 2>&1 | tail -40
  exit 1
fi
echo "   Health OK"

export BASE_URL SMOKE_EMAIL SMOKE_PASSWORD
failed=0
run() {
  echo
  echo "==> [5/5] $1"
  if ! npm run "$2"; then echo "GAGAL: $1" >&2; failed=1; fi
}
run "E2E critical flow" smoke:e2e
run "Security smoke" test:security
run "Deployment smoke" smoke:deployment
run "Load test (p95 < 1500ms)" test:load

if [ "$failed" = 1 ]; then
  echo "Suite smoke memiliki kegagalan." >&2
  exit 1
fi
echo
echo "Semua smoke lulus terhadap $BASE_URL (image ${IMAGE})."