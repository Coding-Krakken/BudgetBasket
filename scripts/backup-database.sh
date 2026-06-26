#!/usr/bin/env bash
# [INFRA-02] Logical database backup.
#
# Dumps the database at $DATABASE_URL_UNPOOLED (falls back to $DATABASE_URL)
# using pg_dump's custom format (compressed, supports selective restore via
# pg_restore). Prunes local dumps older than $BACKUP_RETENTION_DAYS (30).
#
# Usage: scripts/backup-database.sh [output-dir]
set -euo pipefail

OUT_DIR="${1:-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
SOURCE_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}"

if [ -z "$SOURCE_URL" ]; then
  echo "ERROR: set DATABASE_URL_UNPOOLED or DATABASE_URL" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$OUT_DIR/cartwise-${TIMESTAMP}.dump"

echo "Backing up database to ${DUMP_FILE}..."
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP_FILE" "$SOURCE_URL"

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "Backup complete: ${DUMP_FILE} (${SIZE})"

echo "Pruning backups older than ${RETENTION_DAYS} days in ${OUT_DIR}..."
find "$OUT_DIR" -name 'cartwise-*.dump' -mtime "+${RETENTION_DAYS}" -print -delete

echo "Done. $(find "$OUT_DIR" -name 'cartwise-*.dump' | wc -l) backup(s) retained."
