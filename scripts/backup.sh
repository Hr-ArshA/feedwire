#!/usr/bin/env bash
# Timestamped pg_dump of the Feedwire database.
set -euo pipefail
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/feedwire-$STAMP.sql.gz"
echo "Dumping to $FILE"
docker exec feedwire-db pg_dump -U feedwire -d feedwire --no-owner --clean --if-exists | gzip > "$FILE"
echo "Done: $FILE"
