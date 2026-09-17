# Data input streams

Vulcan keeps machine configuration independent from telemetry transport:

```text
External telemetry source -> http-pull-v1 -> stream binding -> Lexicon telemetry
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

## External source ownership

Vulcan does not create or emit telemetry. PLC gateways, test harnesses and any simulation systems
are independently developed and deployed. They connect through the same `http-pull-v1` contract;
the platform does not depend on their implementation, runtime or data-generation libraries.

Local development may accept a source manifest marked `"simulated": true`. This is only an input
classification—the simulator itself remains outside this repository—and is controlled by
`TELEMETRY_ALLOW_SIMULATED_INPUTS`. Accepted samples can be tiered into ClickHouse and Parquet as
described in [Telemetry storage](telemetry-storage.md).

The last reading of a completed cycle may carry an `outcome` metadata object. Vulcan stores the
source result as cycle-level ground truth and retains any subsequent human-reviewed effective
label with reviewer and review time. Outcome fields are audit metadata and never inference inputs.

## Operator workflow

1. Open `/uploads`, register the source URL and API key, then test/discover it.
2. Open a Lexicon machine and choose **Data input stream** and **Channel**.
3. Save the layout. Vulcan fetches the current schema/cursor and creates source-owned parameters.
4. Operate the external source independently, or use an advertised generic control if supported.
5. Run `python manage.py poll_data_streams` (the Compose `stream-worker` does this automatically).

Changing a channel removes only the previous source-owned parameters. Manual parameters and old
telemetry remain. Compatible schema additions are applied automatically, removed fields are
archived, and type/unit changes pause that binding until an operator accepts the review on
`/uploads`.
