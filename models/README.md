# Prediction model registry

Vulcan is inference-only. Train and evaluate models elsewhere, then place each immutable model
version in this folder with its manifest and run:

```bash
python backend/manage.py sync_models
```

The observer also refreshes this registry once a minute. Model binaries are intentionally ignored
by Git; manifests may be committed for deployment auditability.

## Admin upload

When Django Admin is enabled, open **ML → Prediction models** and select **Upload model ZIP**.
Choose the machine and one of its existing production profiles, then supply the model name,
semantic version, stage, threshold, optional metrics and a ZIP containing exactly one trusted
`.joblib` pipeline. Vulcan derives the tenant/factory/machine/SKU path, generates the manifest,
calculates SHA-256, refuses to overwrite an existing version and synchronizes the registry.

For `ML_MODEL_SOURCE=local`, the backend model volume must be writable; the `ml-observer` volume
should remain read-only. For `ML_MODEL_SOURCE=s3`, the backend identity needs write/list/read/delete
permissions on the configured private prefix while the observer only needs read/list access.

## Required naming

```text
models/<tenant-slug>/<factory-code>/<machine-code>/<sku-code>/<model-name>/v<semver>/
  manifest.json
  model.joblib
```

All directory names are lowercase URL slugs. `model-name` is lowercase kebab-case and `version`
is semantic versioning. Example: `models/acme/pune-01/cnc-07/axle-20/quality-risk/v2.3.1/`.
This path makes the machine and product target visible without opening the artifact. The manifest
is still authoritative and is checked against the database production profile.

## Manifest and selection

Copy `manifest.example.json` into a version directory as `manifest.json`. Fill the profile
contract with the value produced by Vulcan and calculate the checksum with
`shasum -a 256 model.joblib`.

Use `"stage": "available"` to ingest a version without serving it. Use `"stage": "production"`
to make it eligible for prediction. If several production manifests are compatible with the same
machine, SKU and feature contract, Vulcan selects the highest semantic version. Rollback is
declarative: change stages in the manifests and sync again.

Only artifacts from a private, trusted source may be placed here because joblib loading executes
Python pickle data. Vulcan verifies SHA-256 before every uncached load.

## Cloud source

The same directory tree works in S3-compatible object storage:

```text
ML_MODEL_SOURCE=s3
ML_MODEL_BUCKET=private-model-bucket
ML_MODEL_PREFIX=models
ML_MODEL_ENDPOINT_URL=https://storage.googleapis.com
```

Local development defaults to `ML_MODEL_SOURCE=local` and this `models/` directory.
