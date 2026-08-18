#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 || ! "$1" =~ ^(automotive|mushroom)$ || ! "$2" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <automotive|mushroom> <40-character-git-sha>" >&2
  exit 2
fi

requested_variant="$1"
new_image_tag="$2"
cd /opt/vulcan

exec 9>/run/vulcan-deploy.lock
flock -n 9 || {
  echo "Another Vulcan deployment or backup is running." >&2
  exit 1
}

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${GCP_REGION:?GCP_REGION is required}"
: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${AR_REPOSITORY:?AR_REPOSITORY is required}"
: "${VULCAN_VARIANT:?VULCAN_VARIANT is required}"

if [[ "$VULCAN_VARIANT" != "$requested_variant" ]]; then
  echo "Refusing variant mismatch: target=$VULCAN_VARIANT request=$requested_variant" >&2
  exit 2
fi

# No migration or container replacement is allowed before this succeeds.
./backup.sh

registry="${GCP_REGION}-docker.pkg.dev"
access_token="$(
  curl --fail --silent --show-error \
    -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])'
)"
printf '%s' "$access_token" | docker login -u oauth2accesstoken --password-stdin "$registry"

previous_image_tag="$(sed -n 's/^IMAGE_TAG=//p' .env)"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${new_image_tag}/" .env

rollback_tag() {
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${previous_image_tag}/" .env
}
trap rollback_tag ERR

docker compose --env-file .env pull
docker compose --env-file .env run --rm backend \
  python backend/manage.py migrate --plan
# Take a short maintenance window so old code cannot write during schema changes.
docker compose --env-file .env stop frontend backend
docker compose --env-file .env run --rm backend \
  python backend/manage.py migrate --noinput
docker compose --env-file .env run --rm backend \
  python backend/manage.py collectstatic --noinput
docker compose --env-file .env up -d --remove-orphans --wait --wait-timeout 180
docker compose --env-file .env ps

trap - ERR
docker logout "$registry" >/dev/null
printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$VULCAN_VARIANT" \
  "$new_image_tag" >> "/var/lib/vulcan/${VULCAN_VARIANT}/deployments.log"
echo "Deployed ${VULCAN_VARIANT} image tag ${new_image_tag}"
