# Machine ML Observation

Open a Lexicon machine and select **ML Observation**. Publish a production profile for a factory
Product/SKU, configure inclusive bounds, weights, applicable phases and a decision checkpoint,
activate it, then enable observation. A requested profile change takes effect on the next cycle.
The profile and feature contract remain fixed for each cycle.

The stream worker only ingests telemetry. The independent ML observation worker processes durable
pending telemetry, generates prefix features and cached predictions, polls optional quality
channels, and checks automatic training eligibility once a minute. Training can therefore never
hold up incoming machine data.

## Running locally

Install dependencies with `uv sync --group dev` and apply `python backend/manage.py migrate`.
Run the stream worker and independent ML observation worker (with the virtual environment activated):

```sh
python backend/manage.py poll_data_streams
```

In a separate terminal, run:

```sh
OMP_NUM_THREADS=1 DJANGO_DEBUG=true python backend/manage.py observe_machines
```

Debug and single-node installations execute database-queued training inside that dedicated process
and do not require Redis. Multi-service installations publish jobs to the dedicated Celery trainer.
The trainer requires private S3/MinIO storage configured using `AWS_S3_BUCKET`,
`AWS_S3_ENDPOINT_URL`, `AWS_REGION` and AWS credentials in production. Debug and single-node
installations fall back to private local files under `.data/ml-models`. Compose starts both
observation and trainer services. No model is automatically promoted.
Only server-generated model artifacts are loaded, with checksum verification.

## Model behavior

Health is the weighted fraction of applicable checks in range, expressed as a percentage. Missing
applicable readings count as failed checks. Green is 90 or above, amber is 70–90, red is below 70.
Health is a compliance measure; ML failure probability is separate.

Training requires 200 complete labeled cycles with at least 20 of each class and checkpoint
coverage. Models use every partial-cycle prefix, with progressive weighting toward later prefixes
as more evidence becomes available; the checkpoint prediction determines validation/test
metrics. Entire runs are kept isolated when they can provide at least five cycles of both classes
in every partition. Uneven or one-class runs use a deterministic, outcome-stratified cycle split
instead, and the chosen strategy is recorded in the run metrics. A candidate needs 0.70 test
balanced accuracy. Threshold is selected on validation data. Operators review candidates before
promotion or rollback.

New labeled data or human corrections can trigger another training candidate (100 new cycles or
10 corrected cycles). The current human-verified effective label is used, and its revision is
recorded in the training manifest. Candidate metrics describe that frozen dataset; later label
corrections affect subsequent training. Features are retained for 365 days, raw telemetry for the
existing 30 days. Pre-migration cycles remain unassigned and are excluded from training.

Quality channels use the same pull protocol, with run_id, cycle_id, observed_at and a selection
field marked `semantic=quality_outcome`, options `good` and `failure`. Inline outcomes remain
supported. Human overrides take precedence. Prediction inputs exclude outcome metadata,
identifiers, counters and quality labels. Type/unit/removal changes require a reviewed profile;
additions do not change the current profile's features.

## Interfaces

`GET /api/ml/machines/{id}/` returns status, profiles, collection counts, recent training runs and
latest health/prediction. POST actions are `configuration`, `profiles`, `activate`, `outcome-binding`,
`train`, `promote`, and `rollback`. All access is scoped to the tenant and factory. Profiles and
training are manager/admin operations; production supervisors may select the active profile.
Cycle-history responses contain `ml` health/profile/checkpoint evaluation and per-sample
violations/prediction. Missing predictions are never presented as a Good label.

The simulator and its validation tests remain local and Git-ignored. Simulator evaluation tests
the software and synthetic fault logic; it does not establish accuracy on real production data.
