# GCE customer deployment with Cloud SQL PostgreSQL

This profile deploys one selected Vulcan variant to Compute Engine while keeping durable relational
state in Cloud SQL PostgreSQL. The VM runs the web containers and independent ingestion,
observation and external-model inference processes.

## Persistence contract

- Cloud SQL PostgreSQL is the only live application database.
- Enable regional high availability, automated backups and point-in-time recovery on Cloud SQL.
- `deploy.sh` refuses to migrate or replace containers until `backup.sh` has made a consistent
  PostgreSQL custom-format dump and uploaded it to the private GCS bucket.
- A systemd timer performs an additional daily backup. Local backup files older than seven days are
  removed; GCS retention is controlled by the bucket lifecycle and soft-delete settings.
- Redis is local and disposable: it carries queued work, while PostgreSQL remains the source of
  truth and safely allows a missed job to be scheduled again.

## Deployment identity and variant isolation

The GitHub workflow deployment identity is `(selected Git ref, selected variant, target GitHub
environment)`. Each target's `.env` fixes its variant. The deploy script refuses a workflow request
whose variant differs from that target, and the image names, data directory, backups, and GitHub
environment are variant-scoped. A branch never owns a database; deploying a different branch to
the same target migrates and retains that target variant's database.

Use one environment and VM per simultaneous live variant, for example
`gcp-automotive-showcase`/`vulcan-automotive` and
`gcp-mushroom-showcase`/`vulcan-mushroom`.

## One-time bootstrap

Create `/opt/tamaso/.env` directly on the VM with mode `0600`. It must contain:

```dotenv
GCP_PROJECT_ID=gentle-broker-505219-d0
GCP_REGION=us-central1
AR_REPOSITORY=vulcan
IMAGE_TAG=<first-deployed-git-sha>
GCS_BACKUP_BUCKET=gentle-broker-505219-d0-vulcan-data
DJANGO_DATABASE_URL=postgresql://<user>:<password>@<cloud-sql-private-ip>:5432/<database>
REDIS_URL=redis://redis:6379/0
DJANGO_CACHE_URL=redis://redis:6379/1
APP_HOST=<reserved-ip>.sslip.io
ACME_EMAIL=<certificate-contact-email>
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_ALLOWED_HOSTS=<reserved-ip>.sslip.io
DJANGO_CSRF_TRUSTED_ORIGINS=https://<reserved-ip>.sslip.io
DJANGO_TRUST_PROXY_HEADERS=true
DJANGO_NUM_PROXIES=1
VULCAN_VARIANT=<automotive-or-mushroom>
VULCAN_ADMIN_ENABLED=true
CELERY_TASK_ALWAYS_EAGER=false
MYPOL_DEMO_EMAIL=<showcase-login-email>
MYPOL_DEMO_PASSWORD=<strong-showcase-password>
```

After the first healthy deployment, load the checksum-verified synthetic automotive dataset once:

```bash
cd /opt/tamaso
docker compose --env-file .env run --rm backend \
  python backend/manage.py seed_mypol --confirm-production-showcase
```

The seed command is deliberately gated to this automotive showcase profile. Do not rerun it
after users have begun changing the demonstration data unless resetting the synthetic dataset is
intentional.

For a mushroom target, use the corresponding guarded seed command instead:

```bash
docker compose --env-file .env run --rm backend \
  python backend/manage.py seed_mushroom --confirm-production-showcase
```

Create additional login IDs without rerunning the seed:

```bash
cd /opt/tamaso
docker compose --env-file .env run --rm backend \
  python backend/manage.py create_showcase_user --role executive
```

The command prompts for the email, display name, and password, then atomically creates the login
identity and that variant's tenant membership. `executive` is the read-only default; use
`company_admin` only for members who should be able to change workspace data.

The opt-in Django administration panel is available at `https://<host>/admin/` for every variant.
Its user screen includes both the canonical email identity and tenant membership, which must be
filled in for a newly added user to log in. The panel always operates on that deployment's own
variant database. Keep the superuser password separate from member passwords.

## Migrations

Every deployment uses this order:

1. Create a consistent PostgreSQL dump and upload it under `postgres/<customer>/` in GCS.
2. Pull immutable images for the selected variant and Git SHA.
3. Print the Django migration plan from the new backend image.
4. Stop all application writers for a short maintenance window, then apply `migrate --noinput`.
5. Collect admin static files, start the containers, wait for health, and record the deployed SHA.

A failed migration stops the deployment and leaves the pre-deploy backup intact. Code rollback is
safe only when migrations are backward compatible; otherwise restore the matching database backup
or apply an explicit reverse migration.

## Restore

Stop all application writers. Download the selected GCS dump and restore it to a new Cloud SQL
database with `pg_restore`; verify it before changing `DJANGO_DATABASE_URL`. Keep the previous
database available until the restored application passes health and prediction smoke checks.
