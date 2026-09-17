"""Independent hot-storage and archive stages for accepted telemetry."""

from __future__ import annotations

import hashlib
import json
import logging
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory

import duckdb
from django.conf import settings

from apps.streams.clickhouse import ClickHouseTelemetryStore
from apps.streams.storage import tenant_storage

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    records: int = 0
    hot_written: bool = False
    archive_key: str = ""
    buffered: bool = False
    error: str = ""


def sample_record(sample) -> dict:
    return {
        "tenant_id": str(sample.tenant_id),
        "factory_id": str(sample.machine.layout.factory_id),
        "machine_id": str(sample.machine_id),
        "event_id": str(sample.event_id),
        "stream_id": str(sample.stream_id) if sample.stream_id else None,
        "channel_id": sample.channel_external_id,
        "schema_version": sample.schema_version,
        "observed_at": sample.observed_at.astimezone(UTC).isoformat(timespec="milliseconds"),
        "received_at": (
            sample.received_at.astimezone(UTC).isoformat(timespec="milliseconds")
            if sample.received_at
            else datetime.now(UTC).isoformat(timespec="milliseconds")
        ),
        "sequence_no": sample.sequence_no,
        "run_id": sample.run_id,
        "cycle_id": sample.cycle_id,
        "cycle_number": sample.cycle_number,
        "cycle_phase": sample.cycle_phase,
        "recipe_id": sample.recipe_id,
        "values_json": json.dumps(sample.values, separators=(",", ":"), sort_keys=True),
    }


def parquet_bytes(records: list[dict]) -> bytes:
    """Encode records as Zstandard Parquet without requiring pandas/pyarrow."""
    with TemporaryDirectory(prefix="vulcan-parquet-") as directory:
        source = Path(directory) / "records.ndjson"
        output = Path(directory) / "records.parquet"
        source.write_text(
            "".join(json.dumps(row, separators=(",", ":")) + "\n" for row in records),
            encoding="utf-8",
        )
        connection = duckdb.connect()
        try:
            connection.execute(
                "CREATE TABLE batch AS SELECT * FROM read_json_auto(?)", [str(source)]
            )
            escaped = str(output).replace("'", "''")
            connection.execute(f"COPY batch TO '{escaped}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        finally:
            connection.close()
        return output.read_bytes()


def _archive(records: list[dict]) -> str:
    if len({row["tenant_id"] for row in records}) != 1:
        raise ValueError("An archive batch cannot contain more than one tenant.")
    first = min(datetime.fromisoformat(row["observed_at"]) for row in records)
    tenant_id = records[0]["tenant_id"]
    key = (
        f"raw/year={first:%Y}/month={first:%m}/day={first:%d}/hour={first:%H}/"
        f"batch-{uuid.uuid4()}.parquet"
    )
    tenant_storage(tenant_id).put(
        key, parquet_bytes(records), content_type="application/vnd.apache.parquet"
    )
    return key


def _retry(operation):
    last_error = None
    for attempt in range(settings.TELEMETRY_PIPELINE_RETRIES + 1):
        try:
            return operation()
        except Exception as exc:
            last_error = exc
            if attempt < settings.TELEMETRY_PIPELINE_RETRIES:
                time.sleep(settings.TELEMETRY_PIPELINE_RETRY_SECONDS * (2**attempt))
    raise last_error


def _spool(records: list[dict], *, hot: bool, archive: bool, error: str) -> Path:
    directory = Path(settings.TELEMETRY_BUFFER_DIR).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        {"hot": hot, "archive": archive, "error": error, "records": records},
        separators=(",", ":"),
    ).encode()
    digest = hashlib.sha256(payload).hexdigest()
    path = directory / f"{datetime.now(UTC):%Y%m%dT%H%M%S%f}-{digest[:12]}.json"
    path.write_bytes(payload)
    path.chmod(settings.TELEMETRY_LOCAL_FILE_MODE)
    return path


def ingest_samples(samples) -> PipelineResult:
    records = [sample_record(sample) for sample in samples]
    result = PipelineResult(records=len(records))
    if not records:
        return result
    hot_pending = settings.TELEMETRY_HOT_STORAGE_ENABLED
    archive_pending = settings.TELEMETRY_ARCHIVE_ENABLED
    failures = []
    if hot_pending:
        try:
            _retry(lambda: ClickHouseTelemetryStore().insert(records))
            result.hot_written = True
            hot_pending = False
        except Exception as exc:
            failures.append(f"hot: {exc}")
    if archive_pending:
        try:
            result.archive_key = _retry(lambda: _archive(records))
            archive_pending = False
        except Exception as exc:
            failures.append(f"archive: {exc}")
    if hot_pending or archive_pending:
        result.error = "; ".join(failures)[:2000]
        _spool(records, hot=hot_pending, archive=archive_pending, error=result.error)
        result.buffered = True
        logger.error("Telemetry batch buffered: %s", result.error)
    return result


def flush_buffer(*, limit: int = 100) -> dict:
    directory = Path(settings.TELEMETRY_BUFFER_DIR).resolve()
    completed = failed = 0
    if not directory.exists():
        return {"completed": 0, "failed": 0, "remaining": 0}
    for path in sorted(directory.glob("*.json"))[:limit]:
        payload = json.loads(path.read_text(encoding="utf-8"))
        records = payload["records"]
        hot_pending = bool(payload["hot"])
        archive_pending = bool(payload["archive"])
        try:
            if hot_pending and settings.TELEMETRY_HOT_STORAGE_ENABLED:
                _retry(lambda rows=records: ClickHouseTelemetryStore().insert(rows))
                hot_pending = False
            if archive_pending and settings.TELEMETRY_ARCHIVE_ENABLED:
                _retry(lambda rows=records: _archive(rows))
                archive_pending = False
            if hot_pending or archive_pending:
                payload.update(hot=hot_pending, archive=archive_pending)
                path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
            else:
                path.unlink()
                completed += 1
        except Exception as exc:
            failed += 1
            logger.error("Buffered telemetry retry failed for %s: %s", path.name, exc)
    return {
        "completed": completed,
        "failed": failed,
        "remaining": len(list(directory.glob("*.json"))),
    }


def pipeline_status() -> dict:
    directory = Path(settings.TELEMETRY_BUFFER_DIR).resolve()
    files = list(directory.glob("*.json")) if directory.exists() else []
    size = sum(path.stat().st_size for path in files)
    return {
        "ingestionEnabled": settings.STREAM_INGESTION_ENABLED,
        "hotStorageEnabled": settings.TELEMETRY_HOT_STORAGE_ENABLED,
        "archiveEnabled": settings.TELEMETRY_ARCHIVE_ENABLED,
        "mlDatasetsEnabled": settings.ML_DATASETS_ENABLED,
        "storageBackend": settings.TELEMETRY_STORAGE_BACKEND,
        "bufferedBatches": len(files),
        "bufferedBytes": size,
    }
