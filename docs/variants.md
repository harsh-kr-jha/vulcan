# Product variants

Vulcan is one codebase deployed as independently configured vertical cells. The repository currently
allowlists `mushroom` and `automotive`; long-lived product branches are not deployment units.

## Runtime contract

Every deployed frontend and backend receives the same value:

```bash
VULCAN_VARIANT=mushroom
# or
VULCAN_VARIANT=automotive
```

Debug mode defaults to `mushroom`. Production startup fails when the variable is absent or unknown.
The value comes only from the trusted process environment. A hostname, header, query parameter or
tenant setting cannot select another product.

The manifests in `variants/` contain non-secret display, module, dataset, terminology and feature
configuration. Both Django and Next.js validate/read this allowlisted configuration. Secret,
environment, domain, database and infrastructure values do not belong in a manifest.

Both deployments use the same normalized data model and image digests. Human-facing import labels
change with the product while normalized field keys remain stable. Mushroom-specific analytics are
enabled only in the mushroom cell. New factories are stamped with the deployment industry, and the
API rejects attempts to change a factory into another vertical.

## Deployment cells

Each vertical has an independent Cloud Run service, database, bucket, service account, secrets and
migration job. The initial cost-conscious topology may share the Cloud SQL and Memorystore
instances, but not database roles, database names, Redis logical databases or object buckets.

```text
mushroom.example.com -> vulcan-mushroom -> vulcan_mushroom -> mushroom bucket
auto.example.com     -> vulcan-automotive -> vulcan_automotive -> automotive bucket
```

The Terraform root at `infra/gcp/` creates these cells from one map and outputs backend services for
explicit load-balancer host rules. It uses the current 2026 Cloud Run model:

- one Next.js ingress container on an explicit port,
- one Django sidecar reached over `localhost`,
- a Django startup probe before Next starts,
- Direct VPC egress to private managed dependencies, and
- a one-task migration job per cell.

Cloud Run's current documentation confirms [localhost sidecar networking and startup ordering](https://docs.cloud.google.com/run/docs/deploying),
[Direct VPC egress](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc), and
[manual worker-pool scaling](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run).

No worker pool is created while `asyncUploads=false`. The working upload flow remains synchronous;
deploying an idle worker would add cost without completing object ingestion.

## Local development

Mushroom:

```bash
export VULCAN_VARIANT=mushroom
export DJANGO_DEBUG=true
.venv/bin/python backend/manage.py runserver
```

Automotive:

```bash
export VULCAN_VARIANT=automotive
export DJANGO_DEBUG=true
.venv/bin/python backend/manage.py runserver
```

Start Next.js with the same value in a second terminal. A frontend/backend mismatch is unsupported
because it can show labels for a different server-side import contract.

`seed_mushroom` refuses to run in the automotive variant. Demo seeds remain local-only and must
never be executed against a deployed database.

## Adding another vertical

Do not begin by copying a branch. A new vertical requires a reviewed change that:

1. adds an allowlisted, schema-valid manifest,
2. adds only its specialized calculations or UI composition behind the explicit registry,
3. defines normalized dataset mappings without changing existing field meaning,
4. adds backend and frontend tests for disabled modules and terminology,
5. adds a cell entry with separate database, role, bucket, service account and secrets,
6. runs the migration job and authenticated smoke suite on its real subdomain, and
7. proves that sessions, data and object access cannot cross cell boundaries.

If a new vertical needs incompatible dependencies or database semantics, first document why the
shared-image/shared-schema model is insufficient. Separate images or Cloud SQL instances are an
intentional escalation, not the default.

## Administration boundary

There is no shared production admin website yet. This is deliberate: a highly privileged control
plane should be built only after the user/tenant/factory operations for both cells are proven.
Production Django admin remains disabled.

The first operational interface should be reviewed Cloud Run jobs or management commands for user
invitation, membership, factory creation, suspension and session revocation. A later
`admin.example.com` control plane may expose those narrow operations with phishing-resistant MFA,
RBAC and immutable audit events. It must not display raw operational data, store secret values or
hold broad infrastructure-editing credentials.

Cross-subdomain SSO is also deferred. Current `__Host-` cookies stay scoped to one subdomain. If SSO
becomes necessary, use an OIDC identity service and let each cell create its own host-only session;
never replace them with a parent-domain session cookie.
