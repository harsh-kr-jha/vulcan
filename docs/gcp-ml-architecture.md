# GCP architecture for continuous machine learning

## Decision

Use PostgreSQL for every development and deployed runtime. SQLite is limited to isolated automated
tests. On GCP, use Cloud SQL for PostgreSQL rather than a PostgreSQL container on the application
VM. Keep model artifacts and large raw files outside the database.

## Recommended production topology

```text
Factory gateway
    -> ingestion worker
    -> Cloud SQL PostgreSQL (configuration, labels, cycle state, model registry)
    -> Pub/Sub (durable observation/training events)
         -> observation workers
         -> training workers (concurrency limited per machine)
              -> Cloud Storage (versioned model artifacts)

Cloud Run frontend -> Cloud Run API -> Cloud SQL
                                  -> Cloud Storage signed access
```

- **Cloud SQL PostgreSQL:** regional high availability, automated backups, point-in-time recovery,
  private connectivity, and a separate database per customer where isolation requires it.
- **API:** a stateless Cloud Run service. Cap maximum instances and reuse database connections so
  autoscaling cannot exhaust Cloud SQL connections.
- **Continuous ingestion/observation:** a Cloud Run worker pool or a small managed instance group
  for the existing long-running pull protocol. Do not run polling inside the request-serving API.
- **Training:** for frequent small models, consume training requests from Pub/Sub with workers whose
  concurrency is explicitly limited. Use Cloud Run Jobs for larger run-to-completion retraining or
  scheduled backfills. The existing `TrainingRun` status transition makes duplicate delivery safe.
- **Artifacts:** store immutable model files in a private, versioned Cloud Storage bucket. Keep the
  checksum and object generation with each `TrainingRun`; never store model binaries in Cloud SQL.
- **Telemetry:** keep the recent operational window and derived cycle features in Cloud SQL. Export
  older raw telemetry to BigQuery or partitioned Cloud Storage instead of using the transactional
  database as the permanent analytics archive.
- **Secrets and access:** put database credentials and signing keys in Secret Manager. Give each
  runtime its own service account with only Cloud SQL Client and required bucket permissions.
- **Operations:** monitor queue age, failed training count, training duration, model drift,
  ingestion lag, and database connection usage. Use a dead-letter topic for repeatedly failing work.

## Migration and rollout

1. Create Cloud SQL in the same region as compute; enable HA, automated backups and PITR.
2. Run Django migrations as a one-task release job before routing application traffic.
3. Use `migrate_sqlite_to_postgres` once for legacy SQLite installations and verify table counts.
4. Start the API, ingestion, observation and training services against PostgreSQL.
5. Run a smoke training job, then retain SQLite as a read-only rollback source until a PostgreSQL
   backup and restore drill succeeds.

## Google Cloud references

- [Connect Cloud Run to Cloud SQL](https://cloud.google.com/sql/docs/postgres/connect-run)
- [Manage Cloud SQL connections](https://cloud.google.com/sql/docs/postgres/manage-connections)
- [Cloud SQL high availability](https://cloud.google.com/sql/docs/postgres/high-availability)
- [Cloud SQL backup and recovery](https://cloud.google.com/sql/docs/postgres/backup-recovery/backups)
- [Cloud Run services, jobs and worker pools](https://cloud.google.com/run/docs/overview/what-is-cloud-run)
- [Cloud Run jobs](https://cloud.google.com/run/docs/create-jobs)
- [Pub/Sub delivery semantics](https://cloud.google.com/pubsub/docs/subscription-overview)
