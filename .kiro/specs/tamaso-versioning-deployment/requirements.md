# Requirements Document

## Introduction

Restructure the vulcan repository to implement the Tamaso Software Versioning, Deployment & Licensing Architecture. The current monorepo uses a `VULCAN_VARIANT` environment variable and shared JSON manifests to distinguish two product variants (mushroom and automotive). This feature transforms that model into a hierarchical branch architecture with a platform core (`main`), industry-specific operating template branches, and per-customer client branches — each with versioned configuration, independently named artifacts, and automated build/deploy pipelines targeting customer GCP infrastructure.

## Glossary

- **Platform_Core**: The `main` branch containing shared authentication, common UI, APIs, and framework code that is not deployable on its own but serves as the merge base for all operating templates.
- **Operating_Template**: An industry-specific branch (e.g., `MFG.DA.AUTO.ALL`, `MFG.PMC.AGRI.ALL`) derived from Platform_Core that contains all code needed to run the product for one industry vertical.
- **Client_Branch**: A branch derived from an Operating_Template that holds customer-specific configuration (e.g., `client/MFG.DA.AUTO.ALL/MYPOL`).
- **Client_Configuration**: A versioned file set within a Client_Branch describing a specific customer's factory setup (branding, seed data references, environment overrides), identified by a version code like `MYPOL-C01`.
- **Artifact**: A Docker container image published to Artifact Registry, named according to the operating template (e.g., `mfg-da-auto-all-backend:1.0.0`).
- **Artifact_Registry**: Google Cloud Artifact Registry repository used to store and distribute container images.
- **Customer_VM**: A Google Compute Engine instance owned by the customer where Tamaso deploys application artifacts via SSH through IAP.
- **Deploy_Script**: The shell script on a Customer_VM responsible for pulling images, running migrations, performing health checks, and rolling back on failure.
- **Tamaso_Demo**: An internal Cloud Run deployment used by Tamaso for showcasing the product; not customer-facing.
- **Branch_Naming_Convention**: The hierarchical pattern `MFG.<DISCIPLINE>.<INDUSTRY>.<SCOPE>` for operating templates and `client/<TEMPLATE>/<CLIENT_CODE>` for client branches.
- **Config_Version**: A monotonically incrementing identifier (e.g., `MYPOL-C01`, `MYPOL-C02`) that tracks changes to a client's configuration.
- **CI_Pipeline**: The GitHub Actions continuous integration workflow that validates code quality on pull requests and pushes.
- **Build_Pipeline**: The GitHub Actions workflow that builds container images from a client or template branch and publishes them to Artifact_Registry.
- **Deploy_Pipeline**: The GitHub Actions workflow that deploys a specific artifact digest to a Customer_VM or Tamaso_Demo environment.
- **Workload_Identity**: A keyless authentication mechanism allowing GitHub Actions to authenticate to GCP without stored service account keys.
- **IAP_Tunnel**: Identity-Aware Proxy SSH tunneling used to reach Customer_VMs without exposing SSH to the public internet.
- **SemVer**: Semantic Versioning (MAJOR.MINOR.PATCH) used for artifact version tags.
- **Digest_Pin**: A `@sha256:...` suffix on a container image reference guaranteeing immutable deployment.

## Requirements

### Requirement 1: Platform Core Branch Isolation

**User Story:** As a platform maintainer, I want the `main` branch to contain only shared framework code, so that industry-specific logic never leaks between operating templates.

#### Acceptance Criteria

1. THE Platform_Core SHALL contain only authentication, authorization, common UI shell components, shared REST API endpoints, data ingestion framework, connector framework, database layer, logging, and monitoring utilities that apply to all operating templates.
2. WHEN a pull request targets Platform_Core, THE CI_Pipeline SHALL execute a grep-based boundary check that scans all files under `backend/`, `frontend/`, and `processing/` for any occurrence of industry-specific identifiers listed in a `.kiro/industry-terms.txt` deny-list file, and SHALL fail the check if any match is found, reporting the file path and line number of each violation.
3. THE Platform_Core SHALL NOT contain any references to `mushroom`, `automotive`, `agri`, `cultivation`, `harvest`, `crop`, `spawn`, `substrate`, or any client-specific identifiers (e.g., `MYPOL`, `INFINEXXGEN`, `SANJ`) in application source files under `backend/`, `frontend/`, or `processing/`.
4. THE Platform_Core SHALL retain a generic variant loading mechanism in `backend/config/variants.py` that discovers and loads a variant manifest JSON from the path `variants/<VULCAN_VARIANT>.json` at startup, validating it against a schema defined in `variants/manifest.schema.json`, without hardcoding any specific variant names.
5. THE Platform_Core SHALL retain a generic variant loading mechanism in `frontend/lib/variant-config.ts` that dynamically imports the JSON file at `../../variants/<VULCAN_VARIANT>.json` at build time using the `VULCAN_VARIANT` environment variable, without static imports of specific variant manifests.
6. THE Platform_Core SHALL NOT be independently deployable as an application; attempting to start the backend without a valid `VULCAN_VARIANT` environment variable pointing to an existing manifest SHALL cause the application to fail at startup with a clear error message.

### Requirement 2: Operating Template Branch Structure

**User Story:** As a platform maintainer, I want industry-specific branches that derive from Platform_Core, so that each vertical can evolve independently while receiving shared updates through merges.

#### Acceptance Criteria

1. WHEN an operating template branch is created, THE Branch_Naming_Convention SHALL follow the pattern `MFG.<DISCIPLINE>.<INDUSTRY>.<SCOPE>` where each segment contains only uppercase alphanumeric characters (A-Z, 0-9) of 2-5 characters, segments are separated by single dots, and the total branch name does not exceed 30 characters.
2. THE Operating_Template `MFG.DA.AUTO.ALL` SHALL contain all automotive-specific code including processing template definitions in `processing/templates.py`, analytics KPIs and alerts in `backend/apps/analytics/workspace.py`, automotive seed command `seed_mypol.py`, automotive test data in `test-data/mypol-mysuru/` and `test-data/infinexxgen-chakan/`, and the `variants/automotive.json` manifest, and SHALL NOT contain any mushroom-specific code, mushroom alias terms, cultivation KPIs, or mushroom test data.
3. THE Operating_Template `MFG.PMC.AGRI.ALL` SHALL contain all mushroom/agriculture-specific code including cultivation analytics KPIs (biological efficiency, environment compliance, water productivity), mushroom-specific processing template aliases and field definitions, mushroom seed command `seed_mushroom.py`, mushroom test data in `test-data/musroom/`, and the `variants/agri.json` manifest, and SHALL NOT contain any automotive-specific code, automotive excluded fields, automotive project workflows, or automotive test data.
4. WHEN Platform_Core receives a shared update and a merge into an Operating_Template branch is attempted, THE merge SHALL complete without conflicts in files that exist only in the Operating_Template (e.g., `variants/*.json`, seed commands, test-data directories), which is achieved by Operating_Template branches placing industry-specific code in directories that do not exist on Platform_Core.
5. THE Operating_Template branches SHALL each produce exactly two container artifacts when built: one backend image and one frontend image, following the naming convention defined in Requirement 4.
6. WHEN a file under `processing/`, `backend/apps/analytics/`, or `backend/apps/tenancy/` on an Operating_Template branch contains an import referencing another Operating_Template's terminology or identifiers, THE CI_Pipeline SHALL fail with a cross-contamination error.

### Requirement 3: Client Branch and Configuration Versioning

**User Story:** As a deployment engineer, I want per-customer branches with versioned configuration, so that each customer's deployment is traceable and independently updatable.

#### Acceptance Criteria

1. WHEN a client branch is created, THE Branch_Naming_Convention SHALL follow the pattern `client/<OPERATING_TEMPLATE>/<CLIENT_CODE>` where OPERATING_TEMPLATE matches an existing operating template branch name and CLIENT_CODE is an uppercase alphanumeric identifier of 3-12 characters.
2. THE Client_Branch SHALL contain a `config/` directory with at minimum a `config.json` file specifying: `clientId` (string), `displayName` (string), `factoryCode` (string), `configVersion` (string matching the Config_Version pattern), and optional `environmentOverrides` (object).
3. WHEN any field in the client configuration `config.json` changes, THE Config_Version SHALL be incremented following the pattern `<CLIENT_CODE>-C<NN>` where NN is a zero-padded two-digit monotonically increasing integer starting at `01` for the initial version (e.g., `MYPOL-C01`, `MYPOL-C02`).
4. THE Client_Configuration `config.json` SHALL include a `configVersion` field whose value matches the current Config_Version identifier, and the CI_Pipeline SHALL fail if the `configVersion` value in `config.json` does not match the pattern `<CLIENT_CODE>-C<NN>`.
5. WHEN a client branch is built, THE Build_Pipeline SHALL embed the Config_Version into the artifact metadata as a Docker label named `com.tamaso.config-version`.
6. THE initial client branches SHALL be: `client/MFG.DA.AUTO.ALL/MYPOL` with config version `MYPOL-C01`, `client/MFG.DA.AUTO.ALL/INFINEXXGEN` with config version `INFINEXXGEN-C01`, and `client/MFG.PMC.AGRI.ALL/SANJ` with config version `SANJ-C01`.

### Requirement 4: Artifact Naming and Versioning

**User Story:** As a deployment engineer, I want artifacts named by operating template with semantic versions and digest pins, so that deployments are deterministic and traceable.

#### Acceptance Criteria

1. THE Build_Pipeline SHALL name backend artifacts following the pattern `<template-lowercase-dashes>-backend:<SEMVER>` (e.g., `mfg-da-auto-all-backend:1.0.0`) where the template name has dots replaced by dashes and is lowercased.
2. THE Build_Pipeline SHALL name frontend artifacts following the pattern `<template-lowercase-dashes>-frontend:<SEMVER>` (e.g., `mfg-da-auto-all-frontend:1.0.0`).
3. THE Build_Pipeline SHALL publish artifacts to the Artifact_Registry at path `<GCP_REGION>-docker.pkg.dev/<GCP_PROJECT_ID>/<AR_REPOSITORY>/`.
4. WHEN an artifact is published, THE Build_Pipeline SHALL record the immutable `@sha256:` digest for each image and output it as a GitHub Actions output variable accessible to downstream jobs and workflows.
5. THE Deploy_Pipeline SHALL reference artifacts exclusively by digest pin (e.g., `mfg-da-auto-all-backend@sha256:abc123...`), not by mutable tag alone.
6. THE Build_Pipeline SHALL tag artifacts with both the SemVer tag and the full 40-character git commit SHA for traceability.
7. IF publishing an artifact to the Artifact_Registry fails, THEN THE Build_Pipeline SHALL fail the pipeline run, report an error message indicating the failed image name and publish failure reason, and SHALL NOT proceed to deployment stages.
8. THE SemVer version SHALL be read from a `VERSION` file at the repository root of the client branch, formatted as `MAJOR.MINOR.PATCH` with no prefix.

### Requirement 5: Build Pipeline (GitHub Actions)

**User Story:** As a developer, I want an automated build pipeline that produces versioned artifacts from client branches, so that every deployment originates from a reproducible CI/CD process.

#### Acceptance Criteria

1. WHEN a push event occurs on a branch matching the glob pattern `client/**`, THE Build_Pipeline workflow file `.github/workflows/build-artifact.yml` SHALL trigger automatically.
2. THE Build_Pipeline SHALL authenticate to GCP using Workload_Identity (via `google-github-actions/auth` action with `workload_identity_provider` and `service_account` parameters) without stored service account keys or JSON key files.
3. THE Build_Pipeline SHALL build both backend and frontend Docker images using the Dockerfile in `backend/Dockerfile` and `frontend/Dockerfile` respectively, with the build context set to the repository root.
4. THE Build_Pipeline SHALL pass the following build arguments to each Docker build: `VULCAN_VARIANT` (resolved from the operating template), `CONFIG_VERSION` (read from `config/config.json`), and `PLATFORM_VERSION` (read from the `VERSION` file).
5. WHEN either the backend or frontend Docker build fails, THE Build_Pipeline SHALL fail the entire workflow run, report which image failed and the build error output, and SHALL NOT push any images to the Artifact_Registry.
6. THE Build_Pipeline SHALL use GitHub Actions build cache (`type=gha`) with scope keys formatted as `<client-code>-<image-type>` (e.g., `mypol-backend`, `mypol-frontend`) to accelerate subsequent builds.
7. THE Build_Pipeline SHALL extract the operating template name from the branch name by parsing the second path segment of `client/<TEMPLATE>/<CLIENT>` and use it to derive the artifact image name.

### Requirement 6: Deployment Pipeline (GitHub Actions to Customer GCE)

**User Story:** As a deployment engineer, I want an automated deployment pipeline that deploys specific artifact digests to customer VMs, so that deployments are safe, auditable, and rollback-capable.

#### Acceptance Criteria

1. THE Deploy_Pipeline SHALL be triggered via `workflow_dispatch` and SHALL accept the following required inputs: `customer_id` (string, the client code), `deployment_id` (string, the deployment identifier), `backend_digest` (string, matching pattern `sha256:[a-f0-9]{64}`), `frontend_digest` (string, matching pattern `sha256:[a-f0-9]{64}`), `config_version` (string, matching pattern `[A-Z]+-C[0-9]{2}`), and `reason` (string, deployment reason description).
2. THE Deploy_Pipeline SHALL authenticate to GCP using Workload_Identity and connect to the Customer_VM via IAP_Tunnel using `gcloud compute ssh` with `--tunnel-through-iap` flag.
3. WHEN deployment is initiated, THE Deploy_Script on the Customer_VM SHALL execute a pre-deployment backup of the SQLite database (or PostgreSQL dump) and upload it to GCS before any container or schema changes, and SHALL refuse to proceed if the backup fails.
4. THE Deploy_Script SHALL pull the specified backend and frontend images by digest, print the Django migration plan, stop old containers, apply migrations with `--noinput`, collect static assets, start new containers, and wait for health with a timeout of 180 seconds.
5. WHEN migration fails or containers do not become healthy within the 180-second timeout, THE Deploy_Script SHALL automatically restore the previous image tags in the environment file, restart containers with the previous images, and log the failure reason to `/opt/tamaso/deployment-failures.log`.
6. WHEN deployment completes successfully, THE Deploy_Pipeline SHALL verify application health by calling the health endpoint with `curl --fail --retry 12 --retry-delay 10`.
7. THE Deploy_Script SHALL append a timestamped JSON entry to `/opt/tamaso/deployments.json` recording: `timestamp` (ISO 8601), `customer_id`, `deployment_id`, `config_version`, `backend_digest`, `frontend_digest`, `platform_version`, and `status` (SUCCESS or ROLLBACK).
8. THE Deploy_Pipeline SHALL use GitHub Actions concurrency groups keyed by `deploy-<customer_id>` to prevent parallel deployments to the same Customer_VM, with `cancel-in-progress: false` to queue rather than cancel.

### Requirement 7: Tamaso Internal Demo Deployment (Cloud Run)

**User Story:** As a Tamaso team member, I want an internal Cloud Run deployment for showcasing the product, so that we can demonstrate features without depending on customer infrastructure.

#### Acceptance Criteria

1. THE Tamaso_Demo infrastructure Terraform SHALL reside in the `infra/tamaso-demo/` directory and SHALL NOT reference paths outside that directory for module sources.
2. THE Tamaso_Demo SHALL deploy the same container image digests that are published to the Artifact_Registry for customer deployments, without rebuilding or modifying the images.
3. WHEN a new artifact is published for an operating template, THE Deploy_Pipeline SHALL offer a `workflow_dispatch` manual trigger in `.github/workflows/deploy-tamaso-demo.yml` that accepts the operating template name and digest pair as inputs to update the Tamaso_Demo environment.
4. THE Tamaso_Demo SHALL support deploying up to 5 operating templates simultaneously as separate Cloud Run services, each with independent database, service account, and domain routing.
5. THE Tamaso_Demo Cloud Run services SHALL be accessible only to authenticated Tamaso team members via IAM-based access control (Cloud Run Invoker role), not publicly accessible.
6. IF a Tamaso_Demo deployment fails (Cloud Run revision does not become healthy within 300 seconds), THEN the Terraform or deploy workflow SHALL report the failure and leave the previous healthy revision serving traffic.

### Requirement 8: Repository Cleanup

**User Story:** As a developer, I want dead files and unused infrastructure removed, so that the repository is lean and the active architecture is unambiguous.

#### Acceptance Criteria

1. WHEN the restructuring is complete, THE Platform_Core SHALL NOT contain any of the following paths or file patterns anywhere in the tracked tree: `MUSHROOM-DATA/`, `deploy/oci-micro/`, any file matching `*.docx`, any file matching `*.xlsx`, any file matching `*.sqlite3`, `Pipfile`, or `Pipfile.lock`.
2. WHEN the restructuring is complete, THE Platform_Core SHALL NOT contain a `variants/` directory with pre-populated industry-specific JSON manifest files; the directory SHALL exist but contain only the schema file `manifest.schema.json` and a `README.md` explaining how Operating_Template branches supply their own manifests.
3. WHEN the restructuring is complete, THE Platform_Core SHALL contain the directory `deploy/gce-customer/` (renamed from `deploy/gce-micro/`) and no tracked file anywhere in the repository SHALL contain the string `gce-micro` or `gce_micro`.
4. WHEN the restructuring is complete, THE Platform_Core SHALL contain the directory `infra/tamaso-demo/` (renamed from `infra/gcp/`) and no tracked file anywhere in the repository SHALL contain the string `infra/gcp` as a path reference.
5. WHEN the restructuring is complete, running `git grep -l` for any of the removed paths (`MUSHROOM-DATA`, `deploy/oci-micro`, `Pipfile`) against Platform_Core SHALL return zero results.
6. THE old remote branches `mushroom`, `Login`, and `deploy-image-tag-hotfix` SHALL be archived as lightweight tags prefixed with `archive/` (e.g., `archive/mushroom`) before deletion, preserving their final commit SHA for historical reference.

### Requirement 9: CI Pipeline Updates

**User Story:** As a developer, I want the CI pipeline to validate the correct branch type automatically, so that platform core, template, and client code are each tested with appropriate checks.

#### Acceptance Criteria

1. WHEN a pull request targets `main`, THE CI_Pipeline SHALL run shared framework tests (Python tests in `backend/tests/` excluding industry-specific test files, frontend typecheck and lint) AND SHALL execute the industry-term boundary check defined in Requirement 1 criterion 2.
2. WHEN a pull request targets a branch matching the pattern `MFG.*`, THE CI_Pipeline SHALL set the `VULCAN_VARIANT` environment variable to the appropriate value for that operating template, build and test the complete application (Python tests, frontend build, lint, typecheck), and SHALL NOT execute tests or build steps for any other operating template.
3. WHEN a pull request targets a branch matching the pattern `client/**`, THE CI_Pipeline SHALL validate the `config/config.json` schema against the expected Config_Version pattern, build both Docker images without pushing them, and run the full test suite for the operating template referenced in the branch path.
4. THE CI_Pipeline SHALL detect the branch type by matching the target branch name against the following ordered patterns: `main` (exact match → Platform_Core checks), `MFG.*` (glob match → Operating_Template checks), `client/**` (glob match → Client_Branch checks), and SHALL fail with a descriptive error if the branch name does not match any recognized pattern.
5. THE CI_Pipeline SHALL trigger on both `push` events to `main`, `MFG.*`, and `client/**` branches, and on `pull_request` events targeting any of these branches.

### Requirement 10: Code Separation in Backend

**User Story:** As a backend developer, I want industry-specific logic cleanly separated into its own branch, so that shared modules on Platform_Core remain generic and maintainable.

#### Acceptance Criteria

1. THE Platform_Core `processing/templates.py` SHALL define the base `TemplateField` namedtuple (or dataclass), a `TEMPLATES` dictionary containing only dataset type keys with empty or abstract field lists, and utility functions (`field_rules`, `serialize_fields`, `templates_for_variant`) that delegate to variant-supplied template definitions loaded from a well-known registration mechanism.
2. THE Operating_Template `MFG.DA.AUTO.ALL` SHALL extend `processing/templates.py` by registering automotive-specific field definitions (labels, required fields, data types, aliases) via the registration mechanism, and these definitions SHALL NOT contain any mushroom-specific terminology (none of the terms: mushroom, cultivation, crop, harvest, spawn, substrate, flush, room, humidity, co2, compost, farm, grower, growing, irrigation).
3. THE Operating_Template `MFG.PMC.AGRI.ALL` SHALL extend `processing/templates.py` by registering mushroom/agriculture-specific field definitions (including cultivation-specific fields: humidity_pct, co2_ppm, substrate_moisture_pct, water_litres, flush_number, growing_area_m2, crop_age_days), and these definitions SHALL NOT contain any automotive-specific terminology.
4. THE Platform_Core `backend/apps/analytics/workspace.py` SHALL define only the generic analytics framework: abstract workspace builder, KPI calculation interface, alert evaluation interface, and question-routing infrastructure, with no industry-specific KPI formulas, alert thresholds, or domain-specific natural language matching.
5. THE Platform_Core `backend/apps/tenancy/services.py` SHALL create new factories using a factory code derived from the variant configuration (e.g., `settings.VULCAN_VARIANT_CONFIG["id"].upper() + "-01"`) rather than hardcoded strings like `"MUSHROOM-01"` or `"AUTOMOTIVE-01"`.
6. WHEN the CI_Pipeline runs on Platform_Core, it SHALL verify that no file under `backend/apps/analytics/` or `processing/` imports or references any module whose path contains an industry-specific segment (e.g., `mushroom`, `automotive`, `agri`).

### Requirement 11: Code Separation in Frontend

**User Story:** As a frontend developer, I want variant resolution to work dynamically from each branch's configuration, so that the frontend does not need to know about other operating templates at build time.

#### Acceptance Criteria

1. THE Platform_Core `frontend/lib/variant-config.ts` SHALL load variant configuration dynamically by reading a single JSON manifest file from the path `../../variants/<VULCAN_VARIANT>.json` (relative to the file) at build time using a dynamic import or fs read, without static imports of specific variant manifests.
2. THE Platform_Core `frontend/lib/variant.tsx` SHALL define the `VariantId` type as `string` (or a branded string alias) rather than a fixed union of known variant names, so that any Operating_Template can declare its own identifier without modifying Platform_Core source.
3. WHEN an Operating_Template branch is built, THE frontend SHALL resolve its variant configuration from the single manifest JSON file present in that branch whose filename matches the `VULCAN_VARIANT` environment variable value.
4. IF the manifest file for the configured `VULCAN_VARIANT` value is missing or does not conform to the `VariantConfig` interface shape, THEN THE Platform_Core frontend SHALL fail the build with an error message indicating the missing or invalid manifest path and the specific validation failure.
5. THE Platform_Core frontend SHALL provide default UI components for each overridable slot (navigation labels, dashboard layout, terminology display) that Operating_Template branches can override through a well-defined extension path (e.g., variant-specific component exports in `variants/components/`).
6. THE Platform_Core `VariantConfig` interface SHALL require at minimum the fields: `id` (string), `displayName` (string), `industry` (string), `modules` (array of strings), `datasets` (record of string to string), `navigation` (record of string to string), `terminology` (object with keys `siteSingular`, `sitePlural`, `projectSingular`, `projectPlural` each being a non-empty string), and `features` (record of string to boolean).

### Requirement 12: Documentation

**User Story:** As a new team member, I want architecture documentation that reflects the Tamaso versioning model, so that I can understand the branching strategy, deployment model, and configuration lifecycle.

#### Acceptance Criteria

1. WHEN the restructuring is complete, THE Platform_Core SHALL contain a `docs/architecture.md` file that includes sections covering: the four-layer architecture (Software, Configuration, Deployment, License), the responsibility of each layer, the software classification hierarchy (Industry → Archetype → Sub-sector → Scope), and how the layers relate to each other.
2. WHEN the restructuring is complete, THE Platform_Core SHALL contain a `docs/branching-strategy.md` file that includes sections covering: the branch hierarchy diagram (main → operating template → client), branch naming conventions with examples, permitted merge directions (main → template → client, never reverse), and the version bumping rules for platform version and config version.
3. WHEN the restructuring is complete, THE Platform_Core SHALL contain a `docs/deployment.md` file that includes sections covering: the customer GCE deployment model (deploy script, backup, rollback, health checks), the Tamaso internal Cloud Run demo model (Terraform, artifact digest pinning), and the differences between the two models.
4. WHEN the restructuring is complete, THE Platform_Core SHALL contain a `docs/client-onboarding.md` file that provides a numbered step-by-step procedure covering: customer classification, client branch creation, config.json setup, GCP provisioning, runtime identity creation, artifact registry access grant, initial deployment, and go-live validation.
5. WHEN the restructuring is complete, THE Platform_Core SHALL NOT contain documentation files that reference the previous variant-based model (`VULCAN_VARIANT` toggle between mushroom/automotive on one branch) as the current or recommended approach.
6. WHEN the restructuring is complete, all documentation files SHALL reference only branch names, layer names, and deployment targets that exist in the restructured repository (no references to old branch names like `mushroom`, `Login`, `deploy-image-tag-hotfix`).
