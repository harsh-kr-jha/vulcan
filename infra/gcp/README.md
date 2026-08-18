# GCP vertical cells

This Terraform root creates one low-complexity deployment cell per allowlisted vertical while
reusing the same digest-pinned frontend and backend images. It targets Google provider 7.41, the
current provider line verified in August 2026.

It creates, per vertical:

- separate web and migration service accounts,
- a private Cloud Storage bucket with public access prevention,
- a separate database in an existing shared Cloud SQL instance,
- a two-container Cloud Run service with an explicit Next.js ingress port,
- a one-task migration job,
- a serverless NEG and external managed backend service for shared load-balancer host routing, and
- pinned Secret Manager access for only that cell's identities.

It deliberately does not create a Celery worker pool. Both checked-in variants set
`asyncUploads=false`, and Cloud Run worker pools remain manually scaled in 2026. Add a worker only
after object download, malware scanning, parsing, retry and idempotency are complete.

## Inputs owned outside this root

Provision or select these shared resources first:

- project and enabled APIs,
- VPC and regional subnet,
- private Cloud SQL instance,
- Memorystore instance and TLS/AUTH configuration,
- Secret Manager secrets and pinned versions,
- Artifact Registry images pinned by digest, and
- global external HTTPS load balancer, certificate, IP and DNS.

The module outputs one backend service per domain. Attach each output to an explicit URL-map host
rule; do not use a wildcard application fallback. Keep the Cloud Run service at
`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`. Although `allUsers` receives `run.invoker`, that IAM grant
does not bypass the ingress restriction; it allows public browser traffic only through the external
Application Load Balancer.

## Use

```bash
cp terraform.tfvars.example terraform.tfvars
# Replace every placeholder and review retention, proxy count, scaling and secret versions.
terraform init
terraform fmt -check
terraform validate
terraform plan
```

Review the plan and have an authorized operator apply it. Do not put secret values in tfvars or
Terraform state. The configuration refers only to Secret Manager resource IDs and pinned versions.

Execute the migration job for a cell before shifting traffic to its new revision:

```bash
gcloud run jobs execute vulcan-<variant>-migration \
  --project <project-id> \
  --region asia-south1 \
  --wait
```

The job runs Django deployment checks, applies migrations once, then verifies no unapplied
migrations remain. Never run a demo seed against these databases.

## Important boundaries

- One shared Cloud SQL instance reduces early cost, but every cell has a distinct database, runtime
  role and migration role. Database users/passwords are provisioned separately so they never enter
  Terraform state.
- A shared Memorystore instance may use distinct logical databases during the initial phase. Queue
  and throttle isolation should move to separate instances before material asynchronous workloads.
- No bucket deletion lifecycle exists by default. Setting `retention_days` deletes `raw/` objects
  after that age; enable it only after product, privacy and legal owners approve the policy.
- `DJANGO_NUM_PROXIES` remains a placeholder because it must be measured through the real load
  balancer and Next.js proxy chain in staging.
- The central HTTPS load balancer remains separate because certificates, DNS and an existing static
  IP are shared platform resources rather than per-cell resources.
