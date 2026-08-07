# Vulcan Factory Intelligence

Vulcan turns factory and farm CSV/Excel sources into validated operational records, vertical KPIs,
quantified losses and traceable recommendations. The same secured application skeleton is deployed
as independently configured automotive and mushroom cells.

This repository contains one lightweight application:

- Next.js display layer for the crop command centre, crop cycles, farm twin, performance, uploads,
  alerts, and stage-aware farm setup
- Django API as the validated analytical store for mushroom farms, source lineage, mappings,
  records and rules; connected farm sheets remain authoritative for operational facts
- Server-side CSV/XLSX inspection, mapping suggestions, validation and KPI calculation
- PostgreSQL-ready relational ownership with SQLite as the zero-infrastructure local default
- Celery, Redis and S3/MinIO scaffolding for a future asynchronous large-file path

The browser keeps only transient interaction state such as filters and the open tab. It does not
use local storage or IndexedDB and contains no import validation or KPI engine. Users sign in with
an email and password through a same-origin Django session; authorization is enforced again at
the tenant and factory boundaries on every protected request.

## Quick start

```bash
npm ci
uv sync --frozen
export DJANGO_DEBUG=true
export VULCAN_VARIANT=mushroom
export MUSHROOM_DEMO_EMAIL='developer@example.test'
export MUSHROOM_DEMO_PASSWORD='choose-a-unique-local-password'
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py seed_mushroom
.venv/bin/python backend/manage.py runserver
```

In a second terminal:

```bash
cp frontend/.env.example frontend/.env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The password must be unique, at least 15
characters and local-only. For the full SQLite and Docker Compose workflows, service integration,
troubleshooting, quality checks and the authenticated browser smoke suite, use the
[local development guide](docs/local-development.md).

An import-ready synthetic sample pack is in [`test-data/musroom`](test-data/musroom). Its README
maps each CSV to a source type and describes the intelligence it unlocks.

## Repository map

```text
frontend/app/             Next.js routes and global styles
frontend/components/      Display components and transient interaction state
frontend/lib/             Typed Django API client and response contracts
variants/                 Allowlisted, non-secret product manifests
infra/gcp/                Reusable Cloud Run vertical-cell deployment
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

See the [architecture guide](docs/architecture.md) for data boundaries, the
[product variant guide](docs/variants.md) for the shared-code/isolated-cell model, the
[local development guide](docs/local-development.md) for supported workflows, and the
[GCP deployment guide](docs/deployment-gcp.md) for the production topology and runbook.

## Production boundary

Email/password session authentication, distributed login throttling, CSRF protection,
active-membership checks and factory-scoped authorization are implemented. Production remains a
fail-closed profile with explicit secrets, PostgreSQL, Redis, exact hosts/origins and verified proxy
trust. The [GCP deployment guide](docs/deployment-gcp.md) is the authoritative environment matrix,
deployment sequence, operations runbook and launch-gap list. Never seed demo data or credentials in
production.
