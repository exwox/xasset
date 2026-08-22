#!/usr/bin/env bash
set -Eeuo pipefail

# XAsset runner
#   ./run.sh                         Local development
#   ./run.sh dev http://IP:3000      Development accessed from another host
#   ./run.sh prod example.com        First production deployment on a VPS
#   ./run.sh prod                    Subsequent production deployment
#   ./run.sh clean [--volumes]       Stop containers (optionally delete data)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-dev}"
PROD_ENV_FILE="${PROD_ENV_FILE:-.env.production}"
export PROD_ENV_FILE
DEV_COMPOSE=(docker compose)
PROD_COMPOSE=(docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml)
GENERATED_ADMIN_PASSWORD=""

log() { printf '\n%s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1 || die "Command '$1' tidak ditemukan."; }

load_env() {
  local env_file="$1"
  [ -f "$env_file" ] || die "File environment '$env_file' tidak ditemukan."
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

retry() {
  local description="$1" max_attempts="$2" delay="$3"
  shift 3
  local attempt=1
  until "$@"; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      die "$description gagal setelah $max_attempts percobaan."
    fi
    printf '   Percobaan %s gagal; retry dalam %s detik...\n' "$attempt" "$delay"
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

validate_domain() {
  local domain="$1"
  [[ "$domain" == *.* ]] || die "Gunakan FQDN, misalnya app.example.com."
  [ "${#domain}" -le 253 ] || die "Domain terlalu panjang."
  [[ "$domain" != *..* ]] || die "Domain '$domain' tidak valid."
  local label
  local labels=()
  IFS='.' read -r -a labels <<< "$domain"
  for label in "${labels[@]}"; do
    [[ "$label" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$ ]] ||
      die "Domain '$domain' tidak valid. Masukkan hostname tanpa http://, path, atau port."
  done
}

create_production_env() {
  local domain="$1"
  [ -n "$domain" ] || die "Deployment pertama membutuhkan domain: ./run.sh prod app.example.com"
  validate_domain "$domain"
  require_command openssl

  local postgres_password redis_password auth_secret s3_access_key s3_secret_key
  postgres_password="$(openssl rand -hex 24)"
  redis_password="$(openssl rand -hex 24)"
  auth_secret="$(openssl rand -hex 32)"
  s3_access_key="$(openssl rand -hex 12)"
  s3_secret_key="$(openssl rand -hex 32)"
  GENERATED_ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"

  umask 077
  printf '%s\n' \
    "NODE_ENV=production" \
    "APP_DOMAIN=$domain" \
    "S3_DOMAIN=storage.$domain" \
    "ACME_EMAIL=admin@$domain" \
    "APP_URL=https://$domain" \
    "DATABASE_URL=postgresql://xasset:$postgres_password@postgres:5432/xasset" \
    "POSTGRES_DB=xasset" \
    "POSTGRES_USER=xasset" \
    "POSTGRES_PASSWORD=$postgres_password" \
    "REDIS_PASSWORD=$redis_password" \
    "REDIS_URL=redis://:$redis_password@redis:6379" \
    "AUTH_SECRET=$auth_secret" \
    "SESSION_TTL_SECONDS=28800" \
    "S3_ENDPOINT=http://minio:9000" \
    "S3_PUBLIC_ENDPOINT=https://storage.$domain" \
    "S3_REGION=ap-southeast-1" \
    "S3_BUCKET=xasset" \
    "S3_ACCESS_KEY=$s3_access_key" \
    "S3_SECRET_KEY=$s3_secret_key" \
    "S3_FORCE_PATH_STYLE=true" \
    "LOG_LEVEL=info" \
    "ADMIN_EMAIL=admin@$domain" \
    "ADMIN_PASSWORD=$GENERATED_ADMIN_PASSWORD" > "$PROD_ENV_FILE"
  chmod 600 "$PROD_ENV_FILE"
  echo "Environment production dibuat: $PROD_ENV_FILE"
}

run_development() {
  require_command docker
  require_command npm
  if [ ! -f .env ]; then
    cp .env.example .env
    echo "File .env dibuat dari .env.example."
  fi
  if [ ! -x node_modules/.bin/tsx ]; then
    log "Menginstal dependency npm..."
    npm ci
  fi
  load_env .env
  if [ -n "${2:-}" ]; then
    node -e "new URL(process.argv[1])" "$2" >/dev/null 2>&1 || die "URL development '$2' tidak valid."
    export APP_URL="$2"
    export S3_PUBLIC_ENDPOINT="$(node -e 'const url=new URL(process.argv[1]); const host=url.hostname.includes(":") ? `[${url.hostname}]` : url.hostname; process.stdout.write(`${url.protocol}//${host}:9100`)' "$APP_URL")"
    export S3_API_BIND_ADDRESS="0.0.0.0"
  fi
  local dev_port
  dev_port="$(node -e 'const url=new URL(process.argv[1]); process.stdout.write(url.port || "3000")' "${APP_URL:-http://localhost:3000}")"
  [ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL wajib diisi di .env."
  [ -n "${ADMIN_EMAIL:-}" ] || die "ADMIN_EMAIL wajib diisi di .env."
  [ -n "${ADMIN_PASSWORD:-}" ] || die "ADMIN_PASSWORD wajib diisi di .env."
  if [ -n "${2:-}" ] && [ "${S3_SECRET_KEY:-}" = "xasset_local_secret" ]; then
    die "Ubah S3_SECRET_KEY default di .env sebelum membuka MinIO melalui IP VPS (gunakan nilai acak yang kuat)."
  fi

  log "=== XAsset development startup ==="
  echo "[1/5] Menyalakan PostgreSQL, Redis, dan MinIO..."
  "${DEV_COMPOSE[@]}" up -d --wait --wait-timeout 90
  log "[2/5] Menjalankan migrasi database..."
  retry "Migrasi database" 5 3 npm run db:migrate
  log "[3/5] Membuat atau memperbarui akun administrator..."
  retry "Seed administrator" 3 3 npm run db:seed-admin
  log "[4/5] Menyiapkan bucket object storage..."
  retry "Inisialisasi bucket" 3 3 bash scripts/init-s3.sh
  log "[5/5] Menyalakan Next.js dan background worker..."
  npm run predev
  ./node_modules/.bin/next dev --port "$dev_port" & DEV_PID=$!
  ./node_modules/.bin/tsx src/worker/dxf-worker.ts & WORKER_PID=$!

  cleanup() {
    local exit_code=$?
    trap - EXIT INT TERM
    kill "$DEV_PID" "$WORKER_PID" 2>/dev/null || true
    wait "$DEV_PID" "$WORKER_PID" 2>/dev/null || true
    exit "$exit_code"
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  echo "Web: ${APP_URL:-http://localhost:3000}"
  echo "Storage API: ${S3_PUBLIC_ENDPOINT:-${S3_ENDPOINT:-http://127.0.0.1:9100}}"
  echo "Admin: $ADMIN_EMAIL"
  echo "Tekan Ctrl+C untuk berhenti."
  set +e
  wait -n "$DEV_PID" "$WORKER_PID"
  local process_status=$?
  set -e
  return "$process_status"
}

run_production() {
  require_command docker
  if [ ! -f "$PROD_ENV_FILE" ]; then
    create_production_env "${2:-}"
  elif [ -n "${2:-}" ]; then
    echo "Menggunakan konfigurasi yang sudah ada di $PROD_ENV_FILE; argumen domain diabaikan."
  fi

  log "=== XAsset VPS production deployment ==="
  echo "[1/5] Memvalidasi konfigurasi..."
  "${PROD_COMPOSE[@]}" config --quiet
  echo "[2/5] Membangun image web, worker, dan migrator..."
  "${PROD_COMPOSE[@]}" build web worker migrate
  echo "[3/5] Menjalankan migration database..."
  retry "Migration production" 5 5 "${PROD_COMPOSE[@]}" run --rm migrate
  echo "[4/5] Membuat atau memperbarui administrator..."
  retry "Seed administrator" 3 5 "${PROD_COMPOSE[@]}" run --rm migrate ./node_modules/.bin/tsx scripts/seed-admin.ts
  echo "[5/5] Menyalakan aplikasi dan reverse proxy HTTPS..."
  "${PROD_COMPOSE[@]}" up -d --no-build --wait --wait-timeout 180 web worker caddy
  "${PROD_COMPOSE[@]}" ps

  echo
  echo "Deployment selesai. Pastikan DNS APP_DOMAIN dan S3_DOMAIN mengarah ke IP VPS."
  if [ -n "$GENERATED_ADMIN_PASSWORD" ]; then
    echo "Admin password awal: $GENERATED_ADMIN_PASSWORD"
    echo "Simpan password ini sekarang dan lindungi $PROD_ENV_FILE (permission 600)."
  fi
}

run_clean() {
  require_command docker
  local volume_args=()
  if [ "${2:-}" = "--volumes" ]; then
    volume_args=(--volumes)
  elif [ -n "${2:-}" ]; then
    die "Argumen clean tidak dikenal: $2"
  fi
  "${DEV_COMPOSE[@]}" down "${volume_args[@]}"
  if [ -f "$PROD_ENV_FILE" ]; then
    "${PROD_COMPOSE[@]}" down "${volume_args[@]}"
  fi
  echo "Container XAsset dihentikan."
}

case "$MODE" in
  dev) run_development "$@" ;;
  prod) run_production "$@" ;;
  clean) run_clean "$@" ;;
  *) die "Mode '$MODE' tidak dikenal. Gunakan dev, prod, atau clean." ;;
esac
