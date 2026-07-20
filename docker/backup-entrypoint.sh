#!/bin/sh

set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
STATUS_DIR="${BACKUP_ROOT}/status"
LAST_SUCCESS_FILE="${STATUS_DIR}/last-success.epoch"

is_positive_integer() {
  case "$1" in
    ''|*[!0-9]*|0) return 1 ;;
    *) return 0 ;;
  esac
}

run_daemon() {
  interval="${BACKUP_INTERVAL_SECONDS:-86400}"
  retry_interval="${BACKUP_RETRY_SECONDS:-900}"

  if ! is_positive_integer "$interval"; then
    echo "BACKUP_INTERVAL_SECONDS must be a positive integer." >&2
    exit 2
  fi

  if ! is_positive_integer "$retry_interval"; then
    echo "BACKUP_RETRY_SECONDS must be a positive integer." >&2
    exit 2
  fi

  mkdir -p "$STATUS_DIR" "${BACKUP_ROOT}/pending" "${BACKUP_ROOT}/completed"
  rm -rf "${BACKUP_ROOT}/.backup-lock"

  echo "Encrypted database backup service started."
  echo "Successful backups are scheduled every ${interval} seconds; failed uploads retry every ${retry_interval} seconds."

  while true; do
    if find "${BACKUP_ROOT}/pending" -type f -name '*.dump.age' -print -quit | grep -q .; then
      if /usr/local/bin/backup-postgres --retry-only; then
        echo "Pending backup uploads completed; checking whether a fresh backup is due."
        continue
      fi

      echo "Pending backup upload failed; retrying in ${retry_interval} seconds." >&2
      sleep "$retry_interval"
      continue
    fi

    now="$(date +%s)"
    last_success=0
    if [ -s "$LAST_SUCCESS_FILE" ]; then
      last_success="$(cat "$LAST_SUCCESS_FILE" 2>/dev/null || printf '0')"
      case "$last_success" in
        ''|*[!0-9]*) last_success=0 ;;
      esac
    fi

    elapsed=$((now - last_success))
    if [ "$last_success" -eq 0 ] || [ "$elapsed" -ge "$interval" ]; then
      if /usr/local/bin/backup-postgres; then
        sleep "$interval"
      else
        echo "Database backup failed; retrying in ${retry_interval} seconds." >&2
        sleep "$retry_interval"
      fi
      continue
    fi

    sleep_for=$((interval - elapsed))
    echo "Next database backup check in ${sleep_for} seconds."
    sleep "$sleep_for"
  done
}

case "${1:-daemon}" in
  daemon)
    run_daemon
    ;;
  backup-now)
    exec /usr/local/bin/backup-postgres
    ;;
  retry)
    exec /usr/local/bin/backup-postgres --retry-only
    ;;
  *)
    exec "$@"
    ;;
esac
