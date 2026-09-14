# Tamaso Factory Intelligence Platform

Platform Core for the Tamaso multi-customer factory operations intelligence system.

This branch (`main`) contains the shared framework — authentication, common UI,
data ingestion, analytics primitives, and deployment infrastructure. It is NOT
independently deployable. Operating template branches (e.g. `MFG.DA.AUTO.ALL`)
add industry-specific logic to create deployable applications.

## Architecture

```
main (Platform Core)
├── MFG.DA.AUTO.ALL (Automotive operating template)
│   ├── client/MFG.DA.AUTO.ALL/MYPOL
│   └── client/MFG.DA.AUTO.ALL/INFINEXXGEN
└── MFG.PMC.AGRI.ALL (Agriculture operating template)
    └── client/MFG.PMC.AGRI.ALL/SANJ
```

See [docs/architecture.md](docs/architecture.md) for the four-layer model,
[docs/branching-strategy.md](docs/branching-strategy.md) for naming conventions and merge rules.

## Repository Structure

```
backend/                  Django REST API, data models, analytics framework
frontend/                 Next.js display layer and UI components
processing/               Framework-free data readers, templates, validation, KPIs
deploy/gce-customer/      Customer GCE deployment (Docker Compose + deploy script)
infra/tamaso-demo/        Tamaso internal Cloud Run demo (Terraform)
.github/workflows/        CI, build, and deployment pipelines
config/                   Client configuration schema (populated on client branches)
docs/                     Architecture and operational documentation
test-data/                Shared test fixtures
```

## Quick Start (Operating Template Branch)

On an operating template branch (not `main`):

```bash
npm ci
uv sync --frozen
export DJANGO_DEBUG=true
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py runserver
```

In a second terminal:
```bash
cp frontend/.env.example frontend/.env.local
npm run dev
```

## CI/CD Pipelines

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to main, MFG.*, client/** | Branch-type-aware quality checks |
| `build-artifact.yml` | Push to client/** | Build + publish Docker images to Artifact Registry |
| `deploy-customer.yml` | Manual dispatch | Deploy specific digest to customer GCE VM |
| `deploy-tamaso-demo.yml` | Manual dispatch | Deploy to Tamaso internal Cloud Run demo |

## Documentation

- [Architecture](docs/architecture.md) — Four-layer model, classification, ownership
- [Branching Strategy](docs/branching-strategy.md) — Naming, merge direction, versioning
- [Deployment](docs/deployment.md) — Customer GCE and Tamaso demo models
- [Client Onboarding](docs/client-onboarding.md) — Step-by-step new customer procedure
- [Data Input Streams](docs/data-input-streams.md) — Pull-gateway contract and operator workflow
- [Machine ML Observation](docs/machine-learning-observation.md) — Production profiles, range health, training, and model operations
