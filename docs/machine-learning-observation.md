# Machine prediction and observation

Vulcan observes machine telemetry and performs inference only. It does not train, tune, evaluate,
queue, promote or store training datasets for models. Training happens in a separate system.

The `ml-observer` process consumes durable telemetry, maintains per-cycle feature prefixes and
range health, and invokes a compatible externally supplied model at the configured checkpoint.
Quality outcomes can still be collected for operational analysis and export to the external model
development workflow; they are never inference features.

## Model ingestion

Development models are read from `models/`. Every version contains a checksum-protected joblib
artifact and `manifest.json`. See [the registry contract](../models/README.md) for the exact folder
nomenclature, manifest schema and selection rules.

Run `python backend/manage.py sync_models` for an immediate refresh. The observer refreshes the
registry every minute. The status API and UI expose the model name, semantic version, runtime,
source and active state. There is no model upload or training API.

Production can use the identical hierarchy in a private S3-compatible bucket by setting
`ML_MODEL_SOURCE=s3`, `ML_MODEL_BUCKET` and `ML_MODEL_PREFIX`. Database rows contain metadata,
checksums and source keys only; model binaries remain in the folder or bucket.

## Compatibility and selection

A manifest identifies a factory code, machine code, SKU code, production-profile version, feature
contract, checkpoint phase and checkpoint second. Ingestion rejects any mismatch. This prevents a
model built for one machine or feature order from silently running on another.

Models with `stage: available` appear in history but are not served. Among compatible manifests
with `stage: production`, the highest semantic version is active. Changing manifest stages and
syncing performs deployment or rollback without an application-side promotion workflow.

## API

`GET /api/ml/machines/{id}/` returns observation status, production profiles, compatible model
versions and the latest health/prediction. Supported POST actions are `configuration`, `profiles`,
`activate`, and `outcome-binding`. Profile changes remain manager/admin operations; production
supervisors may select an active profile.
