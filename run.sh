#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# XAsset Command Center — Runner Script
# Menjalankan: docker compose + migrasi DB + seed admin + dev server + worker
# Usage: 
#   ./run.sh              # Start in development mode (default)
#   ./run.sh prod         # Start in production mode (Docker only)
#   ./run.sh clean        # Stop containers dan cleanup
# ==============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
MODE="${1:-dev}"  # Default: development

if [ "$MODE" = "clean" ]; then
  echo "🧹 Stopping and removing containers..."
  docker compose down -v
  exit 0
fi

if [ "$MODE" = "prod" ]; then
  echo "========================================="
  echo "🚀 XAsset Production Mode (Docker)"
  echo "========================================="
  docker compose -f compose.production.yaml up -d
  echo ""
  echo "✅ Production services started!"
  echo "   Web server: http://localhost:3000"
  echo "   Admin email: admin@xasset.local"
  echo ""
  echo "View logs: docker compose -f compose.production.yaml logs -f"
  exit 0
fi

echo "========================================="
echo "🚀 XAsset Command Center — Development Mode"
echo "========================================="

# Aggressive cleanup - kill all node processes that might be from previous runs
echo "🧹 Cleaning up old processes..."

# Kill specific npm/node processes
pkill -9 -f "npm run dev" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true  
pkill -9 -f "tsx.*dxf-worker" 2>/dev/null || true

# Also kill any node processes in current directory
pkill -9 -f "/home/exwox/Documents/docker/xasset" 2>/dev/null || true

# Remove Next.js dev lock files (sometimes they prevent restart)
rm -rf .next/dev 2>/dev/null || true

# Show what was found and cleaned
if command -v lsof &> /dev/null; then
  PIDS=$(lsof -ti :3000 2>/dev/null || echo "")
  if [ -n "$PIDS" ]; then
    echo "   Found process(es) holding port 3000:"
    lsof -i :3000 2>/dev/null | tail -n +2
    echo "   Attempting to kill..."
    echo "$PIDS" | xargs -r kill -9 2>/dev/null || true
    sleep 3  # Longer wait
  else
    echo "   ✓ Port 3000 is free"
  fi
else
  echo "   (lsof not available, skipping port check)"
fi

# Final wait to ensure port is free
echo "   Waiting for port 3000 to be released..."
ATTEMPT=0
MAX_ATTEMPTS=15
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if ! (echo >/dev/tcp/127.0.0.1/3000) 2>/dev/null; then
    echo "   ✓ Port 3000 ready"
    break
  fi
  echo "   ⏳ Waiting... ($((ATTEMPT+1))/$MAX_ATTEMPTS)"
  sleep 1
  ATTEMPT=$((ATTEMPT+1))
done

if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
  echo "   ⚠️  Port 3000 still in use, but proceeding anyway..."
fi

# --- 1. Pastikan Docker Compose jalan ---
echo ""
echo "--- [1/5] Menjalankan infrastruktur (Postgres/Redis/MinIO) ---"
docker compose up -d

echo "⏳ Menunggu PostgreSQL siap (phase 1: accepting connections)..."
for i in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U xasset -d xasset >/dev/null 2>&1; then
    echo "   ✓ PostgreSQL accepting connections"
    break
  fi
  if [ "$i" = "60" ]; then
    echo "   ❌ PostgreSQL tidak siap setelah 60 detik."
    docker compose logs postgres | tail -20
    exit 1
  fi
  sleep 1
done

echo "⏳ Menunggu PostgreSQL siap (phase 2: accepting queries)..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres psql -U xasset -d xasset -c "SELECT 1" >/dev/null 2>&1; then
    echo "   ✓ PostgreSQL ready for queries"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "   ⚠️  PostgreSQL slow to accept queries, retrying..."
  fi
  sleep 1
done

echo "⏳ Menunggu Redis siap..."
for i in $(seq 1 20); do
  if docker compose exec -T redis redis-cli ping | grep -q "PONG" >/dev/null 2>&1; then
    echo "   ✓ Redis siap."
    break
  fi
  if [ "$i" = "20" ]; then
    echo "   ⚠️  Redis tidak merespons, lanjut ke migrasi..."
  fi
  sleep 1
done

# --- 2. Jalankan Migrasi Database ---
echo ""
echo "--- [2/5] Menjalankan migrasi database ---"
set -a && . ./.env && set +a

# Retry logic untuk migrasi
MAX_RETRIES=3
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  if DATABASE_URL="postgresql://xasset:xasset_local_password@127.0.0.1:5432/xasset" \
    npx tsx scripts/migrate.ts; then
    echo "✅ Migrasi database selesai."
    break
  else
    RETRY=$((RETRY+1))
    if [ $RETRY -lt $MAX_RETRIES ]; then
      echo "⚠️  Migrasi gagal, menunggu 5 detik sebelum retry ($RETRY/$MAX_RETRIES)..."
      sleep 5
    else
      echo "❌ Migrasi gagal setelah $MAX_RETRIES percobaan."
      echo "   Troubleshoot:"
      echo "   1. Cek: docker compose ps (harus healthy)"
      echo "   2. Cek: docker compose logs postgres"
      echo "   3. Cek: .env DATABASE_URL sudah benar"
      exit 1
    fi
  fi
done

# --- 3. Seed Admin ---
echo ""
echo "--- [3/5] Seed akun administrator ---"
set -a && . ./.env && set +a

MAX_RETRIES=3
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  if ADMIN_EMAIL="${ADMIN_EMAIL:-admin@xasset.local}" \
    ADMIN_PASSWORD="${ADMIN_PASSWORD:-AdminPassword123}" \
    DATABASE_URL="postgresql://xasset:xasset_local_password@127.0.0.1:5432/xasset" \
    npx tsx scripts/seed-admin.ts; then
    echo "✅ Administrator ter-seed."
    break
  else
    RETRY=$((RETRY+1))
    if [ $RETRY -lt $MAX_RETRIES ]; then
      echo "⚠️  Seed admin gagal, menunggu 3 detik sebelum retry ($RETRY/$MAX_RETRIES)..."
      sleep 3
    else
      echo "⚠️  Seed admin gagal setelah $MAX_RETRIES percobaan, lanjut ke langkah berikutnya..."
    fi
  fi
done

# --- 3.5. Initialize S3 Bucket ---
echo ""
echo "--- [3.5/5] Initializing S3/MinIO bucket ---"
if bash scripts/init-s3.sh; then
  echo "✅ S3 bucket initialized."
else
  echo "⚠️  S3 bucket initialization failed, lanjut ke aplikasi..."
fi

# --- 4. Jalankan Aplikasi (Next.js Dev Server) ---
echo ""
echo "--- [4/5] Menjalankan development server (Next.js) ---"
echo "   Aplikasi akan tersedia di: http://localhost:3001 (atau 3000 jika port bebas)"
echo "   Tekan Ctrl+C untuk berhenti..."
echo ""

# Terminal 1: Next.js dev (foreground)
npm run dev &
DEV_PID=$!

# --- 5. Jalankan Background Worker ---
echo ""
echo "--- [5/5] Menjalankan background worker (DXF processing) ---"
echo "   Worker berjalan di background. Lognya akan tampak di bawah."
echo ""

# Set environment for worker and start in foreground (so script doesn't exit)
set -a && . ./.env && set +a
npx tsx src/worker/dxf-worker.ts &
WORKER_PID=$!

echo ""
echo "✅ Semua service siap!"
echo ""
echo "   🌐 Web:    http://localhost:3001 (atau 3000 jika tersedia)"
echo "   📧 Email:  admin@xasset.local"
echo "   🔑 Pass:   (dari ADMIN_PASSWORD di .env)"
echo "   🪣 MinIO:  http://127.0.0.1:9101 (xasset / xasset_local_secret)"
echo ""
echo "   🛑 Tekan Ctrl+C untuk menghentikan semua service"
echo ""

# Setup signal handlers untuk cleanup graceful
cleanup() {
  echo ""
  echo "🛑 Shutting down services..."
  
  # Kill dev and worker processes
  if [ -n "${DEV_PID:-}" ]; then
    kill $DEV_PID 2>/dev/null || true
  fi
  if [ -n "${WORKER_PID:-}" ]; then
    kill $WORKER_PID 2>/dev/null || true
  fi
  
  # Wait for graceful shutdown
  wait $DEV_PID $WORKER_PID 2>/dev/null || true
  
  # Force kill any remaining processes
  pkill -9 -f "npm run dev" 2>/dev/null || true
  pkill -9 -f "next dev" 2>/dev/null || true
  pkill -9 -f "tsx.*dxf-worker" 2>/dev/null || true
  
  echo "✅ Semua proses ditutup."
  exit 0
}

trap cleanup INT TERM EXIT

# Wait indefinitely
wait