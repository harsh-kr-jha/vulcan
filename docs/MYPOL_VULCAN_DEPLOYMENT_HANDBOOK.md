# Vulcan + Vulcan Deploy: MYPOL Deployment and Operations Handbook

**Audience:** Tamaso developers, deployment operators, and customer administrators  
**Environment documented:** MYPOL production on Google Cloud  
**Document date:** 18 September 2026  
**Application branch:** `client/MFG.DA.AUTO.ALL/MYPOL`

> This handbook records the deployment that was actually built and debugged. Commands containing
> `<PLACEHOLDER>` must be completed before use. Never paste passwords, API keys, database URLs,
> Django secret keys, or model credentials into Git, screenshots, tickets, or chat.

## 1. The whole system in one picture

```text
Developer
  |
  | pushes client/MFG.DA.AUTO.ALL/MYPOL
  v
GitHub repository: vulcan
  |-- tests application code
  |-- builds backend and frontend Docker images
  |-- stores immutable images in Artifact Registry
  |
  | manual Deploy to Customer GCE workflow
  | checks out the matching profile from vulcan-deploy
  v
GitHub repository: vulcan-deploy
  |-- Terraform describes durable customer infrastructure
  |-- clients/mfg-da-auto-all/ contains the MYPOL runtime profile
  |-- deploy.sh performs backup, migration, startup and rollback
  v
Google Cloud project: gentle-broker-505219-d0
  |-- GCE VM: tamaso-mypol
  |-- Cloud SQL PostgreSQL: vulcan-mypol-prod-postgres
  |-- Secret Manager: database URL
  |-- GCS: backups and Terraform state
  |-- Artifact Registry: versioned application images
  v
Customer browser and external machine gateways
```

### Explain it like I am 5

Imagine a toy factory. The `vulcan` box contains the toy parts and instructions for making the
application. The `vulcan-deploy` box contains the map showing which house the toy belongs in and
how to set it up safely. GitHub is the delivery helper. Google Cloud is the house where the toy
runs. The two boxes work together, but they are not the same box.

## 2. What each repository owns

### 2.1 `vulcan`: the application repository

This repository contains:

- `backend/`: Django API, database models, authentication, admin, streams, telemetry and inference.
- `frontend/`: Next.js user interface.
- `processing/`: reusable validation, mapping and KPI code.
- `config/`: customer configuration on client branches.
- `test-data/`: checked and versioned showcase fixtures.
- `models/`: local-development model registry documentation and optional local artifacts.
- `.github/workflows/build-artifact.yml`: builds backend and frontend images.
- `.github/workflows/deploy-customer.yml`: sends a selected release to a customer VM.
- `docs/`: architecture and operator documentation.

The production images are created from this repository. Production deployments use image digests,
not mutable tags, so the exact bytes being deployed are known.

### Explain it like I am 5

`vulcan` is the recipe book and all the ingredients. When we change the application, we change this
book. GitHub then seals the finished application in two numbered lunchboxes: one for the backend and
one for the frontend.

### 2.2 `vulcan-deploy`: the deployment repository

This separate repository contains customer-specific infrastructure and deployment behavior:

```text
vulcan-deploy/
  clients/mfg-da-auto-all/
    terraform/          Cloud SQL, networking, backup bucket and permissions
    infra.sh            Infrastructure helper commands
    Makefile            Friendly names such as make infra-apply
    compose.yaml        Services run on the customer VM
    deploy.sh           Safe application release and rollback
    backup.sh           PostgreSQL dump and GCS upload
    Caddyfile           HTTPS reverse proxy
    .env.example        Runtime setting template; no real secrets
```

The real `/opt/tamaso/.env` exists only on the VM, is mode `0600`, and must never be committed.
Terraform creates the Secret Manager container, while `infra.sh` creates the database password and
secret value outside Terraform state.

### Explain it like I am 5

`vulcan-deploy` is the address label and safety checklist. It says which customer receives the app,
where their database lives, and what to do if installation fails. It does not contain the customer’s
secret keys.

### 2.3 The critical profile selector

The GitHub Environment named `gcp-MYPOL` must contain:

```text
DEPLOY_PROFILE=clients/mfg-da-auto-all
DEPLOY_REPO=harsh-kr-jha/vulcan-deploy
```

This is critical. The root `compose.yaml` in `vulcan-deploy` is a different, legacy single-node
profile that hard-codes SQLite. If `DEPLOY_PROFILE` is missing, the current workflow falls back to
`.` and can transfer that incorrect profile. The visible failure is:

```text
DJANGO_DATABASE_URL must use PostgreSQL outside isolated tests.
```

### Explain it like I am 5

The deployment repository is a cupboard with several shelves. `DEPLOY_PROFILE` tells the delivery
helper which shelf belongs to MYPOL. If the label is missing, it can pick the wrong shelf and bring
an old SQLite box instead of the PostgreSQL box.

## 3. Branches, releases and names

The source-code hierarchy is:

```text
main
  -> MFG.DA.AUTO.ALL
       -> client/MFG.DA.AUTO.ALL/MYPOL
```

Changes normally flow downward: platform core to operating template to client branch. Shared fixes
should not be developed only on a customer branch and then merged upward.

| Identity | Pattern | MYPOL example |
| --- | --- | --- |
| Operating template | `MFG.<DISCIPLINE>.<INDUSTRY>.<SCOPE>` | `MFG.DA.AUTO.ALL` |
| Client branch | `client/<TEMPLATE>/<CLIENT>` | `client/MFG.DA.AUTO.ALL/MYPOL` |
| Client config | `<CLIENT>-C<NN>` | `MYPOL-C01` |
| Platform version | semantic version | `1.0.0` |
| Image prefix | lower-case branch-derived name | `mfg-da-auto-all-mypol` |
| Deployment ID | unique operator-chosen value | `mypol-prod-20260918-01` |
| Image identity | immutable SHA-256 digest | `sha256:<64 hex characters>` |

A complete release identity includes the branch, platform version, client configuration version,
backend digest, frontend digest and deployment ID.

### Explain it like I am 5

Names are labels on boxes. “MYPOL-C01” tells us which customer settings are inside, while a SHA-256
digest is like an impossible-to-copy fingerprint for the exact application. Even if two boxes have
similar names, their fingerprints tell us whether their contents are truly identical.

## 4. Current MYPOL infrastructure

These are non-secret identifiers from the provisioned environment:

| Resource | Current value |
| --- | --- |
| GCP project | `gentle-broker-505219-d0` |
| Compute VM | `tamaso-mypol` |
| VM zone | `asia-south1-b` |
| Infrastructure region | `asia-south1` |
| VM private IP | `10.160.0.3` |
| VM public IP observed during setup | `35.200.182.98` |
| VPC | `default` |
| VM service account | `tamaso-mypol-sa@gentle-broker-505219-d0.iam.gserviceaccount.com` |
| Artifact Registry region | `us-central1` |
| Artifact Registry repository | `vulcan` |
| Cloud SQL instance | `vulcan-mypol-prod-postgres` |
| PostgreSQL version | PostgreSQL 17, Enterprise edition |
| Cloud SQL private IP | `10.120.224.2` |
| Database | `vulcan_mypol_prod` |
| Application DB user | `vulcan_app` |
| Database URL secret | `vulcan-mypol-prod-database-url` |
| Backup bucket | `gentle-broker-505219-d0-vulcan-mypol-prod-backups` |
| Terraform state bucket | `gentle-broker-505219-d0-vulcan-terraform-state` |
| Terraform state prefix | `customers/MYPOL/prod` |

The database uses private networking, encrypted connections, automated backups, point-in-time
recovery, deletion protection, SSD storage with automatic growth, and regional high availability.

### Explain it like I am 5

The VM is the little computer running the application. PostgreSQL is its strong filing cabinet.
The filing cabinet has a private hallway, so strangers outside the house cannot walk directly into
it. The backup bucket is a second safe containing copies in case something goes wrong.

## 5. What runs on the VM

The MYPOL Compose profile runs:

| Service | Purpose |
| --- | --- |
| `data-init` | Creates persistent directories with safe ownership and permissions, then exits. |
| `redis` | Short-lived coordination/cache service used by the application. |
| `backend` | Django API, admin interface and business rules served by Gunicorn. |
| `frontend` | Next.js customer interface. |
| `stream-worker` | Polls registered external gateways and saves accepted readings. |
| `ml-observer` | Watches telemetry cycles and invokes compatible external models for predictions. |
| `caddy` | Public HTTPS entry point; sends UI traffic to frontend and API/static traffic correctly. |

Important VM paths:

```text
/opt/tamaso/
  .env                private runtime settings
  compose.yaml        selected MYPOL service definition
  deploy.sh           deployment controller
  backup.sh           backup controller
  Caddyfile           web/TLS routing
  deployments.json    successful and rolled-back deployment audit entries

/var/lib/tamaso/MYPOL/
  data/                persistent application files and telemetry when configured
  backups/             short-lived local PostgreSQL dumps
  static/              collected Django admin static files
  models/              read-only model registry mounted at /models
  seed/                optional MYPOL showcase fixture copy
```

The current customer profile does not deploy ClickHouse, MinIO/S3, or a general Celery worker.
Keep hot ClickHouse storage disabled until a production ClickHouse service is explicitly provided.
For filesystem telemetry persistence, explicitly use paths under the mounted `/data` directory.

### Explain it like I am 5

The VM is a small team. Caddy opens the front door, frontend draws the screens, backend thinks and
keeps rules, Redis holds quick sticky notes, stream-worker fetches machine messages, and ml-observer
asks the model what it thinks. `data-init` is the caretaker who prepares the cupboards first.

## 6. First-time infrastructure provisioning

This section is for a new environment. Normal application updates skip it.

### Step 1: Prepare the deployment repository

In Cloud Shell:

```bash
cd ~/vulcan-deploy/clients/mfg-da-auto-all
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
nano terraform/terraform.tfvars
```

The important MYPOL values are:

```hcl
project_id                 = "gentle-broker-505219-d0"
region                     = "asia-south1"
artifact_registry_region   = "us-central1"
customer_id                = "MYPOL"
environment                = "prod"
database_backend           = "cloudsql-postgresql"
network_name               = "default"
manage_private_service_access = true
postgres_version           = "POSTGRES_17"
postgres_tier              = "db-custom-2-7680"
postgres_high_availability = true
postgres_disk_size_gb      = 20
create_backup_bucket       = true
vm_service_account_email   = "tamaso-mypol-sa@gentle-broker-505219-d0.iam.gserviceaccount.com"
```

Do not commit `terraform.tfvars`, Terraform state, `.terraform/`, or provider binaries. Provider
binaries are downloaded by `terraform init`; one Google provider binary exceeded GitHub’s 100 MB
limit during this deployment and was never required in Git.

#### Explain it like I am 5

This step fills in an order form saying, “Build MYPOL’s filing cabinet in Mumbai and connect it to
this computer.” The downloaded Terraform provider is a large tool used by the builder. We keep the
tool in the workshop, not inside the recipe book.

### Step 2: Initialize durable Terraform state

```bash
export GCP_PROJECT_ID=gentle-broker-505219-d0
export CUSTOMER_ID=MYPOL
export ENVIRONMENT=prod
export TF_STATE_LOCATION=asia-south1

make infra-init
make infra-validate
make infra-plan
```

Review the plan before applying it. `infra-init` selects the GCS state bucket and the
`customers/MYPOL/prod` prefix. Every future operator must select the same state.

#### Explain it like I am 5

Terraform needs a notebook remembering what it already built. The state bucket is that notebook.
If we use the wrong notebook, Terraform may think the house is empty and try to build duplicates.

### Step 3: Apply infrastructure

```bash
make infra-apply
```

This provisions or reconciles required APIs, private service networking, Cloud SQL, the application
database, the empty Secret Manager container, the protected backup bucket and required permissions.
Cloud SQL creation can take several minutes.

#### Explain it like I am 5

Now the builder reads the plan and constructs the real filing cabinet, private hallway and backup
safe. Waiting several minutes does not mean it is stuck; a strong cabinet takes time to assemble.

### Step 4: Create the database credential

```bash
make infra-database
```

This creates the `vulcan_app` PostgreSQL user, generates a URI-safe password, and stores the complete
PostgreSQL URL as a new version of `vulcan-mypol-prod-database-url`. The password is not stored in
Terraform state. Existing passwords are not silently rotated.

For an intentional coordinated rotation only:

```bash
ROTATE_DATABASE_PASSWORD=true make infra-database
```

Immediately follow a rotation with `make infra-vm` and an application restart.

#### Explain it like I am 5

The database needs a secret key. This step makes the key and places it in Google’s locked key box.
Terraform knows that the key box exists, but it never learns the secret key inside it.

### Step 5: Merge infrastructure settings onto the VM

```bash
export GCE_INSTANCE=tamaso-mypol
export GCE_ZONE=asia-south1-b
make infra-vm
```

This preserves application settings while updating the database backend, database URL, project,
Artifact Registry region and backup bucket in `/opt/tamaso/.env`.

If Cloud Shell asks for the SSH-key passphrase repeatedly, unlock it for the current session:

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/google_compute_engine
```

The NumPy/IAP performance message is only a warning; it is not a deployment error.

#### Explain it like I am 5

Google’s key box knows the database key, but the application still needs a private copy. This step
carefully puts the key into a locked note on the VM without changing the other notes.

### Step 6: Complete the VM application environment

At minimum, `/opt/tamaso/.env` needs the following kinds of settings:

```dotenv
GCP_PROJECT_ID=gentle-broker-505219-d0
GCP_REGION=us-central1
AR_REPOSITORY=vulcan
IMAGE_PREFIX=mfg-da-auto-all-mypol
CUSTOMER_ID=MYPOL
PLATFORM_VERSION=1.0.0

DATABASE_BACKEND=cloudsql-postgresql
DATABASE_BACKUP_DRIVER=postgresql
DJANGO_DATABASE_URL=<installed by infra-vm>
GCS_BACKUP_BUCKET=gentle-broker-505219-d0-vulcan-mypol-prod-backups

REDIS_URL=redis://redis:6379/0
DJANGO_CACHE_URL=redis://redis:6379/1
CELERY_TASK_ALWAYS_EAGER=false

APP_HOST=<customer-hostname-without-https>
ACME_EMAIL=<certificate-contact-email>
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_ALLOWED_HOSTS=<same-customer-hostname>
DJANGO_CSRF_TRUSTED_ORIGINS=https://<same-customer-hostname>
DJANGO_TRUST_PROXY_HEADERS=true
DJANGO_NUM_PROXIES=1
VULCAN_ADMIN_ENABLED=true
DATA_STREAM_CREDENTIAL_KEY=<separate-long-random-secret>

ML_MODEL_SOURCE=local
STREAM_INGESTION_ENABLED=true
TELEMETRY_ALLOW_SIMULATED_INPUTS=false
TELEMETRY_HOT_STORAGE_ENABLED=false
TELEMETRY_ARCHIVE_ENABLED=true
ML_DATASETS_ENABLED=true
TELEMETRY_STORAGE_BACKEND=filesystem
TELEMETRY_STORAGE_ROOT=/data/telemetry
TELEMETRY_BUFFER_DIR=/data/telemetry-buffer
```

Generate secrets with a cryptographically secure tool, keep the file owned by root and mode `0600`,
and never print the database URL or keys during diagnostics.

#### Explain it like I am 5

The `.env` file is the VM’s private instruction card: where the database is, what the website is
called, and which secret keys to use. Anyone who steals the card could pretend to be the app, so we
lock it and never put it on GitHub.

## 7. Configure GitHub Actions

Create the GitHub Environment named exactly:

```text
gcp-MYPOL
```

Environment variables:

```text
DEPLOY_PROFILE=clients/mfg-da-auto-all
DEPLOY_REPO=harsh-kr-jha/vulcan-deploy
GCP_PROJECT_ID=gentle-broker-505219-d0
GCE_INSTANCE=tamaso-mypol
GCE_ZONE=asia-south1-b
APP_URL=https://<APP_HOST>
```

Repository-level or environment-level Actions variables must also provide:

```text
GCP_WORKLOAD_IDENTITY_PROVIDER=<full Workload Identity provider resource>
GCP_DEPLOY_SERVICE_ACCOUNT=<GitHub deployment service-account email>
```

The GitHub deployment identity needs only the permissions required to authenticate, use IAP/SSH,
and deploy. The VM runtime service account separately reads Artifact Registry and writes backups.

### Explain it like I am 5

GitHub is a delivery driver. Workload Identity gives the driver a temporary badge instead of a
permanent copied key. The `gcp-MYPOL` environment is the delivery card containing the correct
address and cupboard shelf.

## 8. Build and deploy an application release

### Step 1: Commit only intended application changes

From the `vulcan` repository:

```bash
git status --short
git add <intended-files-only>
git commit -m "Describe the release"
git push origin client/MFG.DA.AUTO.ALL/MYPOL
```

Do not stage unrelated editor-generated files or secrets.

#### Explain it like I am 5

Before sending a package, we look inside and include only the toys meant for this delivery. We do
not accidentally include someone’s private diary or random desk clutter.

### Step 2: Let GitHub build immutable images

Pushing `client/**` triggers **Build Artifact**. It parses the branch, reads `VERSION` and
`config/config.json`, builds Linux/AMD64 backend and frontend images, and pushes them to Artifact
Registry. Copy the separate `sha256:...` digest from each job summary.

#### Explain it like I am 5

GitHub cooks the backend and frontend recipes and seals each result. The digest is the seal number.
We write down both seal numbers so the customer gets exactly those boxes.

### Step 3: Manually authorize deployment

In GitHub: **Actions → Deploy to Customer GCE → Run workflow**. Select the MYPOL client branch and
enter:

```text
customer_id: MYPOL
deployment_id: mypol-prod-<date-or-sequence>
backend_digest: sha256:<backend digest>
frontend_digest: sha256:<frontend digest>
config_version: MYPOL-C01
reason: <short human explanation>
```

The deployment workflow checks out `vulcan-deploy`, selects `clients/mfg-da-auto-all`, copies four
runtime files to the VM over IAP, and runs `/opt/tamaso/deploy.sh`.

#### Explain it like I am 5

Building a toy does not automatically put it in a customer’s house. A person presses the deploy
button, checks the customer name and seal numbers, and says why the delivery is happening.

### Step 4: Understand the safe release sequence

`deploy.sh` performs this sequence:

```text
deployment lock
  -> mandatory PostgreSQL backup to GCS
  -> Artifact Registry login using VM identity
  -> pull backend/frontend by exact digest
  -> print migration plan
  -> stop application writers
  -> apply database migrations
  -> collect admin static files
  -> start services and wait for health
  -> write SUCCESS audit record
```

If an error occurs after rollback protection is armed, it restores the previous `.env`, restarts the
previous containers and records `ROLLBACK`. A successful application rollback does not undo a
non-backward-compatible database migration; migrations should therefore remain backward compatible.

#### Explain it like I am 5

Before changing the toy, we photograph and save the old one. Then we replace one careful piece at a
time and check that it wakes up. If it does not, we put the old toy back. Database shape changes are
like cutting a new hole in the table, so they require extra care even if the toy is restored.

### Step 5: Verify the release

```bash
gcloud compute ssh tamaso-mypol \
  --project=gentle-broker-505219-d0 \
  --zone=asia-south1-b \
  --tunnel-through-iap

cd /opt/tamaso
sudo docker compose --env-file .env ps
sudo docker compose --env-file .env logs --tail=100 backend
```

From a machine that can reach the public application:

```bash
curl -i https://<APP_HOST>/api/backend/health/
```

Confirm frontend, admin login, backend health, HTTPS, database writes, stream-worker and ml-observer.

#### Explain it like I am 5

After delivery, we do not merely trust the “delivered” sticker. We open the box, press the buttons,
and make sure every helper is awake and healthy.

## 9. Administrators, users and showcase seeding

### 9.1 Create the first Django administrator

After migrations succeed, open an interactive SSH session and run:

```bash
cd /opt/tamaso
sudo docker compose --env-file .env run --rm backend \
  python backend/manage.py createsuperuser
```

The command asks for an email, an internal username and a strong password. Login uses the email
identity. This user can access `https://<APP_HOST>/admin/`.

#### Explain it like I am 5

The administrator is the trusted grown-up with the master control-panel key. Their private internal
nickname helps the database, but their email is the name they type at the login door.

### 9.2 Normal users require membership

A normal application user needs:

1. a Django user record;
2. one unique email identity;
3. an active tenant membership;
4. either access to all factories or specifically selected factories.

Roles include `company_admin`, `factory_admin`, `factory_manager`, `production_supervisor`,
`quality_reviewer`, `inventory_reviewer`, `operations_reviewer` and read-only `executive`.

#### Explain it like I am 5

A login says who the person is. A membership says which factory rooms they may enter and what they
may touch inside. A name badge without a room permission does not open the factory doors.

### 9.3 Seed the synthetic MYPOL showcase

The production image intentionally excludes `test-data`, so first upload the verified fixture pack
from the local `vulcan` repository:

```bash
cd /Users/sunday/Documents/Life-Workspace/02_Projects/Tamaso/vulcan
gcloud compute scp --recurse \
  test-data/mypol-mysuru \
  tamaso-mypol:/tmp/mypol-mysuru \
  --project=gentle-broker-505219-d0 \
  --zone=asia-south1-b \
  --tunnel-through-iap
```

On the VM:

```bash
sudo install -d -m 0755 /var/lib/tamaso/MYPOL/seed/mypol-mysuru
sudo cp -R /tmp/mypol-mysuru/. /var/lib/tamaso/MYPOL/seed/mypol-mysuru/
sudo chmod -R a=rX /var/lib/tamaso/MYPOL/seed/mypol-mysuru

sudo -i
cd /opt/tamaso
read -rp "MYPOL login email: " MYPOL_DEMO_EMAIL
read -rsp "MYPOL login password: " MYPOL_DEMO_PASSWORD
echo
export MYPOL_DEMO_EMAIL MYPOL_DEMO_PASSWORD

docker compose --env-file .env run --rm \
  -e VULCAN_SINGLE_NODE=true \
  -e MYPOL_DEMO_EMAIL \
  -e MYPOL_DEMO_PASSWORD \
  -v /var/lib/tamaso/MYPOL/seed/mypol-mysuru:/app/test-data/mypol-mysuru:ro \
  backend \
  python backend/manage.py seed_mypol \
  --tenant-slug mypol \
  --confirm-production-showcase

unset MYPOL_DEMO_EMAIL MYPOL_DEMO_PASSWORD
exit
```

The password must pass Django validation and be at least 15 characters. The seed verifies fixture
checksums, runs atomically, creates the MYPOL company/Mysuru factory, machines, lines, SKUs, master
data and synthetic operational records, and makes the supplied login a `company_admin` for all
seeded factories. This login is not a Django superuser. Use a different email for the administrator.

Do not rerun the seed after users have edited showcase records unless an intentional showcase reset
has been approved.

#### Explain it like I am 5

Seeding is filling an empty toy factory with pretend machines, pretend orders and one worker badge
so people can explore it. The whole basket is checked before unpacking. Unpacking it again later can
move or replace pretend things people already changed, so we only do it deliberately.

## 10. Machine input streams

Vulcan does not create or emit simulated telemetry. An external gateway or simulator implements the
same `http-pull-v1` contract:

```text
GET  /v1/manifest
GET  /v1/channels/{channel_id}/schema
GET  /v1/channels/{channel_id}/readings?after={cursor}&limit=500
POST /v1/control/{action}       optional, only when advertised
```

Requests use `Authorization: Bearer <source API key>`. The backend stores credentials encrypted and
does not expose them to the browser or machine-layout JSON. Readings use stable event IDs, ordered
sequence numbers, timestamps, schema versions, opaque cursors and value objects. Vulcan commits a
batch and its new cursor together, making retries safe.

### Explain it like I am 5

The gateway is a child reading machine measurements from a notebook. Vulcan asks, “What comes after
the bookmark?” The child returns the next page and a new bookmark. If the trip is interrupted,
Vulcan asks again from the old bookmark instead of guessing.

### 10.1 GUI connection steps

1. Open **Data streams** in Vulcan.
2. Select **Register stream**.
3. Enter a human-readable source name.
4. Enter the gateway base URL, normally ending before `/v1/...`.
5. Enter the gateway API key.
6. Select **Connect and discover**.
7. Open the relevant machine in Lexicon.
8. Select the discovered stream and channel, then save.
9. Ensure the stream is enabled; `stream-worker` will poll it.

The circular-arrow action retries discovery. A degraded status shows the reason returned by the
backend.

### Explain it like I am 5

We tell Vulcan the notebook’s address and secret knock. Vulcan visits it, discovers which machine
channels exist, and then we connect the correct channel to the correct picture of a machine.

### 10.2 Allow an external simulated source for testing

A manifest with `"simulated": true` is rejected in production by default. To allow it for a test
deployment without adding simulator code to Vulcan:

```bash
cd /opt/tamaso
sudo sed -i '/^TELEMETRY_ALLOW_SIMULATED_INPUTS=/d' .env
echo 'TELEMETRY_ALLOW_SIMULATED_INPUTS=true' | sudo tee -a .env
sudo chmod 600 .env
sudo docker compose --env-file .env up -d --force-recreate backend stream-worker
```

Verify:

```bash
sudo docker compose --env-file .env exec backend \
  python -c "from django.conf import settings; print(settings.TELEMETRY_ALLOW_SIMULATED_INPUTS)"
```

Set it back to `false` for a real production gateway. A temporary `trycloudflare.com` URL is useful
for testing but should not be treated as a stable production endpoint.

### Explain it like I am 5

Vulcan normally refuses pretend machine messages in a real factory. This switch gives one test
messenger permission to enter. The pretend-message maker still lives outside Vulcan; we only open
the receiving door temporarily.

## 11. Telemetry data flow and storage tiers

```text
External gateway
  -> stream-worker validates and deduplicates readings
  -> PostgreSQL control plane stores bindings, cursors, current state and durable samples
  -> optional ClickHouse hot tier for fast high-volume queries
  -> optional immutable Parquet archive through the storage interface
  -> manually generated versioned Parquet ML datasets
  -> external training system
  -> externally supplied model artifact
  -> ml-observer inference
```

Independent switches:

```text
STREAM_INGESTION_ENABLED=true|false
TELEMETRY_HOT_STORAGE_ENABLED=true|false
TELEMETRY_ARCHIVE_ENABLED=true|false
ML_DATASETS_ENABLED=true|false
```

Disabling one optional destination does not disable the others. Failed optional writes retry with
exponential backoff and then enter a filesystem buffer for later flushing.

### Explain it like I am 5

One machine message can be copied into different cupboards. PostgreSQL remembers what is happening,
ClickHouse is the fast cupboard, Parquet is the long-term archive box, and an ML dataset is a neat
school workbook sent to a separate teacher. Each cupboard has its own on/off switch.

### 11.1 Local development storage

Local development can run PostgreSQL, Redis, ClickHouse and MinIO with Docker Compose. Filesystem
archives, buffers, backups and datasets stay under `.data/`; models stay under `models/`. Without
Docker, install PostgreSQL locally and use:

With PostgreSQL already installed and running locally, use:

```bash
make setup
make dev
```

`make setup` installs Node/Python dependencies, creates the branch-specific PostgreSQL database,
runs migrations and prompts for a local administrator.

`make dev` starts Django, Next.js, the stream poller and ML observer. ClickHouse is optional; leave
`TELEMETRY_HOT_STORAGE_ENABLED=false` when it is unavailable.

### Explain it like I am 5

On a developer laptop, we use small practice cupboards nearby. Docker can bring all the cupboards
together, but Vulcan can still practice with a locally installed PostgreSQL cabinet when Docker is
not available.

### 11.2 Production storage

The current MYPOL deployment uses PostgreSQL as its durable operational database and can use the
mounted filesystem for telemetry archives/datasets. Configure persistent paths under `/data`.
Production ClickHouse is not currently deployed by the MYPOL Compose profile; do not enable the hot
tier until a secured ClickHouse endpoint exists.

The storage interface can later switch archives/datasets to private S3 or MinIO without changing
application logic:

```dotenv
TELEMETRY_STORAGE_BACKEND=s3
TELEMETRY_STORAGE_BUCKET=<private-bucket>
TELEMETRY_STORAGE_PREFIX=telemetry
TELEMETRY_STORAGE_ENDPOINT_URL=<S3-or-MinIO-endpoint>
TELEMETRY_STORAGE_SSE=aws:kms
TELEMETRY_STORAGE_KMS_KEY_ID=<key-id>
```

Credentials must come from workload identity or a secret manager. Use private networking, TLS,
encryption at rest and separate tenant-scoped access.

### Explain it like I am 5

Today the archive boxes can sit in a locked room on the VM. Later we can move them to a guarded cloud
warehouse. Because every warehouse follows the same storage instructions, the application does not
need a new brain when the boxes move.

## 12. Generate ML training datasets

Vulcan prepares datasets but does not train models.

### 12.1 Admin GUI method

1. Login to Django Admin.
2. Open **Streams → Training datasets**.
3. Select **Add training dataset**.
4. Choose a machine from the factory/machine dropdown.
5. Choose scope: `machine`, `machine-family`, or `line`.
6. Enter a new semantic version such as `1.0.0`.
7. Save.
8. Wait for status `READY`.
9. Use the **Parquet** and **Manifest** links in the history row.

The selected machine identifies the family or line for broader scopes. The same scope/version cannot
be generated twice. Access is limited by tenant/factory membership. `ML_DATASETS_ENABLED=true` and
`VULCAN_ADMIN_ENABLED=true` are required.

### Explain it like I am 5

The admin chooses which machine class should get a homework book. Vulcan gathers the matching facts,
puts them into a Parquet workbook, adds a label describing exactly what is inside, and provides two
download buttons.

### 12.2 Automation method

```bash
python backend/manage.py generate_ml_datasets \
  --tenant mypol \
  --factory MYP-MYS \
  --level machine \
  --version 1.0.0
```

Valid levels are `machine`, `machine-family` and `line`. Use the GUI for normal manual work and the
command for scheduled automation.

### Explain it like I am 5

The GUI is a button a person presses. The command is the same job written as an instruction a robot
can run on a schedule.

## 13. ML model storage and selection

### 13.1 Responsibility boundary

Vulcan is inference-only. A separate repository/deployment trains, tunes, evaluates and approves
models. Vulcan only discovers trusted artifacts, checks compatibility/checksums and performs
predictions. There is no `/train/` endpoint and no model-training worker.

### Explain it like I am 5

Another school teaches the model. Vulcan does not teach it; Vulcan receives the finished student’s
sealed report card, checks that it belongs to the correct machine, and asks it questions.

### 13.2 Required local/production folder nomenclature

On the VM, model files live under:

```text
/var/lib/tamaso/MYPOL/models/
```

The container sees this read-only as `/models`. Every version must use:

```text
<tenant-slug>/<factory-code-slug>/<machine-code-slug>/<sku-code-slug>/<model-name>/v<semver>/
  manifest.json
  model.joblib
```

Example:

```text
/var/lib/tamaso/MYPOL/models/
  mypol/myp-mys/mc-01/tube-100/quality-risk/v1.0.0/
    manifest.json
    model.joblib
```

Directory components are lower-case URL slugs. Model names are lower-case kebab-case. Versions use
semantic versioning. Manifest machine/factory/SKU values must use the actual database identifiers,
which may be uppercase.

### Explain it like I am 5

Models live in labeled drawers. The labels say customer, factory, machine, product, model name and
version. A model for machine MC-01 cannot accidentally hide in MC-02’s drawer.

### 13.3 Manifest contract

Each `manifest.json` includes:

```json
{
  "schema_version": 1,
  "name": "quality-risk",
  "version": "1.0.0",
  "runtime": "sklearn-joblib",
  "stage": "available",
  "machine": {
    "tenant": "mypol",
    "factory": "MYP-MYS",
    "code": "MC-01"
  },
  "profile": {
    "sku": "TUBE-100",
    "version": 1,
    "contract": "<production-profile-contract-sha256>",
    "checkpoint_phase": "butting",
    "checkpoint_second": 3
  },
  "artifact": "model.joblib",
  "sha256": "<model-file-sha256>",
  "threshold": 0.62,
  "metrics": {
    "balanced_accuracy": 0.91,
    "evaluation_dataset": "mypol-machine-mc01-v1.0.0"
  }
}
```

Only `sklearn-joblib` is supported. Joblib is pickle-based and may execute code during loading, so
only accept artifacts from a private trusted training pipeline. Calculate the checksum with:

```bash
shasum -a 256 model.joblib
```

### Explain it like I am 5

The manifest is the model’s passport. It says who it is, which machine it belongs to and what lesson
it learned. The checksum is a wax seal proving nobody changed the model after it left the school.

### 13.4 Compatibility and active-version selection

Before syncing a model, Vulcan must already contain a matching production profile with the exact:

- tenant slug;
- factory code;
- machine code;
- SKU code;
- production-profile version;
- feature-contract checksum;
- checkpoint phase; and
- checkpoint second.

`stage: available` records a version but does not serve it. Among exactly compatible manifests with
`stage: production`, Vulcan activates the highest semantic version. Rollback is performed by changing
stages and syncing again.

Models target machines and production profiles, not individual users. User permissions only control
who may see or configure the machine. Machine-family and line scopes currently generate training
datasets; runtime inference still selects an exact-machine package. To reuse one trained artifact
across several compatible machines, publish one valid manifest/package per machine.

### Explain it like I am 5

Before giving a model a job, Vulcan compares every line of its passport with the machine’s job card.
Only an exact match can work. If several approved versions match, Vulcan chooses the newest numbered
one. People do not own models; machines and their recipes do.

### 13.5 Upload and synchronize a model

Upload a prepared version directory to a temporary VM location, then install it under the canonical
tree. Example from a workstation:

```bash
gcloud compute scp --recurse \
  <LOCAL_MODEL_VERSION_DIRECTORY> \
  tamaso-mypol:/tmp/model-version \
  --project=gentle-broker-505219-d0 \
  --zone=asia-south1-b \
  --tunnel-through-iap
```

On the VM, copy it into the exact canonical destination, then protect it:

```bash
sudo install -d -m 0700 \
  /var/lib/tamaso/MYPOL/models/mypol/myp-mys/mc-01/tube-100/quality-risk/v1.0.0
sudo cp /tmp/model-version/manifest.json \
  /tmp/model-version/model.joblib \
  /var/lib/tamaso/MYPOL/models/mypol/myp-mys/mc-01/tube-100/quality-risk/v1.0.0/
sudo chown -R 10001:10001 /var/lib/tamaso/MYPOL/models
sudo find /var/lib/tamaso/MYPOL/models -type d -exec chmod 700 {} \;
sudo find /var/lib/tamaso/MYPOL/models -type f -exec chmod 400 {} \;

cd /opt/tamaso
sudo docker compose --env-file .env run --rm backend \
  python backend/manage.py sync_models
```

The observer also refreshes the registry once per minute. Administrators may instead use
**Admin → ML → Prediction models → Upload model ZIP**. The guided form selects a machine and an
existing production profile, accepts model/version/stage/threshold/metrics, generates the manifest
and canonical path, refuses to replace an immutable version, then synchronizes the registry. The
ZIP must contain exactly one trusted `.joblib` pipeline. With local model storage, the backend
model mount must be writable while the `ml-observer` mount remains read-only.

#### Explain it like I am 5

We place the sealed model passport and model file in the correct locked drawer. `sync_models` is the
librarian who checks every passport, seal and job card, then writes down which approved model is the
active one.

### 13.6 Future S3/MinIO model source

The same hierarchy can live in private S3-compatible storage:

```dotenv
ML_MODEL_SOURCE=s3
ML_MODEL_BUCKET=<private-model-bucket>
ML_MODEL_PREFIX=models
ML_MODEL_ENDPOINT_URL=<S3-or-MinIO-endpoint>
```

Database rows store metadata, checksums and object keys; binaries remain in the folder or bucket.
Credentials come from workload identity or a secret provider, never Git.

### Explain it like I am 5

Today the model drawers are in the VM. Later the same labeled drawers can move to a guarded cloud
warehouse. Vulcan reads the same labels, so the rest of the application does not change.

## 14. Backups, rollback and recovery

Every normal application deployment first uses PostgreSQL 17 `pg_dump` in custom format, writes a
local file under `/var/lib/tamaso/MYPOL/backups`, verifies it is non-empty, and uploads it to:

```text
gs://gentle-broker-505219-d0-vulcan-mypol-prod-backups/postgres/MYPOL/
```

Run a manual backup:

```bash
sudo /opt/tamaso/backup.sh
```

Inspect deployment history:

```bash
sudo tail -n 20 /opt/tamaso/deployments.json
sudo tail -n 20 /opt/tamaso/deployment-failures.log
```

Application rollback is automatic on deployment failure. Database restoration is a separate,
high-risk operation: restore a selected dump into a new database, validate it, then change the
application URL. Keep the old database until application and prediction smoke tests pass.

### Explain it like I am 5

Before repairing a picture, we make a photocopy. If the new frame breaks, we put the old frame back.
If the picture itself was damaged, restoring the photocopy is a separate careful job and should not
be rushed.

## 15. Security and tenant isolation

- PostgreSQL uses a private IP and encrypted-only connections.
- `/opt/tamaso/.env` is root-owned mode `0600`.
- Database passwords live in Secret Manager, not Terraform state or Git.
- GitHub uses Workload Identity rather than a long-lived downloaded service-account key.
- Deployment reaches SSH through IAP.
- Runtime images are pinned by digest.
- Stream API keys are encrypted using `DATA_STREAM_CREDENTIAL_KEY`.
- Model artifacts require SHA-256 verification and trusted storage.
- Telemetry records and datasets carry tenant identity; every application query must enforce it.
- Dataset GUI choices and downloads are restricted by tenant/factory membership.
- Backup buckets prevent public access, retain versions and have soft-delete protection.
- Never expose ClickHouse, Redis, MinIO or PostgreSQL directly to the public internet.

### Explain it like I am 5

Every customer has a labeled room, every helper gets only the keys it needs, and important packages
have tamper seals. We do not leave master keys under the doormat.

## 16. Operations command sheet

### VM health and logs

```bash
cd /opt/tamaso
sudo docker compose --env-file .env ps
sudo docker compose --env-file .env logs --tail=100
sudo docker compose --env-file .env logs --tail=100 backend
sudo docker compose --env-file .env logs --tail=100 stream-worker
sudo docker compose --env-file .env logs --tail=100 ml-observer
sudo docker stats --no-stream
```

### Django operations

```bash
sudo docker compose --env-file .env run --rm backend \
  python backend/manage.py migrate --plan
sudo docker compose --env-file .env run --rm backend \
  python backend/manage.py createsuperuser
sudo docker compose --env-file .env run --rm backend \
  python backend/manage.py sync_models
sudo docker compose --env-file .env run --rm backend \
  python backend/manage.py telemetry_pipeline_status
sudo docker compose --env-file .env run --rm backend \
  python backend/manage.py flush_telemetry_buffer --limit 100
```

### Infrastructure operations in Cloud Shell

```bash
cd ~/vulcan-deploy/clients/mfg-da-auto-all
make infra-plan
make infra-apply
make infra-status
make infra-output
make infra-vm
```

Do not use `infra-destroy` casually. Cloud SQL deletion protection and the backup bucket’s
`force_destroy=false` are intentional safety barriers.

### Explain it like I am 5

This is the grown-up’s toolbox: one button checks which helpers are awake, another reads their
diaries, another creates a manager badge, and another asks the model librarian to check the drawers.

## 17. Troubleshooting lessons from the MYPOL deployment

### PostgreSQL exists, but Django reports SQLite

Check the Secret Manager URL scheme and `/opt/tamaso/.env` without printing credentials. If both are
PostgreSQL but the deployment still uses SQLite, verify the GitHub Environment variable:

```text
DEPLOY_PROFILE=clients/mfg-da-auto-all
```

The wrong root profile explicitly injects SQLite into the container and overrides the VM value.

### Explain it like I am 5

The right key can be in your pocket while the delivery helper still brings the wrong filing cabinet.
Check both the key and the shelf label.

### `terraform-provider-google` exceeds GitHub’s file limit

The `.terraform/` directory was added to Git history. It is a disposable cache. Ensure the deploy
repository `.gitignore` contains:

```gitignore
**/.terraform/
*.tfstate
*.tfstate.*
*.tfvars
!*.tfvars.example
```

Remove the cache from the unpushed commit/history before pushing; never use Git LFS for Terraform
providers.

### Explain it like I am 5

We accidentally tried to mail the builder’s giant hammer with the house plan. Leave the hammer in
the workshop; the next builder can fetch their own.

### SSH/IAP reports a broken pipe

Test SSH independently and unlock the Cloud Shell key with `ssh-add`. The NumPy message is only a
speed recommendation. Retry `make infra-vm` only after `echo SSH_OK` succeeds.

### Explain it like I am 5

The telephone call ended before the message finished. First make a tiny test call and say “hello.”
Once that works, send the important message again.

### Admin login returns CSRF 403

Reload the login page to obtain a fresh token, accept cookies, avoid submitting a page opened before
another login, and confirm `DJANGO_CSRF_TRUSTED_ORIGINS=https://<APP_HOST>`. Login rotates the token.

### Explain it like I am 5

The login form contains a one-time ticket. If the ticket is old because another door was opened, ask
for a fresh form instead of reusing the old ticket.

### Stream shows “Simulated stream inputs are disabled”

The source manifest says it is simulated and production defaults to rejecting it. Enable
`TELEMETRY_ALLOW_SIMULATED_INPUTS=true` only for the required test deployment, recreate backend and
stream-worker, then retry discovery.

### Explain it like I am 5

The guard correctly noticed a pretend messenger. During an approved practice session, we tell the
guard that this pretend messenger may enter.

## 18. Deployment checklist

### Before infrastructure apply

- [ ] Correct GCP project selected.
- [ ] `terraform.tfvars` reviewed and not tracked by Git.
- [ ] Correct VM service account recorded.
- [ ] Existing private service access checked.
- [ ] Terraform state bucket/prefix confirmed.
- [ ] `make infra-plan` reviewed.

### Before application deployment

- [ ] Client branch and config version are correct.
- [ ] Build Artifact workflow is green.
- [ ] Backend and frontend digests copied separately.
- [ ] GitHub Environment is exactly `gcp-MYPOL`.
- [ ] `DEPLOY_PROFILE=clients/mfg-da-auto-all`.
- [ ] VM `.env` exists, is mode `0600`, and contains no SQLite production URL.
- [ ] PostgreSQL backup bucket access works.
- [ ] Deployment reason and unique deployment ID prepared.

### After deployment

- [ ] GitHub deployment workflow is green.
- [ ] Backend, frontend, Redis, stream-worker, ml-observer and Caddy are healthy.
- [ ] HTTPS frontend loads.
- [ ] `/api/backend/health/` succeeds.
- [ ] Admin page and static assets load.
- [ ] Correct administrator can log in using email.
- [ ] Tenant membership restricts normal users correctly.
- [ ] Manual backup succeeds.
- [ ] Stream discovery/polling works.
- [ ] Model registry status is expected.
- [ ] Deployment appears in `/opt/tamaso/deployments.json`.

### Explain it like I am 5

A pilot checks every switch before takeoff and again after landing. The checklist keeps us from
forgetting a small switch when the job feels familiar.

## 19. What is deliberately not inside Vulcan

- Simulator implementation and telemetry generation.
- ML training, tuning, evaluation or promotion infrastructure.
- A `/train/` API.
- A public model upload/training API. Trusted model ingestion is restricted to Django Admin.
- Production ClickHouse/MinIO deployment in the current MYPOL profile.
- A universal database choice forced on every client; profiles may select Cloud SQL PostgreSQL or an
  externally managed database, provided the client application supports it.

Vulcan keeps stable interfaces at these boundaries: `http-pull-v1` for streams, storage interfaces
for archives/datasets, and the checksum-protected model registry contract for inference.

### Explain it like I am 5

Vulcan is a factory listener and decision helper. It does not pretend to be the machine, and it does
not run the school that teaches models. It has clear doors where those outside helpers can safely
hand things over.

## 20. Glossary

| Term | Meaning | Five-year-old version |
| --- | --- | --- |
| Artifact | Built backend or frontend container image | A sealed application lunchbox |
| Digest | Immutable SHA-256 identity of an image | The lunchbox fingerprint |
| Terraform | Declarative infrastructure tool | A builder following a written plan |
| Terraform state | Record of infrastructure Terraform manages | The builder’s notebook |
| Cloud SQL | Managed PostgreSQL database | The strong filing cabinet |
| Secret Manager | Managed secret storage | The locked key box |
| GCE VM | Google Compute Engine virtual machine | The computer-house running Vulcan |
| IAP | Controlled tunnel to the VM | A guarded private hallway |
| Caddy | HTTPS reverse proxy | The front-door helper |
| Redis | Fast temporary coordination store | A shared sticky-note pad |
| Cursor | Stream progress marker | A bookmark in the machine notebook |
| Parquet | Columnar data file for analytics/ML | A neatly packed data workbook |
| Manifest | Metadata and compatibility declaration | A passport and contents label |
| Production profile | Exact feature/checkpoint contract for inference | The machine’s job card |
| Semantic version | Version such as `1.2.3` | A numbered edition |
| Tenant | Top-level customer data boundary | A customer’s locked room |
| Rollback | Restore previous application release | Put the old working toy back |

---

## Final operating rule

Infrastructure changes happen deliberately through `vulcan-deploy`; application releases happen
through immutable artifacts built from `vulcan`; customer secrets remain outside both Git
repositories; and ML training/simulation remain separate systems connected through explicit,
versioned interfaces.

### Explain it like I am 5

Keep recipes, house plans and secret keys in their proper boxes. Label every delivery, check every
seal, and always keep a safe copy before changing a working factory.
