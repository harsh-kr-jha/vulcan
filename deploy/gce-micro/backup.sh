#!/usr/bin/env bash
set -Eeuo pipefail

cd /opt/vulcan

if [[ ! -f .env ]]; then
  echo "Missing /opt/vulcan/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${GCS_BACKUP_BUCKET:?GCS_BACKUP_BUCKET is required}"
: "${VULCAN_VARIANT:?VULCAN_VARIANT is required}"
case "$VULCAN_VARIANT" in
  automotive|mushroom) ;;
  *) echo "Unsupported VULCAN_VARIANT: $VULCAN_VARIANT" >&2; exit 2 ;;
esac

variant_root="/var/lib/vulcan/${VULCAN_VARIANT}"
database_path="${variant_root}/data/vulcan.sqlite3"
if [[ ! -f "$database_path" ]]; then
  echo "No SQLite database exists yet; there is nothing to back up."
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="vulcan-${VULCAN_VARIANT}-${timestamp}.sqlite3"
container_backup_path="/backups/${backup_name}"
host_backup_path="${variant_root}/backups/${backup_name}"

docker compose --env-file .env run --rm --no-deps \
  -e "VULCAN_BACKUP_PATH=${container_backup_path}" \
  backend python -c \
  "import os, sqlite3; source=sqlite3.connect('/data/vulcan.sqlite3'); target=sqlite3.connect(os.environ['VULCAN_BACKUP_PATH']); source.backup(target); target.close(); source.close()"

test -s "$host_backup_path"

access_token="$(
  curl --fail --silent --show-error \
    -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])'
)"
object_name="sqlite/${VULCAN_VARIANT}/${backup_name}"
encoded_object_name="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$object_name")"

curl --fail --silent --show-error \
  -X POST \
  -H "Authorization: Bearer ${access_token}" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary "@${host_backup_path}" \
  "https://storage.googleapis.com/upload/storage/v1/b/${GCS_BACKUP_BUCKET}/o?uploadType=media&name=${encoded_object_name}" \
  >/dev/null

find "${variant_root}/backups" -type f -name "vulcan-${VULCAN_VARIANT}-*.sqlite3" \
  -mtime +7 -delete
echo "Backup uploaded: gs://${GCS_BACKUP_BUCKET}/${object_name}"
