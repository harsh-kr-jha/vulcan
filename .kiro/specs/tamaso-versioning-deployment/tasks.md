# Implementation Plan: Tamaso Versioning, Deployment & Licensing Architecture

## Overview

Transform the vulcan monorepo from a dual-variant toggle system into a platform core with generic plugin frameworks, updated CI/CD pipelines, deployment infrastructure, and documentation. All work happens on the current branch (which becomes `main` / Platform Core). Industry-specific code is removed; operating template branches will be created manually from this prepared state.

## Tasks

- [ ] 1. Backend variant loading — generic manifest discovery
  - [ ] 1.1 Create `variants/manifest.schema.json` with the JSON Schema for variant manifests
    - Define the schema with required fields: `id`, `displayName`, `industry`, `modules`, `datasets`, `navigation`, `terminology`, `features`
    - Use JSON Schema draft 2020-12
    - Terminology must require `siteSingular`, `sitePlural`, `projectSingular`, `projectPlural`
    - Features use `additionalProperties: { "type": "boolean" }`
    - Datasets and navigation use `additionalProperties: { "type": "string" }`
    - _Requirements: 1.4, 11.6_

  - [ ] 1.2 Rewrite `backend/config/variants.py` to generic schema-validated loader
    - Remove the hardcoded `MANIFESTS` dict and `REQUIRED_DATASETS`, `KNOWN_MODULES`, `REQUIRED_FEATURES` allowlists
    - Implement `load_variant_manifest(variant: str)` that discovers `variants/<variant>.json` and validates against the schema
    - Raise `ImproperlyConfigured` if `VULCAN_VARIANT` is unset, manifest is missing, or schema validation fails
    - Use `jsonschema` for validation (already in deps)
    - Return `MappingProxyType` for immutability
    - _Requirements: 1.4, 1.6, 11.1_

  - [ ]* 1.3 Write unit tests for the variant loader
    - Test missing VULCAN_VARIANT raises ImproperlyConfigured
    - Test missing manifest file raises ImproperlyConfigured
    - Test invalid JSON raises ImproperlyConfigured
    - Test schema validation failure (missing required fields)
    - Test valid manifest loads successfully
    - Test manifest `id` mismatch with variant name
    - _Requirements: 1.4, 1.6_

  - [ ]* 1.4 Write property test for variant manifest round-trip (Property 1)
    - **Property 1: Variant manifest round-trip**
    - Generate valid manifest dicts with random strings/booleans conforming to schema
    - Serialize to JSON, load via `load_variant_manifest`, verify all fields identical
    - Use `hypothesis` with `@settings(max_examples=200)`
    - **Validates: Requirements 1.4, 1.5, 11.1**

  - [ ]* 1.5 Write property test for missing manifest startup failure (Property 8)
    - **Property 8: Missing variant manifest fails startup**
    - Generate random non-existent variant name strings
    - Verify `load_variant_manifest` raises `ImproperlyConfigured` with message containing the expected path
    - **Validates: Requirements 1.6, 11.4**

- [ ] 2. Processing template plugin framework
  - [ ] 2.1 Rewrite `processing/templates.py` to a generic registry framework
    - Define `TemplateField` namedtuple and `field()` helper function
    - Implement `TemplateRegistry` class with `register()`, `get_templates()`, `has_variant()` methods
    - Expose module-level `_registry` singleton
    - Implement `templates_for_variant()`, `field_rules()`, `serialize_fields()` that delegate to registry
    - Remove all automotive and mushroom field definitions (these will live on template branches)
    - _Requirements: 10.1, 2.2, 2.3_

  - [ ] 2.2 Create `processing/apps.py` with `AppConfig.ready()` for template discovery
    - Import `processing.templates_{variant}` module dynamically based on `settings.VULCAN_VARIANT`
    - Silently skip if module not found (expected on Platform Core)
    - _Requirements: 10.1_

  - [ ]* 2.3 Write property test for template registry isolation (Property 2)
    - **Property 2: Template registry isolation**
    - Generate two distinct variant identifiers and random field lists
    - Register fields under each variant, verify `templates_for_variant(V1)` returns only V1's fields
    - Use `hypothesis` with `@settings(max_examples=200)`
    - **Validates: Requirements 2.2, 2.3, 10.2, 10.3**

  - [ ]* 2.4 Write unit tests for the template registry
    - Test registering and retrieving templates
    - Test unknown variant raises ValueError
    - Test `field_rules` and `serialize_fields` produce correct structure
    - _Requirements: 10.1_

- [ ] 3. Analytics framework plugin system
  - [ ] 3.1 Rewrite `backend/apps/analytics/workspace.py` to a generic analytics framework
    - Define `KPIProvider` protocol with `calculate()` and `alerts()` methods
    - Implement `AnalyticsRegistry` with `register_kpis()`, `register_workflow()`, `register_variables()`, `get_provider()`, `get_workflow()`, `get_variables()`
    - Keep shared KPI calculations (OEE, downtime, plan attainment) and `DEFAULT_TARGETS`
    - Remove all mushroom-specific and automotive-specific KPIs, workflow stages, and variables
    - Expose `_analytics_registry` singleton
    - _Requirements: 10.4_

  - [ ] 3.2 Update `backend/apps/analytics/apps.py` for analytics plugin discovery
    - In `AnalyticsConfig.ready()`, import `apps.analytics.workspace_{variant}` dynamically
    - Silently skip if module not found
    - _Requirements: 10.4_

  - [ ]* 3.3 Write unit tests for the analytics registry
    - Test provider registration and retrieval
    - Test missing provider raises ValueError
    - Test workflow and variable registration
    - _Requirements: 10.4_

- [ ] 4. Checkpoint - Verify backend frameworks
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Frontend variant system — dynamic and extensible
  - [ ] 5.1 Rewrite `frontend/lib/variant.tsx` to use extensible types
    - Change `VariantId` from `"automotive" | "mushroom"` to `string`
    - Update `VariantConfig` interface: remove specific feature keys, use `Record<string, boolean>` for features
    - Keep `VariantProvider` and `useVariant()` hook unchanged
    - _Requirements: 11.2, 11.6_

  - [ ] 5.2 Rewrite `frontend/lib/variant-config.ts` to dynamic manifest loader
    - Remove static imports of `automotive.json` and `mushroom.json`
    - Implement `getVariantConfig()` using `readFileSync` to load `../../variants/<VULCAN_VARIANT>.json`
    - Add runtime shape validation for required fields
    - Throw clear error if `VULCAN_VARIANT` is unset, manifest is missing, or validation fails
    - _Requirements: 11.1, 11.3, 11.4_

  - [ ]* 5.3 Write unit tests for the frontend variant config loader
    - Test missing VULCAN_VARIANT throws error
    - Test missing manifest file throws error
    - Test malformed JSON throws error
    - Test missing required fields throws error with field name
    - Test valid manifest loads correctly
    - _Requirements: 11.1, 11.4_

- [ ] 6. Backend tenancy service — remove hardcoded factory codes
  - [ ] 6.1 Update `backend/apps/tenancy/services.py` to derive factory codes from variant config
    - Replace any hardcoded `"MUSHROOM-01"` or `"AUTOMOTIVE-01"` factory code strings
    - Use `settings.VULCAN_VARIANT_CONFIG["id"].upper() + "-01"` or similar dynamic derivation
    - _Requirements: 10.5_

- [ ] 7. Checkpoint - Verify all framework changes
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Repository cleanup — remove dead files and directories
  - [ ] 8.1 Remove dead files and directories from the repository
    - Delete `MUSHROOM-DATA/` directory
    - Delete `deploy/oci-micro/` directory
    - Delete `Factory Operations Intelligence Platform — MVP Application Specification v1.0.docx`
    - Delete `Project List_data.xlsx`
    - Delete `backend/automotive.sqlite3` (if tracked)
    - Delete `backend/db.sqlite3` (if tracked)
    - Delete `backend/Pipfile` and `backend/Pipfile.lock` (if they exist)
    - Delete `variants/mushroom.json` and `variants/automotive.json`
    - Delete `docs/variants.md` and `docs/deployment-gcp.md`
    - Remove industry-specific seed commands (`seed_mushroom.py`, `seed_mypol.py`) if on this branch
    - Remove industry-specific test data dirs (`test-data/musroom/`, `test-data/mypol-mysuru/`, `test-data/infinexxgen-chakan/`)
    - _Requirements: 8.1, 8.2, 8.5_

  - [ ] 8.2 Create `variants/README.md` explaining how operating templates supply manifests
    - Document the convention: each operating template places its manifest at `variants/<variant-id>.json`
    - Document the schema validation mechanism
    - _Requirements: 8.2_

  - [ ] 8.3 Rename `deploy/gce-micro/` to `deploy/gce-customer/`
    - Move all files from `deploy/gce-micro/` to `deploy/gce-customer/`
    - Remove the old `deploy/gce-micro/` directory
    - Search and replace all references to `gce-micro` and `gce_micro` across the repository
    - _Requirements: 8.3_

  - [ ] 8.4 Rename `infra/gcp/` to `infra/tamaso-demo/`
    - Move all files from `infra/gcp/` to `infra/tamaso-demo/`
    - Remove the old `infra/gcp/` directory
    - Search and replace all references to `infra/gcp` across the repository
    - _Requirements: 8.4_

- [ ] 9. Create `VERSION` file and client config schema
  - [ ] 9.1 Create `VERSION` file at repository root
    - Content: `1.0.0` (no prefix, no newline)
    - _Requirements: 4.8_

  - [ ] 9.2 Create `config/config.schema.json` for client branch configuration validation
    - Define JSON Schema for `config.json` with required fields: `clientId`, `displayName`, `factoryCode`, `configVersion`
    - Pattern validation for `clientId`: `^[A-Z0-9]{3,12}$`
    - Pattern validation for `configVersion`: `^[A-Z0-9]{3,12}-C[0-9]{2}$`
    - Optional `environmentOverrides` with string values
    - Set `additionalProperties: false`
    - _Requirements: 3.2, 3.3, 3.4_

- [ ] 10. Industry-term boundary checking
  - [ ] 10.1 Create `.kiro/industry-terms.txt` deny-list file
    - Add all industry-specific terms: mushroom, automotive, agri, cultivation, harvest, crop, spawn, substrate, flush, compost, MYPOL, INFINEXXGEN, SANJ
    - Add comments explaining the file's purpose
    - _Requirements: 1.2, 1.3_

  - [ ]* 10.2 Write property test for industry-term boundary checker (Property 7)
    - **Property 7: Industry-term boundary checker rejects all deny-listed terms**
    - For any term in deny-list and any file content containing that term, the boundary check function reports a violation
    - Implement as a Python helper function that can be tested independently of CI
    - **Validates: Requirements 1.2, 1.3**

- [ ] 11. Checkpoint - Verify cleanup and setup
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. CI Pipeline — branch-type-aware workflow
  - [ ] 12.1 Rewrite `.github/workflows/ci.yml` with branch-type detection
    - Add a `detect` job that outputs `branch_type` and `variant` based on branch name patterns
    - Match: `main` → platform_core, `MFG.*` → operating_template, `client/**` → client_branch
    - Fail with descriptive error if branch doesn't match any pattern
    - For platform_core: run shared tests + industry-term boundary check + typecheck + lint
    - For operating_template: set VULCAN_VARIANT, run full test suite + frontend build + cross-contamination check
    - For client_branch: validate config/config.json schema, build Docker images (no push), run full test suite
    - Trigger on push to `main`, `MFG.*`, `client/**` and pull_request to these targets
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 1.2_

  - [ ]* 12.2 Write property test for branch name validation (Property 3)
    - **Property 3: Operating template branch name validation**
    - Generate strings matching/not-matching `^MFG\.[A-Z0-9]{2,5}\.[A-Z0-9]{2,5}\.[A-Z0-9]{2,5}$` with length ≤ 30
    - Verify the parsing function accepts valid patterns and rejects invalid
    - **Validates: Requirements 2.1**

  - [ ]* 12.3 Write property test for client branch name validation (Property 4)
    - **Property 4: Client branch name validation**
    - Generate strings matching/not-matching `^client/MFG\.[A-Z0-9]{2,5}\.[A-Z0-9]{2,5}\.[A-Z0-9]{2,5}/[A-Z0-9]{3,12}$`
    - Verify extraction of template name and client code
    - **Validates: Requirements 3.1**

  - [ ]* 12.4 Write property test for config version monotonicity (Property 5)
    - **Property 5: Config version monotonicity pattern**
    - Generate client codes and integers, verify version string `<CODE>-C<NN>` is valid
    - Verify extracting client code prefix matches clientId
    - **Validates: Requirements 3.3, 3.4**

- [ ] 13. Build pipeline workflow
  - [ ] 13.1 Create `.github/workflows/build-artifact.yml`
    - Trigger on push to `client/**` branches
    - `prepare` job: parse branch to extract template, client code, image prefix; read VERSION; read config version from config/config.json; read variant from manifest
    - `build` job: matrix strategy for backend and frontend; authenticate via Workload Identity; build and push images to Artifact Registry
    - Tag images with SemVer + git SHA; output digests
    - Pass build args: VULCAN_VARIANT, CONFIG_VERSION, PLATFORM_VERSION
    - Add Docker label `com.tamaso.config-version`
    - Use GHA cache scoped by `<client-code>-<image-type>`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 13.2 Write property test for artifact name derivation (Property 6)
    - **Property 6: Artifact name derivation is deterministic and reversible**
    - Generate valid template branch names, verify dot-to-dash + lowercase produces `^[a-z0-9-]+$`
    - Verify the transformation is idempotent on the lowercased-dashed form
    - **Validates: Requirements 4.1, 4.2**

- [ ] 14. Deployment pipelines
  - [ ] 14.1 Create `.github/workflows/deploy-customer.yml`
    - Trigger via `workflow_dispatch` with inputs: `customer_id`, `deployment_id`, `backend_digest`, `frontend_digest`, `config_version`, `reason`
    - Authenticate via Workload Identity
    - Connect to Customer_VM via IAP tunnel
    - Transfer and execute the deploy script with digest arguments
    - Verify health with `curl --fail --retry 12 --retry-delay 10`
    - Use concurrency group `deploy-<customer_id>` with `cancel-in-progress: false`
    - _Requirements: 6.1, 6.2, 6.6, 6.8_

  - [ ] 14.2 Create `.github/workflows/deploy-tamaso-demo.yml`
    - Trigger via `workflow_dispatch` with inputs: template name, backend digest, frontend digest
    - Deploy to Cloud Run using Terraform apply or gcloud run deploy
    - Verify revision becomes healthy within 300 seconds
    - On failure, leave previous healthy revision serving traffic
    - _Requirements: 7.2, 7.3, 7.6_

  - [ ] 14.3 Rewrite `deploy/gce-customer/deploy.sh` for digest-based deployment
    - Accept arguments: `<backend_digest>` `<frontend_digest>` `<config_version>` `<deployment_id>`
    - Validate digest format `^sha256:[a-f0-9]{64}$`
    - Pre-deploy backup (fail if backup fails)
    - Save `.env.rollback` before changes
    - Pull images by digest, show migration plan, stop old containers, migrate, collectstatic, start new containers
    - Wait for health with 180s timeout
    - Implement rollback via `trap ERR`: restore `.env.rollback`, restart previous containers
    - Append JSON deployment record to `/opt/tamaso/deployments.json`
    - _Requirements: 6.3, 6.4, 6.5, 6.7_

  - [ ] 14.4 Update `deploy/gce-customer/compose.yaml` for new image reference format
    - Update service definitions to use `BACKEND_IMAGE` and `FRONTEND_IMAGE` env vars (full digest-pinned references)
    - Remove hardcoded variant-specific references
    - _Requirements: 4.5, 6.4_

- [ ] 15. Terraform — Tamaso Demo infrastructure
  - [ ] 15.1 Rewrite `infra/tamaso-demo/variables.tf` for the new multi-template model
    - Replace hardcoded `contains(["automotive", "mushroom"], name)` validation
    - Define `var.templates` as `map(object({...}))` with `backend_image`, `frontend_image`, `domain`, `database_name`, `variant_id`
    - Validate image references are digest-pinned
    - Validate template names are lowercase-dashes
    - Add `var.authorized_members` list for IAM control
    - _Requirements: 7.1, 7.4, 7.5_

  - [ ] 15.2 Rewrite `infra/tamaso-demo/main.tf` for per-template Cloud Run services
    - Use `for_each` over `var.templates` to create independent services
    - Each template gets: Cloud Run service, service account, database, IAM binding
    - Restrict access to `var.authorized_members` with Cloud Run Invoker role
    - Pin images by digest, route traffic to latest healthy revision
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6_

  - [ ] 15.3 Create `infra/tamaso-demo/outputs.tf`
    - Output service URLs keyed by template name
    - Output service account emails
    - _Requirements: 7.4_

- [ ] 16. Checkpoint - Verify CI/CD and infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Documentation
  - [ ] 17.1 Rewrite `docs/architecture.md` for the Tamaso versioning model
    - Cover the four-layer architecture: Software, Configuration, Deployment, License
    - Document the software classification hierarchy (Industry → Archetype → Sub-sector → Scope)
    - Explain Platform Core, Operating Template, and Client Branch responsibilities
    - Include branch hierarchy diagram
    - _Requirements: 12.1, 12.5, 12.6_

  - [ ] 17.2 Create `docs/branching-strategy.md`
    - Document branch hierarchy (main → operating template → client)
    - Include branch naming conventions with examples
    - Document permitted merge directions (main → template → client, never reverse)
    - Document version bumping rules for platform version and config version
    - _Requirements: 12.2, 12.6_

  - [ ] 17.3 Create `docs/deployment.md`
    - Document customer GCE deployment model (deploy script, backup, rollback, health checks)
    - Document Tamaso internal Cloud Run demo model (Terraform, artifact digest pinning)
    - Explain the differences between the two deployment models
    - _Requirements: 12.3, 12.6_

  - [ ] 17.4 Create `docs/client-onboarding.md`
    - Provide numbered step-by-step procedure
    - Cover: customer classification, client branch creation, config.json setup, GCP provisioning, runtime identity creation, artifact registry access grant, initial deployment, go-live validation
    - _Requirements: 12.4, 12.6_

- [ ] 18. Final checkpoint - Verify all changes
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All work is on the current branch (future Platform Core). Git branch operations for operating templates and client branches are manual and out of scope.
- Industry-specific code (automotive templates, mushroom KPIs, seed commands, test data) is being REMOVED from this branch — it will be re-added on respective operating template branches manually.
- The `processing/templates.py` and `backend/apps/analytics/workspace.py` rewrites produce empty registries on Platform Core — this is correct. Plugins register at import time on template branches only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "9.1", "10.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "5.1", "9.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "2.2", "2.3", "2.4", "3.1", "5.2"] },
    { "id": 3, "tasks": ["3.2", "3.3", "5.3", "6.1"] },
    { "id": 4, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 5, "tasks": ["10.2", "12.1"] },
    { "id": 6, "tasks": ["12.2", "12.3", "12.4", "13.1"] },
    { "id": 7, "tasks": ["13.2", "14.1", "14.2", "14.3"] },
    { "id": 8, "tasks": ["14.4", "15.1"] },
    { "id": 9, "tasks": ["15.2", "15.3"] },
    { "id": 10, "tasks": ["17.1", "17.2", "17.3", "17.4"] }
  ]
}
```
