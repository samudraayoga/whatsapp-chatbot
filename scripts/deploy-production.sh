#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(dirname -- "$SCRIPT_DIR")
cd "$PROJECT_DIR"

PRODUCTION_ENV_FILE=${PRODUCTION_ENV_FILE:-.env.production}
export PRODUCTION_ENV_FILE

if [ ! -f "$PRODUCTION_ENV_FILE" ]; then
  echo "Environment file tidak ditemukan: $PRODUCTION_ENV_FILE" >&2
  echo "Salin .env.production.example lalu isi seluruh secret produksi." >&2
  exit 1
fi

if grep -q 'CHANGE_ME_' "$PRODUCTION_ENV_FILE"; then
  echo "Deployment dibatalkan: masih ada placeholder CHANGE_ME_." >&2
  exit 1
fi

docker compose \
  --env-file "$PRODUCTION_ENV_FILE" \
  -f compose.production.yaml \
  config --quiet
docker compose \
  --env-file "$PRODUCTION_ENV_FILE" \
  -f compose.production.yaml \
  build
# Import konfigurasi di image final agar guard secret production dieksekusi.
docker compose \
  --env-file "$PRODUCTION_ENV_FILE" \
  -f compose.production.yaml \
  run --rm --no-deps app \
  node -e "import('./dist/config/env.js')"
docker compose \
  --env-file "$PRODUCTION_ENV_FILE" \
  -f compose.production.yaml \
  up -d --wait
docker compose \
  --env-file "$PRODUCTION_ENV_FILE" \
  -f compose.production.yaml \
  ps
