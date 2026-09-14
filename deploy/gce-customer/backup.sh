#!/usr/bin/env bash
set -Eeuo pipefail

cd /opt/tamaso

if [[ ! -f .env ]]; then
  echo "Missing /opt/tamaso/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${GCS_BACKUP_BUCKET:?GCS_BACKUP_BUCKET is required}"
: "${CUSTOMER_ID:?CUSTOMER_ID is required}"
: "${DJANGO_DATABASE_URL:?Cloud SQL PostgreSQL URL is required}"

variant_root="/var/lib/tamaso/${CUSTOMER_ID}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="vulcan-${CUSTOMER_ID}-${timestamp}.dump"
container_backup_path="/backups/${backup_name}"
host_backup_path="${variant_root}/backups/${backup_name}"

docker compose --env-file .env run --rm --no-deps \
  postgres-tools pg_dump \
  --dbname "$DJANGO_DATABASE_URL" \
  --format custom \
  --file "$container_backup_path"

test -s "$host_backup_path"

access_token="$(
  curl --fail --silent --show-error \
    -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])'
)"
object_name="postgres/${CUSTOMER_ID}/${backup_name}"
encoded_object_name="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$object_name")"

curl --fail --silent --show-error \
  -X POST \
  -H "Authorization: Bearer ${access_token}" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary "@${host_backup_path}" \
  "https://storage.googleapis.com/upload/storage/v1/b/${GCS_BACKUP_BUCKET}/o?uploadType=media&name=${encoded_object_name}" \
  >/dev/null

find "${variant_root}/backups" -type f -name "vulcan-${CUSTOMER_ID}-*.dump" \
  -mtime +7 -delete
echo "Backup uploaded: gs://${GCS_BACKUP_BUCKET}/${object_name}"
