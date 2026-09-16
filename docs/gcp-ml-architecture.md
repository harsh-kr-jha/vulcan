# Prediction serving architecture on GCP

Vulcan is an inference consumer. Model training belongs to an external pipeline and no trainer,
training queue, training API or automatic retraining process is deployed with the platform.

```text
Telemetry -> ingestion -> PostgreSQL -> ml-observer -> prediction
                                      -> private model registry
```

For local development, the registry is the repository `models/` folder mounted read-only into the
backend and observer containers. For production, use a private versioned Cloud Storage bucket
through its S3-compatible endpoint or an equivalent private S3 store. Preserve the exact folder
layout documented in [models/README.md](../models/README.md).

The observer lists manifests once a minute, validates machine/profile compatibility, verifies each
SHA-256 checksum and records registry metadata in PostgreSQL. Artifact bytes stay outside the
database and are loaded lazily for prediction. Cache keys include artifact path and checksum, so a
new immutable version cannot reuse stale model bytes.

Grant the runtime identity read-only access to the model prefix. The external training/deployment
identity alone should have write access. Because joblib is pickle-based, never ingest artifacts
from public or user-writable storage.
