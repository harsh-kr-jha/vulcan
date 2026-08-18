# Tamaso Platform Architecture

## Four-Layer Separation

The platform separates four independent concerns:

```
SOFTWARE        → What application is running?
CONFIGURATION   → How is it configured for this factory?
DEPLOYMENT      → Which exact artifact/configuration is running?
LICENSE         → Is this deployment allowed to operate? (future)
```

Each layer is independently versioned and controlled.

## Software Classification

```
Industry → Operating Archetype → Sub-sector → Scope
```

| Code | Meaning |
|------|---------|
| MFG | Manufacturing |
| DA | Discrete Assembly |
| PMC | Process Manufacturing Continuous |
| AUTO | Automotive |
| AGRI | Agriculture |
| ALL | Complete platform capability |

Examples:
- `MFG.DA.AUTO.ALL` — Automotive discrete assembly, full platform
- `MFG.PMC.AGRI.ALL` — Agriculture process manufacturing, full platform

## Branch Hierarchy

```
main (Platform Core)
├── MFG.DA.AUTO.ALL (Operating Template)
│   ├── client/MFG.DA.AUTO.ALL/MYPOL
│   └── client/MFG.DA.AUTO.ALL/INFINEXXGEN
└── MFG.PMC.AGRI.ALL (Operating Template)
    └── client/MFG.PMC.AGRI.ALL/SANJ
```

### Platform Core (`main`)

Shared framework code that is NOT deployable on its own:
- Authentication and authorization
- Common UI shell and components
- REST API framework
- Data ingestion and processing framework
- Database layer and migrations
- KPI calculation primitives (OEE, steam recovery)
- Deployment infrastructure (scripts, Terraform, CI/CD)
- Documentation

### Operating Template (e.g. `MFG.DA.AUTO.ALL`)

Complete, deployable application for one industry vertical:
- Industry-specific field templates and labels
- Industry-specific KPIs and analytics
- Industry-specific alerts and workflows
- Seed data and test fixtures
- `platform.json` manifest with display names, terminology, features

### Client Branch (e.g. `client/MFG.DA.AUTO.ALL/MYPOL`)

Customer-specific configuration layered on top of the operating template:
- `config/config.json` with versioned client configuration
- Customer-specific connectors or integrations (rare)
- Customer-specific workflow overrides (rare)

## Artifact Architecture

```
GitHub Actions → Build → Test → Container Build → Security/QA → Immutable Artifact → Tamaso Artifact Registry
```

Each operating template produces exactly two artifacts:
- `mfg-da-auto-all-backend:1.0.0` (Django + Gunicorn)
- `mfg-da-auto-all-frontend:1.0.0` (Next.js)

Production deployments reference artifacts by immutable digest:
```
mfg-da-auto-all-backend@sha256:abc123...
```

## Deployment Models

### Customer GCE (Production)

Customer owns the GCP infrastructure. Tamaso deploys artifacts via:
1. GitHub Actions triggers deployment
2. Authenticated access to customer GCP via Workload Identity + IAP
3. Deploy script on customer VM pulls images by digest
4. Automated backup → migration → health check → rollback on failure

### Tamaso Demo (Internal)

Cloud Run deployment for internal showcases:
- Same artifacts as customer deployments (digest-pinned)
- IAM-restricted to Tamaso team members
- Managed via Terraform in `infra/tamaso-demo/`

## Ownership Boundaries

| Tamaso Controls | Customer Controls |
|-----------------|-------------------|
| Source code | GCP infrastructure |
| Platform architecture | Operational data |
| Container artifacts | Factory data |
| Release process | Customer users |
| Deployment tooling | Configuration data |
| License (future) | |

## Version Identity

Complete deployment identity:
```
Artifact Family / Platform Version / Client Config / Digest / Deployment ID
MFG.DA.AUTO.ALL / 1.0.0 / MYPOL-C01 / sha256:abc123 / mypol-prod-01
```
