#!/usr/bin/env bash
# [INFRA-02] Restore a pg_dump custom-format backup into a target database.
#
# Intended for quarterly restore drills and real recovery. ALWAYS restore
# into a fresh/scratch database first to verify the dump, never directly
# onto a database with data you care about, unless that's the explicit
# recovery goal.
#
# Usage: scripts/restore-database.sh <dump-file> <target-database-url>
set -euo pipefail

DUMP_FILE="${1:-}"
TARGET_URL="${2:-}"

if [ -z "$DUMP_FILE" ] || [ -z "$TARGET_URL" ]; then
  echo "Usage: scripts/restore-database.sh <dump-file> <target-database-url>" >&2
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "ERROR: dump file not found: $DUMP_FILE" >&2
  exit 1
fi

echo "Restoring ${DUMP_FILE} into target database..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$TARGET_URL" "$DUMP_FILE"

echo "Restore complete. Run a few sanity queries (row counts, a recent CartPlan) before trusting this database."
