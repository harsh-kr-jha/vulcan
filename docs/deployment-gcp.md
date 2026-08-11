# Deploying to Google Cloud

This is the recommended production deployment for the repository as it exists today. It uses a
Cloud Run-first topology in `asia-south1` as an India-oriented example. Replace every value in angle
brackets; do not paste placeholders into a real environment.

This guide is intentionally current-state honest. The small synchronous import workflow works, but
S3/Cloud Storage-backed asynchronous ingestion is not production-complete. Review [launch gaps](#launch-gaps)
before approving a production release.

## Target topology

```text
Internet
   |
External HTTPS load balancer + managed certificate + optional Cloud Armor
   |
Cloud Run service (ingress restricted to the load balancer)
   |-- Next.js ingress container: $PORT (normally 8080)
   `-- Django/Gunicorn sidecar: 127.0.0.1:8000
          |-- Cloud SQL for PostgreSQL (private connectivity)
          |-- Memorystore for Django cache/login throttles
          `-- Cloud Storage private bucket (interim boto3/HMAC integration)

Optional future Cloud Run worker pool (Celery; not deployed while asyncUploads=false)
   |-- Memorystore broker/result backend
   |-- Cloud SQL
   `-- Cloud Storage (after end-to-end object processing is implemented)

Cloud Run job (release checks and migrations) --> Cloud SQL
Secret Manager --> pinned secrets for web and migration identities
Artifact Registry --> immutable frontend and backend images
Cloud Logging/Monitoring --> logs, metrics, alerts and incident evidence
```

[Cloud Run multi-container services](https://docs.cloud.google.com/run/docs/deploying) share the
network namespace and can communicate over `localhost`. Only one container receives ingress; order
the sidecar startup before Next.js and give both containers startup probes. When asynchronous
ingestion is complete, a
[Cloud Run worker pool](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run) can host
the continuous Celery process. Worker pools still require manual or custom scaling in 2026. The
checked-in deployment does not create one while both manifests set `asyncUploads=false`.

Do not run migrations, collect deployment checks, or seed data in the web container's startup
command. Multiple Cloud Run instances may start concurrently. Use a one-task Cloud Run job for each
release and make service rollout depend on its success.

## Current production boundary

Implemented controls include email/password Django sessions, Argon2 password hashing, CSRF,
HttpOnly/Secure `__Host-` cookies, exact host/origin validation, tenant/factory authorization,
database-backed sessions, cache-backed login throttles, request IDs, log redaction, HSTS, HTTPS
redirects and a production URL configuration without Django admin.

These controls are a baseline rather than a declaration of production readiness. In particular:

- The browser's working import endpoint accepts CSV/XLSX files up to `MAX_SYNC_UPLOAD_BYTES`, reads
  them through temporary disk and stores source headers/raw rows in PostgreSQL.
- The presigned-object API and Celery queues exist, but workers currently advance states without
  downloading and parsing the object. Do not advertise or operate it as a complete large-file
  ingestion path.
- The `/health/` endpoint verifies Django and its database only. It does not prove Redis, Cloud
  Storage or Celery health.
- The production Django admin route is intentionally absent. The custom `createsuperuser` command
  creates an email identity but does not provision a tenant membership; production user onboarding
  still needs a controlled workflow.

## Resource and identity model

Use separate Google service accounts, with no user-managed JSON key files:

| Identity | Runs | Minimum access |
| --- | --- | --- |
| `<web-sa>` | Next.js + Django Cloud Run service | Read only its pinned secrets; connect to Cloud SQL; object permission only if the web API issues signed URLs |
| `<worker-sa>` (future) | Celery worker pool | Create only with the completed async path; read worker secrets, connect to Cloud SQL and access only its cell's bucket/queues |
| `<migration-sa>` | Release Cloud Run job | Read migration/database secrets; connect to Cloud SQL; no public ingress or object access unless a migration explicitly requires it |
| `<build-sa>` | CI/build pipeline | Push immutable images, attest build output and deploy approved revisions; no application data access |

Grant roles on individual secrets and buckets instead of the whole project. Keep the runtime service
accounts distinct from the deployer. Deny service-account key creation where practical and use
Workload Identity Federation for CI.

Create a dedicated VPC/subnet in the selected region. Use Direct VPC egress for the service, worker
pool and migration job. Keep Cloud SQL and Memorystore on private addresses. Constrain egress with
firewall policy and log denied connections.

## Environment variables

Treat this table as the deployment contract. Secret values belong in Secret Manager; ordinary
configuration belongs in the Cloud Run revision. Boolean values must be the literal lowercase
`true` or `false`.

### Django, authentication and edge trust

| Variable | Required production value | Secret | Notes |
| --- | --- | --- | --- |
| `VULCAN_VARIANT` | `mushroom` or `automotive` | No | Required in production and fixed per deployment cell. Unknown values fail startup. |
| `DJANGO_DEBUG` | `false` | No | Defaults false. Never enable in a deployed environment. |
| `DJANGO_SECRET_KEY` | Long random value, at least 50 characters | Yes | Must not start with `django-insecure-`; rotation invalidates signatures/throttle hashes and needs a planned session strategy. |
| `DJANGO_ALLOWED_HOSTS` | `<app.example.com>,localhost` | No | Comma-separated exact hostnames only; no scheme, path, wildcard or leading dot. `localhost` supports the verified Next-to-sidecar/probe path; remove it if staging proves it unnecessary. Add another host only if the request can legitimately reach Django with that `Host`. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://<app.example.com>` | No | Comma-separated exact HTTPS origins. Required in production. |
| `CORS_ALLOWED_ORIGINS` | Empty for the same-origin Next proxy | No | If a separate browser origin is approved, list exact HTTPS origins; never use `*` with credentials. |
| `DJANGO_NUM_PROXIES` | Staging-verified non-negative count | No | Used by DRF client-IP identification. Do not guess; verify the real load-balancer/Next proxy `X-Forwarded-For` chain. |
| `DJANGO_TRUST_PROXY_HEADERS` | `true` only after header-chain validation | No | Enables trust of `X-Forwarded-Proto=https`. Keep false until ingress strips caller-supplied forwarding headers and the topology is verified. |
| `DJANGO_USE_X_FORWARDED_HOST` | Normally `false`; enable only if verified and needed | No | Requires `DJANGO_TRUST_PROXY_HEADERS=true`. |
| `SESSION_COOKIE_AGE_SECONDS` | `28800` or approved shorter lifetime | No | Session also expires at browser close. Sessions are database-backed. |
| `LOGIN_IP_RATE` | `10/15m` baseline | No | Validate against abuse tests and support requirements. |
| `LOGIN_ACCOUNT_RATE` | `5/15m` baseline | No | Account keys are keyed-HMAC fingerprints, not raw email addresses. |
| `DJANGO_HSTS_INCLUDE_SUBDOMAINS` | `false` until every subdomain is HTTPS-only | No | Opt in only after a complete domain inventory. |
| `DJANGO_HSTS_PRELOAD` | `false` until the domain meets preload requirements | No | Preload is difficult to reverse; treat it as a separate security change. |

Django sets a one-year base HSTS policy, HTTPS redirect, `SameSite=Lax`, HttpOnly/Secure cookies,
`__Host-vulcan-session`, `__Host-vulcan-csrf`, `X-Frame-Options: DENY`, content-type nosniff and a
same-origin referrer policy whenever debug is false. The Next.js production build also emits a
one-year base HSTS header. Configure the load balancer consistently and test the final response,
not just container settings.

### Data, queue and cache

| Variable | Required production value | Secret | Notes |
| --- | --- | --- | --- |
| `DJANGO_DATABASE_URL` | `postgresql://<user>:<encoded-password>@<private-host>:5432/<database>?sslmode=require` | Yes | Production rejects non-PostgreSQL engines. URL-encode credentials. If the chosen private path terminates TLS differently, use the Cloud SQL-supported connector/CA configuration and document it. |
| `REDIS_URL` | `rediss://:<encoded-auth>@<broker-host>:<port>/0` | Yes | Celery broker and result backend. Validate the TLS CA chain in the deployed image. |
| `DJANGO_CACHE_URL` | `rediss://:<encoded-auth>@<cache-host>:<port>/0` | Yes | Shared cache for login and API throttles. May be `/1` on the same instance only in the minimum topology. |
| `CELERY_TASK_ALWAYS_EAGER` | `false` | No | Production startup rejects `true`. |

`dj-database-url` sets a 60-second persistent connection lifetime. Build a database connection
budget before deployment:

```text
maximum web connections ~= maximum Cloud Run web instances * 3 Gunicorn workers
maximum worker connections ~= worker-pool instances * Celery process concurrency
job/headroom            ~= migrations + operations + monitoring + safety margin
```

Set Cloud Run maximum instances and Celery concurrency so the sum remains safely below the Cloud
SQL connection limit. Confirm with load tests; add a managed connection pool only when its failure
mode and transaction semantics have been tested.

### Object storage and import limits

| Variable | Production value | Secret | Notes |
| --- | --- | --- | --- |
| `AWS_S3_BUCKET` | `<private-upload-bucket>` | No | Required only for the presigned-object scaffold. Leave empty if that API is disabled operationally. |
| `AWS_S3_ENDPOINT_URL` | `https://storage.googleapis.com` | No | Existing boto3 compatibility path. |
| `AWS_S3_PUBLIC_ENDPOINT_URL` | `https://storage.googleapis.com` | No | Browser-facing endpoint used when rewriting signed URLs. |
| `AWS_REGION` | `auto` | No | Cloud Storage boto3 interoperability value. |
| `AWS_ACCESS_KEY_ID` | Cloud Storage HMAC access ID | Yes | Interim long-lived credential; store as a pinned secret. |
| `AWS_SECRET_ACCESS_KEY` | Cloud Storage HMAC secret | Yes | Interim long-lived credential; never log or bake into an image. |
| `UPLOAD_URL_TTL_SECONDS` | `900` baseline | No | Shorten if the client workflow permits. |
| `MAX_SYNC_UPLOAD_BYTES` | `10485760` baseline | No | Actual working browser import limit; account for Cloud Run request-size and memory constraints before raising. |
| `MAX_CSV_UPLOAD_BYTES` | `524288000` baseline | No | Presigned scaffold limit; not the synchronous endpoint limit. |
| `MAX_EXCEL_UPLOAD_BYTES` | `52428800` baseline | No | Presigned scaffold limit; not the synchronous endpoint limit. |

Google documents S3 compatibility through the Cloud Storage
[XML API interoperability layer](https://docs.cloud.google.com/storage/docs/interoperability) and
an official [boto3 example](https://docs.cloud.google.com/storage/docs/samples/storage-s3-sdk-list-objects).
The existing code requires HMAC credentials because it constructs a boto3 client directly. HMAC is
an interim compatibility measure: refactor the storage boundary to the native Cloud Storage client
and Application Default Credentials so the runtime service accounts can use Workload Identity
without long-lived object credentials.

Keep public access prevention enabled on the bucket. Set exact-origin CORS for the application
origin, allowing only `PUT` and the `Content-Type` request header required by the signature. Do not
add `*` origins. Add lifecycle, retention and deletion rules based on the source-data policy, and
test legal-hold implications before enabling locked retention. Signed URLs use the XML API and do
not make the bucket public. See the official [signed URL](https://docs.cloud.google.com/storage/docs/signed-urls)
and [CORS](https://docs.cloud.google.com/storage/docs/configuring-cors) guidance.

### Frontend and observability

| Variable | Value | Secret | Notes |
| --- | --- | --- | --- |
| `BACKEND_URL` | `http://localhost:8000` | No | Set as a frontend image build argument and runtime variable for the Cloud Run sidecar topology. |
| `DJANGO_LOG_LEVEL` | `INFO` | No | Production logs are JSON. Do not enable verbose logging to diagnose secrets or customer data. |
| `NEXT_TELEMETRY_DISABLED` | `1` | No | Already set in the frontend image. |
| `NODE_ENV` | `production` | No | Already set in the frontend runtime image. |
| `PORT` | Cloud Run-provided value | No | Do not override. Next.js must be the ingress container and listen on this port. Django remains on 8000. |

The browser also connects directly to Google Fonts and the Supabase-hosted hero video. Review those
processors for privacy, availability and regional requirements, define an appropriate CSP, or
self-host the assets before launch.

## Managed dependencies

### Cloud SQL for PostgreSQL

- Use a supported PostgreSQL release, private IP, regional high availability where the recovery
  objective requires it, encryption, automated backups and point-in-time recovery.
- Create distinct application and migration database roles. The web/worker role must not own the
  database or have schema-alter privileges.
- Use Secret Manager for the DSN and rotate credentials with an overlap/cutover procedure.
- Monitor CPU, memory, disk, connections, transaction latency, replication/HA events and backup
  success. Alert before connection or storage exhaustion.
- Schedule restore drills into an isolated project/network and record measured RPO/RTO. A backup
  that has never been restored is not sufficient evidence.

Follow the official [Cloud SQL connection guidance for Cloud Run](https://docs.cloud.google.com/sql/docs/postgres/connect-run).

### Memorystore for Redis

Connect Cloud Run through
[Direct VPC egress](https://docs.cloud.google.com/memorystore/docs/redis/connect-redis-instance-cloud-run).
Require AUTH and in-transit encryption, and validate the CA/trust configuration from the actual
containers before shifting traffic.

The minimum deployment may use one instance with logical database 0 for Celery and 1 for Django.
The recommended production deployment uses separate Memorystore instances: queue/result pressure
must not evict or starve login-throttle keys. In either design:

- use bounded memory and an eviction policy chosen with both data classes understood,
- alert on memory, evictions, connections, rejected connections, command latency and availability,
- monitor Celery queue depth, oldest-message age, retries, failures and worker heartbeat,
- set worker concurrency and queue routing explicitly, and
- test Redis failover/restart behaviour, including login throttles and duplicate task delivery.

Celery delivery is at least once. Keep tasks idempotent and do not treat the result backend as the
system of record.

### Secret Manager

Inject secrets as environment variables from explicitly pinned Secret Manager versions, following
the [Cloud Run Secret Manager guidance](https://docs.cloud.google.com/run/docs/configuring/services/secrets).
Pinning makes a revision reproducible; rotation means adding a version, deploying a new revision,
validating it, shifting traffic, then disabling the previous version after rollback windows close.
Never mount or ship service-account JSON keys.

## Build and release

The examples use immutable commit-based tags. Prefer digest-pinned deployment after CI records the
image digest, vulnerability scan, SBOM, provenance and test evidence.

```bash
export GCP_PROJECT='<project-id>'
export GCP_REGION='asia-south1'
export AR_REPOSITORY='<artifact-repository>'
export RELEASE_SHA='<full-git-commit-sha>'

gcloud auth configure-docker "$GCP_REGION-docker.pkg.dev"

docker build \
  --file backend/Dockerfile \
  --tag "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$AR_REPOSITORY/backend:$RELEASE_SHA" .
docker push "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$AR_REPOSITORY/backend:$RELEASE_SHA"

docker build \
  --file frontend/Dockerfile \
  --build-arg BACKEND_URL=http://localhost:8000 \
  --tag "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$AR_REPOSITORY/frontend:$RELEASE_SHA" .
docker push "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$AR_REPOSITORY/frontend:$RELEASE_SHA"
```

The frontend Dockerfile accepts `BACKEND_URL` as a Docker build argument. In CI, use a reviewed Cloud
Build configuration that passes the same argument without interpolating untrusted input. Confirm the
built rewrite target in a staging revision. Do not deploy a frontend built with the Compose hostname
`backend`.

Use CI to run, at minimum:

```bash
npm ci
npm run typecheck
npm run lint
VULCAN_VARIANT=mushroom npm run build
npm audit --audit-level=moderate
uv sync --frozen
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run ruff check .
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run pip-audit --strict
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run pytest
```

Fail the release on test, audit, image scanning or provenance policy failures. Pin CI actions and
builders, protect the deployment environment, require review, and retain an auditable link from Git
commit to image digest to Cloud Run revision.

## Deployment sequence

### 1. Provision the platform

1. Create/select `<project-id>`, billing, `asia-south1`, separate production and non-production
   projects, and organization policies.
2. Enable Cloud Run, Compute, Service Networking, Cloud SQL Admin, Memorystore, Secret Manager,
   Artifact Registry, Cloud Build, Logging and Monitoring APIs.
3. Create the VPC/subnet, private service connectivity, firewall policy, DNS and egress controls.
4. Create the four service accounts and grant resource-level least privilege.
5. Provision Cloud SQL, the recommended separate Redis cache/broker instances, and the private
   Cloud Storage bucket.
6. Create secret versions for Django, PostgreSQL, Redis and interim HMAC values. Record owners,
   rotation dates and emergency revocation procedures.
7. Create the external global HTTPS load balancer, managed certificate, optional Cloud Armor policy
   and DNS record. Keep the service unavailable to public traffic until validation is complete.

### 2. Build immutable images

Build the backend once for the web sidecar and migration job (and a future worker pool). Build the frontend with
`BACKEND_URL=http://localhost:8000`. Store images in Artifact Registry and deploy by digest.

### 3. Run release checks and migrations

Create a Cloud Run job from the backend image with the migration identity, private VPC access,
database secret and the complete fail-closed Django environment. Configure exactly one task and no
parallelism. The release procedure should run:

```bash
python backend/manage.py check --deploy --fail-level WARNING
python backend/manage.py migrate --noinput
python backend/manage.py migrate --check
```

`check --deploy` uses the actual production settings; do not substitute test settings. Serialize
schema-changing releases and use expand/migrate/contract changes when old and new revisions overlap.
Take or verify a recoverable backup before destructive migrations. Never run `seed_mushroom`,
`seed_demo`, `seed_mypol`, or any demo credential command in production.

For repeatable multi-subdomain cells, see the checked-in `infra/gcp/` Terraform root and the
[product variant guide](variants.md). It uses Google provider 7.41, Cloud Run v2 multi-container
services, Direct VPC egress and one migration job per allowlisted vertical. The shared external HTTPS
load balancer maps each exact hostname to that cell's serverless NEG/backend service.

### 4. Deploy the multi-container service

Deploy one Cloud Run service definition with:

- Next.js as the ingress container, receiving Cloud Run's `PORT` (normally 8080),
- Django as a sidecar bound to `0.0.0.0:8000`, reachable by Next at `localhost:8000`,
- Django startup before Next, backed by a TCP/HTTP startup probe on port 8000,
- a frontend startup/liveness probe on its ingress port,
- Direct VPC egress and private managed-service routes,
- distinct CPU/memory limits and no writable-state assumptions for either container,
- minimum instances only if cold-start requirements justify the cost, and
- a maximum-instance cap derived from the Cloud SQL and Redis connection budgets.

The backend image currently starts three Gunicorn workers with a 60-second timeout. Size memory and
database connections for that fact, and load-test synchronous XLSX/CSV inspection within the 10 MiB
application limit. Cloud Run's filesystem is ephemeral; this is acceptable only because the
synchronous temporary file is consumed within one request and the durable rows go to PostgreSQL.

Restrict service ingress to `internal-and-cloud-load-balancing` (the Cloud Run option that permits
the external Application Load Balancer while blocking direct internet ingress) and disable the
default `run.app` URL after the domain path is proven. Follow the official
[Cloud Run ingress guidance](https://docs.cloud.google.com/run/docs/securing/ingress).

### 5. Keep asynchronous ingestion disabled

Both checked-in variants declare `asyncUploads=false`, and the API rejects the presigned/queued
workflow. Do not create a worker pool for the initial cells.

After end-to-end object download, malware scanning, integrity checks, parsing and idempotent retry
handling are implemented and the manifest is intentionally enabled, use the same backend digest and
override its command with:

```bash
celery -A config worker -l INFO \
  -Q file_inspection,validation,standardisation,analytics,reports
```

Set an explicit concurrency appropriate to CPU, memory and the Cloud SQL connection budget. Supply
the production Django, database, Redis and storage environment and the worker identity. Worker pools
need deliberate instance sizing and deployment; queue depth does not automatically create a safe
autoscaling policy.

The worker pool does not automatically scale. Set its instance count and concurrency from measured
queue/database capacity, and validate staged rollout semantics before enabling the browser feature.

### 6. Validate before traffic shift

Deploy a no-traffic/canary revision and validate through the real load balancer hostname:

- TLS certificate, redirects, HSTS and all security headers
- exact Host and CSRF origin acceptance; rejection of unapproved values
- the actual `X-Forwarded-For`, `X-Forwarded-Proto` and host chain before finalizing
  `DJANGO_NUM_PROXIES` or proxy-trust flags
- Secure `__Host-` cookie attributes and absence of cookies on plaintext HTTP
- generic login errors, IP/account throttling shared across multiple instances, and successful-login
  account-bucket clearing
- authenticated tenant/factory isolation, logout and rejection of the old session
- synchronous CSV/XLSX import, temporary-storage/memory behaviour, PostgreSQL persistence and audit
  events
- direct Cloud Run URL rejection and production `/admin/` absence
- database health plus independent Redis, Celery and Cloud Storage synthetic checks
- redacted JSON logs and `X-Request-ID` correlation without passwords, cookies, tokens or raw rows

Shift a small percentage of traffic, watch application and dependency signals, then increase in
controlled steps. Record acceptance evidence and the rollback threshold.

## Operations

### Health, logs and alerts

Use sidecar `/health/` (proxied externally as `/api/backend/health/`) only as the Django/database
readiness signal. Add independent platform probes or synthetic checks for Redis, workers, queue
flow and Cloud Storage; do not make every user request
depend on all services being healthy.

Production Django logs JSON to stdout. Each request receives a server-generated 32-hex-character
request ID returned as `X-Request-ID`; inbound IDs are intentionally ignored. A safety filter
redacts common password, token, secret, authorization, cookie, session, credential and API-key
fields. SQL parameter logging remains at warning even if application verbosity changes. Still apply
least-privilege log access, retention limits and periodic redaction tests—filters are not permission
to log business data.

Alert on:

- elevated 5xx/429 rates, latency and failed login anomalies,
- Cloud Run instance saturation, startup failures, memory and CPU,
- Cloud SQL availability, latency, connections, disk, replication and backup failures,
- Redis availability, memory, evictions, connections and latency,
- Celery queue depth/age, worker heartbeat, retries and terminal failures,
- Cloud Storage authorization/CORS errors and unexpected object growth,
- secret/IAM/config changes and denied ingress/egress, and
- certificate expiry and synthetic login/import/logout failure.

Alerts need named owners, severity, runbooks and tested paging routes. Avoid email addresses, raw
filenames, request bodies and credentials in alert payloads.

### Backup and restore

Define RPO/RTO per data class. Enable Cloud SQL automated backups and PITR; validate restoration and
application consistency in isolation. Redis is queue/cache infrastructure, not the authoritative
record—design worker recovery and task idempotency rather than relying on cache restoration. Apply
Cloud Storage versioning/retention only where the deletion and privacy policies justify it, and test
recovery without weakening public-access controls.

### Rotation and incident response

Rotate database, Redis and HMAC credentials through new Secret Manager versions and new Cloud Run
revisions. Test overlap where the provider supports it. Rotation of `DJANGO_SECRET_KEY` affects
signed values and should be treated as a security migration with an explicit session invalidation
decision.

Maintain an incident runbook covering traffic disablement, revision rollback, credential
revocation, account/session containment, object quarantine, evidence preservation, customer/legal
notification and recovery validation. Database-backed sessions can be deleted centrally today, but
the product has no user-facing session inventory/revocation workflow.

### Rollback

Retain the last known-good image digests and Cloud Run revision. Roll back application traffic only
when the database migration remains backward-compatible. For incompatible schema changes, use the
documented forward-fix or restore procedure rather than blindly routing old code to a new schema.
Worker and web revisions must remain protocol/schema compatible during a staged rollout.

## Launch gaps

Resolve or explicitly accept these gaps before a production launch:

- Malware scanning and quarantine before untrusted uploads reach parsers or downstream users
- Native Cloud Storage authentication with Workload Identity, replacing HMAC credentials
- End-to-end worker object download, integrity/size verification, parsing and durable retry handling
- A controlled production user invitation/onboarding and membership-provisioning workflow
- Phishing-resistant MFA/passkeys and step-up authentication for high-impact actions
- User/admin session inventory and targeted revocation
- Staging-verified `DJANGO_NUM_PROXIES` and trusted-forwarding-header configuration
- A reviewed CSP and privacy decision for Google Fonts and the Supabase-hosted hero video
- Load/authorization tests representative of production tenants and files
- Documented source-row/object retention, deletion, legal-hold and data-residency policies

Until the asynchronous ingestion gaps are closed, the supported browser workflow sends small files
to Django and stores raw rows in PostgreSQL. Keep `MAX_SYNC_UPLOAD_BYTES` conservative, monitor
memory/latency, and do not claim that Cloud Storage removes application upload limits.

## Release acceptance checklist

- [ ] Production and non-production are isolated; project/region/domain/resource placeholders were replaced.
- [ ] Images are immutable, scanned, attested and tied to the reviewed commit.
- [ ] Web, migration and build identities are separate and least-privileged; a worker identity exists only if async ingestion is complete and enabled.
- [ ] Secrets are pinned Secret Manager versions; no credential files or secrets exist in images/logs.
- [ ] Cloud SQL private connectivity, connection budget, backups, PITR and restore drill are verified.
- [ ] Redis cache and broker isolation, AUTH/TLS, memory bounds and monitoring are verified.
- [ ] The private bucket has exact CORS, lifecycle/retention policy and public access prevention.
- [ ] Release checks and migrations succeeded once through the migration job; no demo seed ran.
- [ ] Load-balancer-only ingress and the real forwarding-header chain were tested.
- [ ] Cookies, CSRF, throttling, authorization, imports, logout and admin-route absence passed staging smoke tests.
- [ ] Logs are structured/redacted and operational alerts, owners, rollback and incident runbooks are live.
- [ ] Every unresolved launch gap has an owner, deadline and recorded risk decision.
