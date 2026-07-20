#!/bin/sh

set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
PENDING_DIR="${BACKUP_ROOT}/pending"
COMPLETED_DIR="${BACKUP_ROOT}/completed"
STATUS_DIR="${BACKUP_ROOT}/status"
LOCK_DIR="${BACKUP_ROOT}/.backup-lock"
RETRY_ONLY=0
PLAINTEXT_DUMP=""

if [ "${1:-}" = "--retry-only" ]; then
  RETRY_ONLY=1
fi

cleanup() {
  if [ -n "$PLAINTEXT_DUMP" ]; then
    rm -f "$PLAINTEXT_DUMP"
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

trap cleanup 0 1 2 15

require_variable() {
  variable_name="$1"
  eval "variable_value=\${${variable_name}:-}"
  if [ -z "$variable_value" ]; then
    echo "Missing required backup setting: ${variable_name}" >&2
    return 1
  fi
}

validate_configuration() {
  failed=0
  for variable_name in \
    PGHOST PGDATABASE PGUSER PGPASSWORD \
    SUPABASE_S3_ENDPOINT SUPABASE_S3_REGION \
    SUPABASE_S3_ACCESS_KEY_ID SUPABASE_S3_SECRET_ACCESS_KEY \
    SUPABASE_STORAGE_BUCKET BACKUP_AGE_RECIPIENT
  do
    require_variable "$variable_name" || failed=1
  done

  if [ "$failed" -ne 0 ]; then
    echo "Complete the Supabase backup section in .env before enabling the backup profile." >&2
    exit 2
  fi

  case "$BACKUP_AGE_RECIPIENT" in
    age1*) ;;
    *)
      echo "BACKUP_AGE_RECIPIENT must be an age public recipient beginning with age1." >&2
      exit 2
      ;;
  esac
}

configure_rclone() {
  export RCLONE_CONFIG_SUPABASE_TYPE=s3
  export RCLONE_CONFIG_SUPABASE_PROVIDER=Other
  export RCLONE_CONFIG_SUPABASE_ENV_AUTH=false
  export RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID="$SUPABASE_S3_ACCESS_KEY_ID"
  export RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY="$SUPABASE_S3_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_SUPABASE_ENDPOINT="$SUPABASE_S3_ENDPOINT"
  export RCLONE_CONFIG_SUPABASE_REGION="$SUPABASE_S3_REGION"
  export RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE=true
}

remote_path_for() {
  file_name="$(basename "$1")"
  prefix="${BACKUP_PREFIX:-database}"
  prefix="${prefix#/}"
  prefix="${prefix%/}"
  printf '%s:%s/%s/%s' "supabase" "$SUPABASE_STORAGE_BUCKET" "$prefix" "$file_name"
}

upload_archive() {
  encrypted_file="$1"
  checksum_file="${encrypted_file}.sha256"

  if [ ! -s "$checksum_file" ]; then
    (
      cd "$(dirname "$encrypted_file")"
      sha256sum "$(basename "$encrypted_file")" > "$(basename "$checksum_file")"
    )
  fi

  encrypted_remote="$(remote_path_for "$encrypted_file")"
  checksum_remote="$(remote_path_for "$checksum_file")"

  echo "Uploading $(basename "$encrypted_file") to Supabase Storage."
  if ! rclone copyto "$encrypted_file" "$encrypted_remote" \
    --retries 5 \
    --low-level-retries 10 \
    --timeout 2m
  then
    echo "Encrypted archive upload failed; the local pending file was retained." >&2
    return 1
  fi

  if ! rclone copyto "$checksum_file" "$checksum_remote" \
    --retries 5 \
    --low-level-retries 10 \
    --timeout 2m
  then
    echo "Checksum upload failed; the local pending files were retained for retry." >&2
    return 1
  fi

  mkdir -p "$COMPLETED_DIR"
  mv "$encrypted_file" "$COMPLETED_DIR/$(basename "$encrypted_file")"
  mv "$checksum_file" "$COMPLETED_DIR/$(basename "$checksum_file")"
  echo "Uploaded ${encrypted_remote}."
}

retry_pending_archives() {
  retry_failed=0
  found_pending=0

  for encrypted_file in "$PENDING_DIR"/*.dump.age; do
    if [ ! -e "$encrypted_file" ]; then
      continue
    fi
    found_pending=1
    upload_archive "$encrypted_file" || retry_failed=1
  done

  if [ "$found_pending" -eq 1 ] && [ "$retry_failed" -ne 0 ]; then
    return 1
  fi
}

prune_local_archives() {
  retention_days="${BACKUP_LOCAL_RETENTION_DAYS:-7}"
  case "$retention_days" in
    ''|*[!0-9]*)
      echo "BACKUP_LOCAL_RETENTION_DAYS must be a non-negative integer." >&2
      return 1
      ;;
  esac

  find "$COMPLETED_DIR" -type f \
    \( -name '*.dump.age' -o -name '*.dump.age.sha256' \) \
    -mtime "+${retention_days}" -delete
}

mark_success() {
  now_epoch="$(date +%s)"
  now_iso="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf '%s\n' "$now_epoch" > "$STATUS_DIR/last-success.epoch"
  printf '%s\n' "$now_iso" > "$STATUS_DIR/last-success.txt"
}

validate_configuration
configure_rclone
mkdir -p "$PENDING_DIR" "$COMPLETED_DIR" "$STATUS_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another database backup is already running." >&2
  exit 75
fi

if ! retry_pending_archives; then
  echo "At least one pending backup could not be uploaded; no new dump was created." >&2
  exit 1
fi

if [ "$RETRY_ONLY" -eq 1 ]; then
  exit 0
fi

if ! pg_isready -q; then
  echo "PostgreSQL is not ready at ${PGHOST}:${PGPORT:-5432}." >&2
  exit 1
fi

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
archive_name="muisbakery-${timestamp}.dump"
PLAINTEXT_DUMP="${PENDING_DIR}/${archive_name}"
encrypted_file="${PLAINTEXT_DUMP}.age"

echo "Creating a consistent PostgreSQL archive ${archive_name}."
pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="$PLAINTEXT_DUMP"

if [ ! -s "$PLAINTEXT_DUMP" ]; then
  echo "pg_dump produced an empty archive." >&2
  exit 1
fi

age --recipient "$BACKUP_AGE_RECIPIENT" \
  --output "$encrypted_file" \
  "$PLAINTEXT_DUMP"
rm -f "$PLAINTEXT_DUMP"
PLAINTEXT_DUMP=""

(
  cd "$PENDING_DIR"
  sha256sum "$(basename "$encrypted_file")" > "$(basename "$encrypted_file").sha256"
)

upload_archive "$encrypted_file"
mark_success
prune_local_archives

echo "Encrypted database backup completed successfully at $(cat "$STATUS_DIR/last-success.txt")."
