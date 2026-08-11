# Local development

This guide is the authoritative local setup for Vulcan Factory Intelligence. Use the lightweight
workflow for normal application work and the Docker Compose workflow when you need to exercise the
same service boundaries used by a production deployment.

## Prerequisites

- Python 3.12
- Node.js 22 and npm (the package metadata permits Node 20.9+, but the container build uses Node 22)
- [`uv`](https://docs.astral.sh/uv/) for the locked Python environment
- Docker Desktop or another Compose-compatible Docker installation, only for the full stack
- Google Chrome or Chromium, only for the authenticated browser smoke test

Run commands from the repository root. Install locked dependencies once:

```bash
npm ci
uv sync --frozen
```

Do not put passwords, access keys, production exports, source workbooks, or real customer data in
Git. Everything under `test-data/` is synthetic. The ignored `MUSHROOM-DATA/` directory may contain
personal or photographed source data and must remain local.

## Choose a workflow

| Workflow | Database | Django cache | Celery | Object storage | Best for |
| --- | --- | --- | --- | --- | --- |
| Lightweight native | SQLite | Process-local memory | Eager/in-process | Not configured | UI, API and business-logic work |
| Docker Compose | PostgreSQL 17 | Redis 8 | Separate worker | Private MinIO bucket | Integration and service-boundary testing |

The lightweight workflow is a supported development convenience, not a production analogue.
Process-local throttles are not shared between web processes, eager tasks do not reproduce queue
behaviour, and SQLite does not reproduce PostgreSQL concurrency.

## Lightweight native workflow

### 1. Start Django

Django does **not** automatically load `backend/.env` when `manage.py` is run directly. Export the
environment in every shell that starts Django or Celery. The minimum safe local configuration is:

```bash
export DJANGO_DEBUG=true
export VULCAN_VARIANT=mushroom
unset DJANGO_DATABASE_URL DJANGO_CACHE_URL REDIS_URL
export CELERY_TASK_ALWAYS_EAGER=true

.venv/bin/python backend/manage.py migrate
```

With no `DJANGO_DATABASE_URL`, debug mode uses `backend/db.sqlite3`. With no
`DJANGO_CACHE_URL`, it uses Django's local-memory cache. `REDIS_URL` has a debug default, but no
Redis connection is made by the normal synchronous browser import path when tasks remain eager.

Use `VULCAN_VARIANT=automotive` in both Django and Next.js shells to run the automotive cell. See
the [product variant guide](variants.md) for the runtime contract and isolation model.

For the complete synthetic MYPOL Mysuru automotive showcase, use a separate database and run the
checksum-verifying seed command:

```bash
export DJANGO_DEBUG=true
export VULCAN_VARIANT=automotive
export CELERY_TASK_ALWAYS_EAGER=true
export DJANGO_DATABASE_URL='sqlite:///backend/automotive.sqlite3'
unset DJANGO_CACHE_URL REDIS_URL

.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py seed_mypol
.venv/bin/python backend/manage.py runserver 127.0.0.1:8000
```

When `vulcan-demo` already exists, `seed_mypol` adds the factory to that tenant, so its active
all-factory demo member can see MYPOL without another login. For a new database, provision an
explicit local-only login by setting both variables before running the command:

```bash
export MYPOL_DEMO_EMAIL='mypol.operator@example.test'
export MYPOL_DEMO_PASSWORD='choose-a-unique-local-password'
```

The command is idempotent, requires the automotive debug profile, verifies every fixture SHA-256
and row count, configures 4 lines, 23 ordered processes, 8 machines and all 66 source masters, then
imports 5,519 operational rows with preserved raw-row lineage. It also creates 161 explicitly
derived synthetic process snapshots so the Factory Twin has a useful seven-day state. The designed
stress window is `2026-07-25` through `2026-07-31`. It refuses to run in production.

Choose explicit, local-only showcase credentials. The password must be unique, at least 15
characters, and pass Django's similarity, common-password and numeric-password validators.

```bash
export MUSHROOM_DEMO_EMAIL='developer@example.test'
export MUSHROOM_DEMO_PASSWORD='choose-a-unique-local-password'
.venv/bin/python backend/manage.py seed_mushroom
.venv/bin/python backend/manage.py runserver 127.0.0.1:8000
```

The seed is idempotent. When both credential variables are supplied, every run deliberately rotates
the non-staff demo account to that password and grants it company-admin membership in the seeded
workspace. Supplying only one variable fails. Supplying neither seeds data without creating a
login. Never run this command against production and never reuse the demo credentials elsewhere.

If you want native PostgreSQL instead of SQLite, start your own local server and export an explicit
URL before migrating:

```bash
export DJANGO_DATABASE_URL='postgresql://vulcan:local-password@127.0.0.1:5432/vulcan'
.venv/bin/python backend/manage.py migrate
```

### 2. Start Next.js

In a second terminal:

```bash
cp frontend/.env.example frontend/.env.local
npm run dev
```

`frontend/.env.local` sets `BACKEND_URL=http://127.0.0.1:8000`. Next.js proxies
`/api/backend/*` to Django, so browser authentication uses same-origin cookies and no public API URL
is embedded in client code.

Open <http://localhost:3000> and sign in with the credentials you chose. Django's debug-only admin
is at <http://127.0.0.1:8000/admin/>. The admin URL is intentionally absent when
`DJANGO_DEBUG=false` because the stock admin login is not protected by the application's
distributed sign-in throttles.

## Full Docker Compose workflow

Compose starts PostgreSQL, Redis, MinIO, a one-shot bucket creator, Django/Gunicorn, Celery and
Next.js. Published development ports bind to loopback.

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set both `MUSHROOM_DEMO_EMAIL` and `MUSHROOM_DEMO_PASSWORD` to new local-only
values. The checked-in example deliberately contains disposable service credentials; do not reuse
them outside this local stack. Then start the services:

```bash
docker compose up --build
```

Available endpoints:

- Application: <http://localhost:3000>
- Django database health: <http://localhost:8000/health/>
- Debug-only Django admin: <http://localhost:8000/admin/>
- MinIO S3 API: <http://localhost:9000>
- MinIO console: <http://localhost:9001>

The backend container runs migrations and `seed_mushroom` before starting Gunicorn. The worker
listens to the `file_inspection`, `validation`, `standardisation`, `analytics`, and `reports`
queues. MinIO creates the private `vulcan-factory-data` bucket; `AWS_S3_PUBLIC_ENDPOINT_URL` rewrites
presigned URLs from the container-only `minio` hostname to `localhost` for the browser.

Useful lifecycle commands:

```bash
docker compose ps
docker compose logs -f backend worker frontend
docker compose stop
docker compose down
```

To reset **only disposable local Compose data**, confirm there is nothing you need and remove the
named PostgreSQL, Redis and MinIO volumes:

```bash
docker compose down --volumes
```

This permanently deletes the local Compose databases, queued state and stored objects. It does not
delete native `backend/db.sqlite3`.

## How external services are used

### PostgreSQL and SQLite

Django stores users, email identities, database-backed sessions, tenants, memberships, factories,
upload metadata, source headers and rows, standardized records, analytics, alerts and audits. In
debug mode, omitting `DJANGO_DATABASE_URL` selects SQLite. Production settings reject SQLite and
require a PostgreSQL URL.

### Redis

`REDIS_URL` is the Celery broker and result backend. `DJANGO_CACHE_URL` is the Django cache used by
the login IP/account throttles and REST Framework throttling. Compose uses logical databases `0`
and `1` on one Redis server.

Redis is optional only in the lightweight, single-process debug workflow. A shared cache is required
for login limits to hold across replicas. Production settings therefore require both URLs and reject
eager Celery execution. For production isolation guidance, see [GCP deployment](deployment-gcp.md).

### MinIO, S3 and Cloud Storage

The `ObjectStorage` boundary uses boto3 to create signed `PUT` URLs. It expects a private bucket,
the conventional `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` credential variables, and:

- `AWS_S3_BUCKET`
- `AWS_REGION`
- `AWS_S3_ENDPOINT_URL` for server-side boto3 calls
- `AWS_S3_PUBLIC_ENDPOINT_URL` for a browser-reachable signed URL
- `UPLOAD_URL_TTL_SECONDS` (900 seconds by default)

Keys are scoped under `raw/tenant-<id>/factory-<id>/...`; the signed request includes an exact
`Content-Type`. MinIO emulates this contract locally. The bucket remains private.

### Current import paths

The UI currently posts CSV/XLSX files to `/api/imports/inspect/`. Django:

1. rejects unsupported types and files larger than `MAX_SYNC_UPLOAD_BYTES` (10 MiB by default),
2. reads the request body into memory,
3. writes a temporary file for the tabular reader,
4. removes that temporary file when inspection completes, and
5. stores headers and raw rows in PostgreSQL or SQLite for mapping, review and commit.

This is the working browser path. `MAX_CSV_UPLOAD_BYTES` (500 MiB default) and
`MAX_EXCEL_UPLOAD_BYTES` (50 MiB default) apply to the separate presigned-upload API scaffold, not
the synchronous UI endpoint.

The presigned API can create an object URL and enqueue Celery state transitions, but the current
workers do not download and parse the object. S3-backed asynchronous ingestion is therefore **not
end-to-end complete** and must not be represented as a production large-file pipeline.

### Browser-fetched media

The landing page fetches Google Fonts and the hero video at
`zxdefgavgwfxastwmmjm.supabase.co` directly from the user's browser. Those providers receive normal
web-request metadata such as IP address and user agent. Review privacy, availability, content
security policy and data-residency requirements before launch; self-host the assets if those
dependencies are unacceptable.

## Common problems

### `DJANGO_SECRET_KEY is required when DJANGO_DEBUG is false`

Debug defaults to false. For a local shell, export `DJANGO_DEBUG=true` before any `manage.py`
command:

```bash
export DJANGO_DEBUG=true
.venv/bin/python backend/manage.py runserver
```

Do not solve this by inventing production-looking variables for local use. Production intentionally
fails closed unless all required settings are explicit.

### `redis` cannot be resolved

The hostname `redis` exists only inside Compose. Native processes must use `127.0.0.1` or omit the
cache URL in lightweight mode. Conversely, containers must use service names such as `redis`,
`postgres`, `minio`, and `backend`, not `localhost`, to reach sibling containers.

### CSRF or origin failures

Use one of the debug defaults (`localhost` or `127.0.0.1` on port 3000/3100) consistently. If you
introduce a different frontend origin, add the full origin, including scheme and port, to both
`CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS`, then restart Django. Do not use wildcard
origins.

### Missing tables or migration warnings

```bash
.venv/bin/python backend/manage.py showmigrations
.venv/bin/python backend/manage.py migrate
```

For Compose, run `docker compose exec backend python backend/manage.py migrate`.

### Demo password rejected

Use 15 or more characters, avoid the email/name, common password lists and all-numeric values. Set
both `MUSHROOM_DEMO_*` variables. The command intentionally does not print or supply a default.

### Port already in use

Inspect the conflicting process or change the development port. When Next runs on 3100, that origin
is already included in Django's debug defaults:

```bash
npm run dev --workspace frontend -- -p 3100
```

### Stale Next.js generated types

Stop Next.js and remove only its generated build directories, then rebuild. Do not hand-edit
`frontend/next-env.d.ts`; Next.js owns it.

## Quality and security checks

Run the normal static, unit, production-build and dependency checks before review:

```bash
npm run typecheck
npm run lint
VULCAN_VARIANT=mushroom npm run build
npm audit --audit-level=moderate
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run ruff check .
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run pip-audit --strict
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run pytest
```

The production settings tests verify the fail-closed configuration, exact hosts/origins, secure
cookie posture, Redis requirements and absence of the production admin route.

## Authenticated browser smoke test

The smoke test requires Django, a production Next.js build, a disposable database, a seeded login,
and Chrome/Chromium. It exercises reduced-motion rendering, the two-player video crossfade, login,
tenant/factory data, server-side import, persistence, actions, factory creation, logout and rejection
of the old session.

Build and start Next.js on a separate port after Django is running:

```bash
VULCAN_VARIANT=mushroom BACKEND_URL=http://127.0.0.1:8000 npm run build
VULCAN_VARIANT=mushroom BACKEND_URL=http://127.0.0.1:8000 npm start --workspace frontend -- -p 3100
```

Then, in another shell:

```bash
VULCAN_BASE_URL=http://127.0.0.1:3100 \
VULCAN_SMOKE_EMAIL="$MUSHROOM_DEMO_EMAIL" \
VULCAN_SMOKE_PASSWORD="$MUSHROOM_DEMO_PASSWORD" \
npm run smoke:ui
```

Optional variables include `CHROME_BIN`, `VULCAN_FIXTURE`, `VULCAN_FIXTURE_TYPE`,
`VULCAN_FIXTURE_DIR`, `VULCAN_SCREENSHOT`, and `VULCAN_DEBUG_PORT`. Use only synthetic fixtures.
