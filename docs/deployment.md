# Deployment

Two deployment models serve different purposes:

| Model | Purpose | Target | Managed By |
|-------|---------|--------|------------|
| Customer GCE | Production | Customer-owned VM | GitHub Actions + deploy script |
| Tamaso Demo | Internal showcase | Tamaso-owned Cloud Run | GitHub Actions + Terraform |

## Customer GCE Deployment

### Architecture

```
Tamaso GitHub Actions
    ↓ (Workload Identity + IAP tunnel)
Customer GCE VM (/opt/tamaso/)
    ├── deploy.sh      — orchestrates deployment
    ├── backup.sh      — pre-deploy SQLite/PG backup
    ├── compose.yaml   — service definitions
    ├── Caddyfile      — reverse proxy + TLS
    └── deployments.json — audit log
```

### Deployment Flow

1. Admin triggers `deploy-customer.yml` workflow dispatch
2. Inputs: `customer_id`, `deployment_id`, `backend_digest`, `frontend_digest`, `config_version`, `reason`
3. Workflow authenticates to customer GCP via Workload Identity
4. Connects to VM via IAP tunnel (no public SSH)
5. Transfers latest deployment files
6. Executes `deploy.sh` with digest arguments

### Deploy Script Behavior

```
Backup (fail = abort)
    ↓
Pull images by digest
    ↓
Show migration plan
    ↓
Stop old containers
    ↓
Apply migrations
    ↓
Collect static assets
    ↓
Start new containers (180s health timeout)
    ↓
SUCCESS → record to deployments.json
FAILURE → automatic rollback to previous images
```

### Rollback

Automatic on any failure after backup:
- Previous `.env` is restored from `.env.rollback`
- Previous containers restart
- `ROLLBACK` entry recorded in `deployments.json`
- Failure logged to `deployment-failures.log`

### Concurrency

GitHub Actions concurrency group `deploy-<customer_id>` with `cancel-in-progress: false` queues deployments rather than cancelling.

### Customer VM Environment

Required in `/opt/tamaso/.env`:
```
GCP_REGION=us-central1
GCP_PROJECT_ID=<customer-project>
AR_REPOSITORY=vulcan
IMAGE_PREFIX=mfg-da-auto-all
CUSTOMER_ID=MYPOL
PLATFORM_VERSION=1.0.0
APP_HOST=<customer-domain>
ACME_EMAIL=<cert-contact>
BACKEND_IMAGE=<set-by-deploy-script>
FRONTEND_IMAGE=<set-by-deploy-script>
CONFIG_VERSION=<set-by-deploy-script>
```

---

## Tamaso Demo (Cloud Run)

### Architecture

Terraform in `infra/tamaso-demo/` manages Cloud Run services.
Each operating template runs as a separate service with:
- Independent service account
- Independent database
- IAM-restricted access (Tamaso team only)
- Same digest-pinned artifacts as customer deployments

### Deployment Flow

1. Admin triggers `deploy-tamaso-demo.yml` workflow dispatch
2. Inputs: `template`, `backend_digest`, `frontend_digest`, `reason`
3. Workflow deploys new revision to Cloud Run (no-traffic first)
4. Routes traffic to latest revision on success

### Updating

Two options:
- **Workflow**: Use `deploy-tamaso-demo.yml` for quick updates
- **Terraform**: Update digests in `terraform.tfvars` and `terraform apply` for infrastructure changes

### Access Control

Demo services are NOT publicly accessible. Access is restricted to members listed in `var.authorized_members` via Cloud Run Invoker IAM role.

---

## Differences Between Models

| Aspect | Customer GCE | Tamaso Demo |
|--------|-------------|-------------|
| Infrastructure owner | Customer | Tamaso |
| Compute | Single VM + Docker Compose | Cloud Run (serverless) |
| Database | SQLite or PostgreSQL on VM | Cloud SQL (managed) |
| Scaling | Single instance | Auto-scaling (0-5) |
| Access | Public via Caddy + ACME TLS | IAM-restricted |
| Deploy method | SSH via IAP + script | gcloud CLI / Terraform |
| Rollback | Automatic in deploy script | Cloud Run revision rollback |
| Cost model | Fixed VM cost | Pay-per-request |
