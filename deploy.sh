#!/usr/bin/env bash
# deploy.sh — pull latest main and rebuild the backend on the VPS.
#
# Usage (on the server):  ./deploy.sh
# Migrations run automatically on backend startup (RUN_MIGRATIONS=true).
# The frontend deploys separately via Cloudflare/Vercel on push — not handled here.
set -euo pipefail
cd "$(dirname "$0")"

echo "▶ git pull --ff-only origin main"
git pull --ff-only origin main

echo "▶ rebuild + restart backend + minio (this compiles the Rust image, can take a few min)"
# docker-compose.deploy.yml is NOT optional: it supplies DATABASE_URL with the
# real POSTGRES_PASSWORD and pins db/minio to loopback. Deploying without it
# recreates the backend with the local-dev password (crash loop) and republishes
# Postgres on 0.0.0.0.
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.deploy.yml up -d --build backend minio minio-init

echo "▶ status"
sleep 5
docker ps --filter name=enconjunto-backend --format '{{.Names}}: {{.Status}}'
docker ps --filter name=enconjunto-minio --format '{{.Names}}: {{.Status}}'
echo "▶ recent backend logs (migrations / listen / errors):"
docker logs --tail 20 enconjunto-backend 2>&1 | grep -iE 'listening|applied migration|error|panic' || true
echo "▶ minio health:"
docker exec enconjunto-minio mc ready local 2>&1 || echo "⚠ minio mc ready failed"
echo "✅ deploy done"
