#!/bin/sh

set -eu

echo "Applying database migrations..."
npm run prisma:deploy -w @muisbakery/api

seed_mode="${SEED_MODE:-bootstrap}"

# Preserve compatibility with existing installations and the previous skip flag.
if [ "${SKIP_SEED:-0}" = "1" ]; then
  seed_mode="none"
fi

if [ "${FORCE_RESEED:-0}" != "1" ] && \
  { [ -f /state/initialized ] || [ -f /state/seeded ]; }; then
  echo "Database setup was already completed; leaving existing data unchanged."
  exit 0
fi

case "$seed_mode" in
  bootstrap)
    generated_admin_password=""

    if [ -z "${SEED_ADMIN_PASSWORD:-}" ]; then
      generated_admin_password="$(node -e "console.log(require('node:crypto').randomBytes(18).toString('base64url'))")"
      SEED_ADMIN_PASSWORD="$generated_admin_password"
      export SEED_ADMIN_PASSWORD
    fi

    BOOTSTRAP_RESULT_FILE="/state/bootstrap-result"
    export BOOTSTRAP_RESULT_FILE

    echo "Bootstrapping a clean live database..."
    npm run db:bootstrap -w @muisbakery/api
    date -u +"%Y-%m-%dT%H:%M:%SZ" > /state/initialized

    bootstrap_result="$(cat "$BOOTSTRAP_RESULT_FILE")"

    if [ -n "$generated_admin_password" ] && [ "$bootstrap_result" = "created" ]; then
      echo ""
      echo "ONE-TIME ADMIN CREDENTIALS"
      echo "Email: ${SEED_ADMIN_EMAIL:-admin@muisbakery.local}"
      echo "Password: $generated_admin_password"
      echo "Change this password immediately after the first login."
      echo ""
    elif [ "$bootstrap_result" = "existing" ]; then
      echo "An existing Admin account was preserved; use its current credentials."
    fi

    echo "Live database bootstrap completed."
    ;;
  demo)
    SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-MuisBakeryDemo123!}"
    SEED_DEMO_PASSWORD="${SEED_DEMO_PASSWORD:-$SEED_ADMIN_PASSWORD}"
    export SEED_ADMIN_PASSWORD SEED_DEMO_PASSWORD

    echo "Loading explicitly requested demo data..."
    npm run db:seed -w @muisbakery/api
    date -u +"%Y-%m-%dT%H:%M:%SZ" > /state/initialized
    echo "Demo seed completed."
    ;;
  none)
    echo "Database migrations completed; bootstrap and demo data were skipped."
    ;;
  *)
    echo "Invalid SEED_MODE '$seed_mode'. Use bootstrap, demo, or none." >&2
    exit 1
    ;;
esac
