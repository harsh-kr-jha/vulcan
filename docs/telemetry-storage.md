# Telemetry storage pipeline

Vulcan keeps stream ingestion, hot analytics, raw archival and ML dataset generation as separate
switches. PostgreSQL remains the control plane for bindings, cursors, current machine state and
operational compatibility. Accepted telemetry is additionally tiered as follows:

```text
external or simulated http-pull-v1 source
  -> validation + PostgreSQL control plane
  -> ClickHouse machine_telemetry (hot, optional)
  -> immutable Zstandard Parquet batch (archive, optional)
  -> versioned training Parquet (manual generation, optional)
```

## Local development

`docker compose up` starts ClickHouse alongside the existing local services. ClickHouse listens
only on loopback (`8123` HTTP, `9009` native). Raw archives, generated datasets, retry buffers,
model artifacts and operator backups stay under local project folders:

```text
.data/telemetry/tenants/<tenant-uuid>/raw/year=YYYY/month=MM/day=DD/hour=HH/*.parquet
.data/telemetry/tenants/<tenant-uuid>/datasets/<factory>/<level>/<target>/v<semver>/
.data/telemetry-buffer/*.json
models/<tenant>/<factory>/<machine>/<sku>/<model-name>/v<semver>/
.data/backups/
```

Each dataset directory contains `data.parquet` and a checksum-protected `manifest.json`.
Generate one dataset per machine, machine family (`machine.metadata.family`) or production line:

Administrators can use **Admin → Streams → Training datasets → Add training dataset**. Choose a
machine code, scope and version, then save. The history page shows generation status and provides
permission-checked **Parquet** and **Manifest** download links. Family and line scopes use the
chosen machine to select the related family or production line. `ML_DATASETS_ENABLED=true` is
required; deployed environments must also opt into Django Admin with `VULCAN_ADMIN_ENABLED=true`.
This dataset workflow reads PostgreSQL telemetry and writes through the storage interface; it does
not require Docker or ClickHouse.

The management command remains available for scheduled jobs and automation:

```bash
python backend/manage.py generate_ml_datasets \
  --tenant acme --factory pune-01 --level machine --version 1.0.0
python backend/manage.py generate_ml_datasets \
  --tenant acme --factory pune-01 --level machine-family --version 1.0.0
python backend/manage.py generate_ml_datasets \
  --tenant acme --factory pune-01 --level line --version 1.0.0
```

The application remains inference-only: these commands prepare data for a separate training
deployment. Prediction model naming and semantic-version selection remain documented in
`models/README.md`.

Simulators are external inputs, not embedded platform services. A source manifest may set
`"simulated": true`; it is accepted only when `TELEMETRY_ALLOW_SIMULATED_INPUTS=true` (the local
default). Production should leave it false.

## ClickHouse layout

`init_clickhouse` creates:

- `machine_telemetry`: monthly partitions, tenant/factory/machine ordering, Delta + ZSTD codecs,
  and configurable time-based deletion;
- `machine_telemetry_1m`: a materialized minute rollup for count and observation bounds.

Every row includes `tenant_id`; application queries must always supply it. The local ClickHouse
account is ingestion-only in intent. Production should use distinct ingest/read users and row
policies per tenant or deployment, private networking and TLS.

## Reliability and monitoring

Each optional destination retries with exponential backoff. If it remains unavailable, the batch
is written atomically to `.data/telemetry-buffer` and retried by the stream worker every 30 seconds.
Commands:

```bash
python backend/manage.py telemetry_pipeline_status
python backend/manage.py flush_telemetry_buffer --limit 100
python backend/manage.py init_clickhouse
make backup-local
```

`GET /health/` reports enabled stages and buffer pressure without exposing credentials.
`make backup-local` writes a timestamped PostgreSQL custom-format dump to `.data/backups`.

## Production object storage

Switch storage without application changes:

```text
TELEMETRY_STORAGE_BACKEND=s3
TELEMETRY_STORAGE_BUCKET=private-telemetry
TELEMETRY_STORAGE_PREFIX=telemetry
TELEMETRY_STORAGE_ENDPOINT_URL=https://s3.example.internal
TELEMETRY_STORAGE_SSE=aws:kms
TELEMETRY_STORAGE_KMS_KEY_ID=<kms-key-id>
```

AWS-compatible credentials are supplied through the SDK credential chain or workload identity,
never committed configuration. For MinIO, use its private endpoint and `AES256`. Filesystem writes
use mode `0600` by default; production hosts should also use encrypted disks. ClickHouse secrets,
stream encryption keys and object-store credentials must come from a secret manager. Enforce TLS
with `CLICKHOUSE_URL=https://...` and keep `CLICKHOUSE_VERIFY_TLS=true`.

## Independent switches

```text
STREAM_INGESTION_ENABLED=true|false
TELEMETRY_HOT_STORAGE_ENABLED=true|false
TELEMETRY_ARCHIVE_ENABLED=true|false
ML_DATASETS_ENABLED=true|false
```

Disabling one optional destination does not disable the others. The initial local implementation
does not require Kafka, a cloud bucket, a distributed scheduler or a model-training service.
