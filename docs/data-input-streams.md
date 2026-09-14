# Data input streams

Vulcan keeps machine configuration independent from telemetry transport:

```text
External simulator or PLC gateway -> http-pull-v1 -> stream binding -> Lexicon telemetry
```

The backend owns credentials and polling. Browsers and Lexicon machine JSON only receive stream,
channel, schema, and health metadata; they never receive the bearer token.

## `http-pull-v1` source contract

All endpoints require `Authorization: Bearer <source key>` and return JSON.

| Method and endpoint | Response purpose |
| --- | --- |
| `GET /v1/manifest` | Source identity, protocol, health, channels, and optional controls |
| `GET /v1/channels/{channel_id}/schema` | Immutable-versioned fields plus the channel's current opaque cursor |
| `GET /v1/channels/{channel_id}/readings?after={cursor}&limit=500` | Ordered unread events and `next_cursor` |
| `POST /v1/control/{action}` | Optional action advertised by the manifest |

A reading has this shape:

```json
{
  "event_id": "globally-unique-uuid",
  "observed_at": "2026-09-14T08:30:00+00:00",
  "sequence_no": 123,
  "schema_version": "splicing.telemetry.v1",
  "run_id": "run-id",
  "cycle_id": "cycle-id",
  "cycle_number": 5,
  "cycle_phase": "butting",
  "recipe_id": "standard",
  "values": { "temperature_current_c": 599.8 }
}
```

The source must retain events long enough for consumers to retry an old cursor. Event IDs must be
idempotent, events must be in increasing `sequence_no` order within each `run_id`, and cursors must
remain valid after a source restart. A new source run may restart its sequence. Vulcan commits a
batch and its new cursor in one database transaction.

## External test simulator

The test simulator is intentionally maintained outside this repository. Register its reachable
base URL and bearer key on `/uploads`; Vulcan interacts with it only through `http-pull-v1`.

The simulator publishes 15 numeric fields once per simulated second. A cycle is 23 seconds:
loading 2 s, clamping 2 s, cutting 3 s, butting 14 s, and release 2 s. Setpoints change after
80–160 cycles; actual values include phase-aware lag, correlated behavior, and multi-cycle faults.
Faults are scheduled 3–8 cycles ahead, with gradual thermal, knife, pneumatic, timing, or sensor
precursors before failure. Fault identities and labels remain simulator-owned and are not exposed
as any of the 15 pull API inputs.

Each retained run contains:

- `run_manifest.json`
- `telemetry.jsonl`
- flattened `telemetry.csv`
- `simulation_faults.jsonl` when a simulated fault occurs
- `cycle_truth.jsonl` with direct `good`/`failure` cycle ground truth
- `labeled_telemetry.csv` with labels joined to all 23 samples of each completed cycle
- `training_cycles.csv` with cycle aggregates and a finalized `failure_within_5_cycles` target

The final five cycles are withheld from `training_cycles.csv` until their five-cycle outcome
horizon is complete. Train/test splits should be made by complete `run_id` to avoid adjacent-cycle
leakage. Outcome and failure columns are targets or audit metadata, never inference features.

The final reading of a completed cycle may carry an `outcome` metadata object. Vulcan stores it
as cycle-level ground truth and joins it onto every matching row in Lexicon machine history.
Operators can change the **Splice result** dropdown after physical inspection; the source label is
retained alongside the human-verified effective label, reviewer, and review time. Training should
use the effective label while retaining source provenance for label-quality analysis.

The displayed operating values are demo profiles and are not plant-approved process limits.
They are informed by general [rubber-process guidance](https://www.entrepreneurindia.co/books/modern-technology-of-rubber-allied-industries)
and [illustrative operating ranges](https://indiarubberdirectory.com/engineering/rubber_product_manufacturing.asp),
not by a commissioning sheet for a specific plant.

## Operator workflow

1. Open `/uploads`, register the source URL and API key, then test/discover it.
2. Open a Lexicon machine and choose **Data input stream** and **Channel**.
3. Save the layout. Vulcan fetches the current schema/cursor and creates source-owned parameters.
4. Start or control the simulator from `/uploads` if its manifest advertises controls.
5. Run `python manage.py poll_data_streams` (the Compose `stream-worker` does this automatically).

Changing a channel removes only the previous source-owned parameters. Manual parameters and old
telemetry remain. Compatible schema additions are applied automatically, removed fields are
archived, and type/unit changes pause that binding until an operator accepts the review on
`/uploads`.
