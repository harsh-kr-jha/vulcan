# Vulcan Factory Intelligence

Vulcan turns factory CSV and Excel files into validated operating records, explainable
KPIs, quantified losses, and traceable recommendations.

This repository implements the first coherent MVP vertical slice from the product
specification:

- Responsive Next.js application with overview, performance, uploads, alerts, and factory setup
- Django 5.2 API with session authentication and tenant/factory access enforcement
- Explicit upload state machine and direct-to-S3 upload URLs
- Idempotent Celery jobs routed by inspection, validation, standardisation, and analytics stage
- Versioned KPI definitions, daily aggregates, loss events, alert rules, and audit records
- Deterministic mapping, validation, safe spreadsheet inspection, and OEE calculation primitives
- PostgreSQL, Redis, and MinIO local environment through Docker Compose

The product preview is fully interactive without standing up infrastructure. Its browser-side
provider preserves raw rows, approved mappings, standardised records, factory configuration,
alerts, and actions in local storage. The provider is the UI boundary that can be replaced by
the Django APIs and asynchronous workers for a shared production deployment.

## Quick start

### Product preview

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard starts with validated demo
data and supports CSV/XLSX import, Google Sheets, manual entry, mapping, validation, master-data
editing, filters, actions, and traceable rule-based answers. Imported data persists in the
browser until **Factory setup → Help & data reset → Restore demo data** is used.
The login page is available at `/login`; without an API configured it enters preview mode.

### Full local stack

```bash
cp .env.example .env
docker compose up --build
```

Then open:

- Application: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:8000/health/](http://localhost:8000/health/)
- Django admin: [http://localhost:8000/admin/](http://localhost:8000/admin/)
- MinIO console: [http://localhost:9001](http://localhost:9001)

The repeatable demo seed creates `harsh / vulcan-demo`. Change `DEMO_PASSWORD` in `.env`
for a shared development environment.

### Run without Docker

PostgreSQL, Redis, and S3-compatible storage are optional for unit tests and frontend preview.
The backend defaults to SQLite and eager Celery execution in debug mode.

```bash
uv sync
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py seed_demo
.venv/bin/python backend/manage.py runserver
```

In a second terminal:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run ruff check .
UV_CACHE_DIR=/tmp/vulcan-uv-cache uv run pytest
```

For an end-to-end browser check, start the production build and run the smoke suite in another
terminal. It uses an installed Chrome/Chromium binary (or `CHROME_BIN`) and covers the seven
widgets, CSV mapping/import, alert actions, and factory creation.

```bash
npm start --workspace frontend -- -p 3100
VULCAN_BASE_URL=http://127.0.0.1:3100 npm run smoke:ui
```

## Repository map

```text
frontend/                 Next.js application and typed API boundary
backend/config/           Django, DRF, Celery, security, and routing
backend/apps/tenancy/     Tenants, companies, factories, assets, memberships
backend/apps/operations/  Uploads, mapping profiles, validation issues, jobs
backend/apps/analytics/   Versioned KPIs, aggregate metrics, and loss events
backend/apps/alerts/      Versioned rules and traceable alerts
backend/apps/audit/       Immutable business audit history
processing/               Pure file, mapping, validation, and KPI primitives
infrastructure/           Reserved for production IaC
docs/                     Architecture and implementation decisions
```

See [docs/architecture.md](docs/architecture.md) for domain boundaries, tenancy rules,
processing guarantees, and the path from this slice to the complete MVP.

## Production notes

The included configuration is secure-by-default outside debug mode, but a production launch
still requires managed secrets, TLS termination, private S3, malware scanning, observability,
backup verification, representative load tests, and a real password-reset/email provider.
The original product specification remains the source of truth for the full delivery sequence.
