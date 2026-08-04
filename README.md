# Vulcan Factory Intelligence

Vulcan turns factory CSV and Excel files into validated operating records, explainable KPIs,
quantified losses, and traceable recommendations.

This repository contains one lightweight application:

- Next.js display layer for the command centre, Digital Twin, performance, uploads, alerts, and
  process-aware factory setup
- Django API as the source of truth for factories, master data, files, mappings, records and rules
- Server-side CSV/XLSX inspection, mapping suggestions, validation and KPI calculation
- PostgreSQL-ready relational ownership with SQLite as the zero-infrastructure local default
- Optional Celery, Redis and S3/MinIO deployment path for larger asynchronous workloads

The browser keeps only transient interaction state such as filters and the open tab. It does not
use local storage or IndexedDB and contains no import validation or KPI engine. Authentication is
temporarily disabled while the single-workspace model is being proven.

## Lightweight local development

```bash
npm install
uv sync
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py seed_mypol
.venv/bin/python backend/manage.py runserver
```

In another terminal:

```bash
cp frontend/.env.example frontend/.env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The idempotent seed provides the complete
MyPol showcase factory; you can also create a factory, configure its process flow, and import
CSV/XLSX files. Django inspects every file. Optional source columns may be set to
**Do not import**; required-field and row mismatches include a correction, and rejected rows stay
outside the standard record table.

## Full local stack

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

- Application: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:8000/health/](http://localhost:8000/health/)
- Django admin: [http://localhost:8000/admin/](http://localhost:8000/admin/)
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
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run ruff check .
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run pytest
```

The UI smoke suite needs Django and a production Next.js server running. It covers the dashboard,
server-side CSV mapping/import, database persistence, actions, and factory creation.

```bash
npm start --workspace frontend -- -p 3100
VULCAN_BASE_URL=http://127.0.0.1:3100 npm run smoke:ui
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

Before a production launch, restore real user authentication/authorization and add managed
secrets, TLS termination, private object storage, malware scanning, observability, backup
verification, representative load tests, and a deliberate retention policy for raw rows.
