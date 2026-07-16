#!/bin/sh

set -eu

echo "Applying database migrations..."
npm run prisma:deploy -w @muisbakery/api

if [ "${SKIP_SEED:-0}" = "1" ]; then
  echo "Skipping local demo seed because SKIP_SEED=1."
  exit 0
fi

if [ "${FORCE_RESEED:-0}" = "1" ] || [ ! -f /state/seeded ]; then
  echo "Seeding the local demo database..."
  npm run db:seed -w @muisbakery/api
  date -u +"%Y-%m-%dT%H:%M:%SZ" > /state/seeded
  echo "Local demo seed completed."
else
  echo "Local demo database was already seeded; leaving existing data unchanged."
fi
