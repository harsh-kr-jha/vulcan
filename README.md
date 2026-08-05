# Musroom Factory Intelligence

Musroom turns mushroom-farm CSV and Excel files into validated crop records, cultivation KPIs,
room-condition intelligence, quantified losses, and traceable recommendations.

This repository contains one lightweight application:

- Next.js display layer for the crop command centre, crop cycles, farm twin, performance, uploads,
  alerts, and stage-aware farm setup
- Django API as the validated analytical store for mushroom farms, source lineage, mappings,
  records and rules; connected farm sheets remain authoritative for operational facts
- Server-side CSV/XLSX inspection, mapping suggestions, validation and KPI calculation
- PostgreSQL-ready relational ownership with SQLite as the zero-infrastructure local default
- Optional Celery, Redis and S3/MinIO deployment path for larger asynchronous workloads

The browser keeps only transient interaction state such as filters and the open tab. It does not
use local storage or IndexedDB and contains no import validation or KPI engine. Users sign in with
an email and password through a same-origin Django session; authorization is enforced again at
the tenant and factory boundaries on every protected request.

## Lightweight local development

```bash
npm install
uv sync
export DJANGO_DEBUG=true
.venv/bin/python backend/manage.py migrate
# Set both variables to credentials you chose and stored outside Git.
: "${MUSHROOM_DEMO_EMAIL:?Set an explicit development email}"
: "${MUSHROOM_DEMO_PASSWORD:?Set an explicit development password}"
export MUSHROOM_DEMO_EMAIL MUSHROOM_DEMO_PASSWORD
.venv/bin/python backend/manage.py seed_mushroom
.venv/bin/python backend/manage.py runserver
```

`MUSHROOM_DEMO_PASSWORD` must be unique, at least 15 characters, and pass Django's configured
password validators. There is no repository default. Supplying neither demo variable still seeds
the cultivation data but creates no login; supplying only one fails. When both are present, every
seed run intentionally rotates the non-staff development account to those credentials and grants
it company-admin access to the Musroom workspace. Never reuse that account or password outside a
local, disposable environment.

In another terminal:

```bash
cp frontend/.env.example frontend/.env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with the credentials you supplied,
and continue to `/dashboard`. The idempotent seed provides a complete Musroom showcase farm with
crop stages, rooms, seven days of climate observations, harvests, quality, downtime, materials,
suppliers, orders and crop cycles. You can also create a farm, configure its cultivation flow, and
import CSV/XLSX files. Django inspects every file. Optional source columns may be set to
**Do not import**; required-field and row mismatches include a correction, and rejected rows stay
outside the standard record table.

Crop cycles use the same source-connected path. Import **Crop cycle master** first, then **Crop
cycle stages**. The latest approved row for each batch and `(batch, stage code)` key drives the
portfolio, tracker, harvest prediction, documents, activities, Home counts and crop alerts.

An import-ready sample pack is in [`test-data/musroom`](test-data/musroom). Its README maps every
CSV to a Musroom source type and lists the intelligence unlocked by that source. Everything under
`test-data/` is synthetic. The ignored `MUSHROOM-DATA/` directory may contain photographed source
records and personal data: it must remain local and must never be committed or used as a fixture.

## Full local stack

```bash
cp backend/.env.example backend/.env
# Set unique MUSHROOM_DEMO_EMAIL and MUSHROOM_DEMO_PASSWORD values in backend/.env.
docker compose up --build
```

The Compose file is a local-development stack. Its database, cache and object-store credentials
are not production secrets, and its services are bound to the loopback interface where exposed.

- Application: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:8000/health/](http://localhost:8000/health/)
- Django admin: [http://localhost:8000/admin/](http://localhost:8000/admin/)

The Django admin route is registered only when `DJANGO_DEBUG=true`; it is intentionally absent
from production because its stock login is outside the application's distributed sign-in
throttles. Build a separately protected administrative control plane before exposing equivalent
production capabilities.
- MinIO console: [http://localhost:9001](http://localhost:9001)

PostgreSQL, Redis, and object storage are optional for the lightweight local workflow. Next.js
proxies `/api/backend/*` to `BACKEND_URL`, so the browser uses one origin and needs no public API
environment variable.

Django reads an optional `DJANGO_DATABASE_URL`. If it is absent, local management commands and
the development server use `backend/db.sqlite3`. Compose sets the PostgreSQL URL explicitly.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=moderate
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run ruff check .
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run pip-audit --strict
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run pytest
```

The UI smoke suite needs Django and a production Next.js server running against a disposable
database. It signs in through the landing page, covers the dashboard, server-side CSV
mapping/import, database persistence, actions and factory creation, and then signs out and confirms
that the session is no longer usable. Credentials are read from the environment and are never
printed.

```bash
npm start --workspace frontend -- -p 3100
VULCAN_BASE_URL=http://127.0.0.1:3100 \
VULCAN_SMOKE_EMAIL="$MUSHROOM_DEMO_EMAIL" \
VULCAN_SMOKE_PASSWORD="$MUSHROOM_DEMO_PASSWORD" \
npm run smoke:ui
```

## Repository map

```text
frontend/app/             Next.js routes and global styles
frontend/components/      Display components and transient interaction state
frontend/lib/             Typed Django API client and response contracts
backend/config/           Django settings, routing, WSGI/ASGI and Celery
backend/apps/tenancy/     Companies, factories and factory-owned master data
backend/apps/operations/  Upload inspection, mapping, validation, lineage and records
backend/apps/analytics/   Server-side aggregates, KPI definitions and loss events
backend/apps/alerts/      Rules, alerts and action register
backend/apps/audit/       Immutable business audit history
processing/               Framework-free readers, templates, mapping, validation and KPI primitives
test-data/                Synthetic import packs and expected results
docs/                     Architecture and implementation decisions
```

See [docs/architecture.md](docs/architecture.md) for the data boundaries and delivery path.

## Production boundary

Email/password session authentication, login throttling, CSRF protection, active-membership checks
and factory-scoped authorization are implemented. They are a baseline, not the whole production
programme. Before launch:

- Debug mode defaults off; enable it only in an explicit local/test environment. Production
  startup requires an explicit high-entropy secret key, PostgreSQL URL,
  Redis and cache URLs, and a non-wildcard host allowlist. Keep CORS origins and CSRF trusted
  origins as separate, exact allowlists.
- Terminate TLS at a known proxy, enable forwarded-protocol/host trust only for that verified
  topology, and verify Secure `__Host-` cookies, HTTPS redirect and HSTS in a staging environment.
  HSTS subdomain coverage and preload stay opt-in until every affected hostname is ready.
- Keep application and data services private; use managed secrets, least-privilege database and
  object-store identities, encrypted backups with restore drills, malware scanning and a deliberate
  retention/deletion policy for uploaded source rows.
- Add phishing-resistant MFA/passkeys, session inventory and revocation, and step-up checks before
  high-impact administrative actions. Preserve generic login failures and distributed throttling.
- Ship the implemented redacted JSON logs and request IDs to monitored, access-controlled storage.
  Add container scanning, an SBOM/provenance trail, representative authorization/load tests, and
  incident-ready audit retention. Never provision production users through a demo seed command.
