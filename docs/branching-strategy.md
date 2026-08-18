# Branching Strategy

## Branch Hierarchy

```
main
├── MFG.DA.AUTO.ALL
│   ├── client/MFG.DA.AUTO.ALL/MYPOL
│   └── client/MFG.DA.AUTO.ALL/INFINEXXGEN
└── MFG.PMC.AGRI.ALL
    └── client/MFG.PMC.AGRI.ALL/SANJ
```

## Branch Types

### `main` — Platform Core

- Contains shared framework only
- NOT independently deployable
- CI enforces industry-term boundary (no mushroom/automotive terminology)
- Merge source for all operating template branches

### `MFG.<DISC>.<IND>.<SCOPE>` — Operating Template

- Complete deployable application for one industry
- Branched FROM `main`
- Contains industry-specific templates, analytics, seed commands
- Each segment: uppercase alphanumeric, 2-5 chars, dot-separated
- Max 30 characters total

### `client/<TEMPLATE>/<CLIENT>` — Client Branch

- Customer-specific configuration
- Branched FROM its operating template
- Contains `config/config.json` with versioned client config
- CLIENT_CODE: uppercase alphanumeric, 3-12 chars
- Build pipeline triggers on push → publishes artifacts

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Operating Template | `MFG.<DISC>.<IND>.<SCOPE>` | `MFG.DA.AUTO.ALL` |
| Client Branch | `client/<TEMPLATE>/<CLIENT>` | `client/MFG.DA.AUTO.ALL/MYPOL` |
| Config Version | `<CLIENT>-C<NN>` | `MYPOL-C01` |
| Artifact (backend) | `<template-dashes>-backend:<semver>` | `mfg-da-auto-all-backend:1.0.0` |
| Artifact (frontend) | `<template-dashes>-frontend:<semver>` | `mfg-da-auto-all-frontend:1.0.0` |

## Merge Direction

Merges flow **downward only**:

```
main → operating template → client branch
```

Never merge upward. If shared code needs a fix:
1. Fix on `main`
2. Merge `main` into operating template branches
3. Merge operating template into client branches

## Version Bumping

### Platform Version (`VERSION` file)

- SemVer: `MAJOR.MINOR.PATCH`
- Lives at repository root on each branch
- Bumped on operating template or client branches before release
- MAJOR: breaking API or database changes
- MINOR: new features, backward compatible
- PATCH: bug fixes

### Config Version (`config/config.json`)

- Pattern: `<CLIENT>-C<NN>` (e.g. `MYPOL-C01`, `MYPOL-C02`)
- Bumped on every config change on the client branch
- Zero-padded two-digit integer, monotonically increasing
- CI validates the pattern matches the branch client code

## Creating a New Operating Template

1. Branch from `main`: `git checkout -b MFG.XX.YY.ALL main`
2. Add `platform.json` with industry display config
3. Add industry-specific templates in `processing/templates.py`
4. Add industry-specific analytics in `backend/apps/analytics/`
5. Add seed command and test data
6. Push and verify CI passes

## Creating a New Client Branch

1. Branch from operating template: `git checkout -b client/MFG.XX.YY.ALL/CLIENTNAME MFG.XX.YY.ALL`
2. Create `config/config.json` with initial version `CLIENTNAME-C01`
3. Push — build pipeline triggers, publishes artifacts
4. Deploy using `deploy-customer.yml` workflow with the published digests
