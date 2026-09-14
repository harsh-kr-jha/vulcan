# Tamaso Demo — Cloud Run Infrastructure

Internal Cloud Run deployment for showcasing operating templates to the Tamaso team.
Uses the same digest-pinned artifacts published for customer deployments.

## Architecture

Each operating template gets an independent:
- Cloud Run service (frontend + backend sidecar)
- Service account
- Cloud SQL database
- Cloud SQL Unix-socket mount and least-privilege Cloud SQL Client access
- Cloud Storage bucket
- Serverless NEG + backend service for load balancer routing

Access is restricted to `var.authorized_members` via IAM (Cloud Run Invoker role).

## Usage

```bash
cp terraform.tfvars.example terraform.tfvars
# Fill in project, network, secrets, and template digests
terraform init
terraform plan
terraform apply
```

Set `cloud_sql_connection_name` to `project:region:instance`. Provide each backend's
`DJANGO_DATABASE_URL` through Secret Manager using a Unix-socket URL whose host is
`/cloudsql/project:region:instance`; do not put the database password in Terraform variables.

## Adding a new operating template

Add an entry to the `templates` map in your tfvars:

```hcl
templates = {
  mfg-da-auto-all = {
    backend_image  = "us-central1-docker.pkg.dev/PROJECT/vulcan/mfg-da-auto-all-backend@sha256:..."
    frontend_image = "us-central1-docker.pkg.dev/PROJECT/vulcan/mfg-da-auto-all-frontend@sha256:..."
    domain         = "auto-demo.tamaso.dev"
    database_name  = "tamaso_demo_auto"
    variant_id     = "automotive"
  }
  mfg-pmc-agri-all = {
    backend_image  = "us-central1-docker.pkg.dev/PROJECT/vulcan/mfg-pmc-agri-all-backend@sha256:..."
    frontend_image = "us-central1-docker.pkg.dev/PROJECT/vulcan/mfg-pmc-agri-all-frontend@sha256:..."
    domain         = "agri-demo.tamaso.dev"
    database_name  = "tamaso_demo_agri"
    variant_id     = "agri"
  }
}
```

## Updating a demo

Use the `deploy-tamaso-demo.yml` GitHub Actions workflow or update the digest in tfvars and re-apply.
