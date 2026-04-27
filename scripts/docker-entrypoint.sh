#!/bin/sh
set -e

echo "[INFO] Running database migrations..."
node dist/db/migrate.js
echo "[INFO] Migrations completed successfully"

if [ "$SEED_DATABASE" = "true" ]; then
  echo "[INFO] Seeding services from services.json..."
  node dist/db/seed.js
  echo "[INFO] Seeding completed"
fi

echo "[INFO] Starting application..."
exec node dist/main.js
