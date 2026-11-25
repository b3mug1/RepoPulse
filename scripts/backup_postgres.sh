#!/usr/bin/env bash
set -euo pipefail

# PostgreSQL backup script for RepoPulse production Compose stack.
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

OUTPUT_FILE="${BACKUP_DIR}/repopulse_${TIMESTAMP}.sql.gz"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-analyzer}" -d "${POSTGRES_DB:-github_analyzer}" --clean --if-exists \
  | gzip > "$OUTPUT_FILE"

echo "Backup written to $OUTPUT_FILE"
