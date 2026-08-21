#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# XAsset S3/MinIO Initialization Script
# Memastikan bucket S3 dan konfigurasi ready untuk aplikasi
# ==============================================================================

echo "🪣 Initializing S3/MinIO..."

# Check if MinIO is accessible
echo "   Checking MinIO connection..."
if ! docker compose exec -T minio mc alias list > /dev/null 2>&1; then
  echo "   ⚠️  MinIO not responding, retrying in 3 seconds..."
  sleep 3
fi

# Setup alias for MinIO
echo "   Setting up MinIO alias..."
docker compose exec -T minio mc alias set myminio http://localhost:9000 xasset xasset_local_secret --api S3v4 2>/dev/null || true

# Create bucket if it doesn't exist
echo "   Creating bucket (if needed)..."
docker compose exec -T minio mc mb myminio/xasset 2>/dev/null || echo "   ℹ️  Bucket already exists"

# Verify bucket access
echo "   Verifying bucket access..."
if docker compose exec -T minio mc ls myminio/xasset > /dev/null 2>&1; then
  echo "   ✓ S3 bucket ready"
else
  echo "   ❌ S3 bucket verification failed"
  exit 1
fi
