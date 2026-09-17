import json
import uuid

import duckdb
import pytest
from apps.spatial.models import FactoryLayout, SpatialMachine
from apps.streams.clickhouse import ClickHouseTelemetryStore
from apps.streams.client import StreamClientError
from apps.streams.datasets import generate_training_datasets
from apps.streams.models import DataInputStream, MachineTelemetrySample
from apps.streams.pipeline import flush_buffer, ingest_samples
from apps.streams.services import discover_stream
from apps.streams.storage import FileSystemStorage, TenantStorage
from django.test import override_settings
from django.utils import timezone

pytestmark = pytest.mark.django_db


@pytest.fixture
def machine(tenant, factory):
    layout = FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=20, floor_height=20
    )
    return SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Press One",
        code="PRESS-01",
        position_x=1,
        position_y=1,
        metadata={"family": "Hydraulic presses"},
    )


@pytest.fixture
def sample(tenant, machine):
    return MachineTelemetrySample.objects.create(
        tenant=tenant,
        machine=machine,
        channel_external_id="press-01",
        schema_version="1",
        event_id=uuid.uuid4(),
        observed_at=timezone.now(),
        sequence_no=1,
        run_id="run-1",
        cycle_id="cycle-1",
        cycle_number=1,
        values={"pressure_bar": 42.5, "active": True},
    )


def test_tenant_storage_rejects_traversal_and_scopes_keys(tmp_path):
    storage = TenantStorage(FileSystemStorage(tmp_path), "tenant-a")
    storage.put("raw/a.json", b"{}", content_type="application/json")

    assert storage.get("raw/a.json") == b"{}"
    assert storage.list() == ["raw/a.json"]
    with pytest.raises(ValueError):
        storage.put("../tenant-b/a.json", b"{}", content_type="application/json")
    with pytest.raises(ValueError):
        storage.put("/absolute.json", b"{}", content_type="application/json")


def test_archive_stage_writes_queryable_zstd_parquet(tmp_path, sample):
    root = tmp_path / "storage"
    with override_settings(
        TELEMETRY_ARCHIVE_ENABLED=True,
        TELEMETRY_HOT_STORAGE_ENABLED=False,
        TELEMETRY_STORAGE_BACKEND="filesystem",
        TELEMETRY_STORAGE_ROOT=str(root),
    ):
        result = ingest_samples([sample])

    path = root / "tenants" / str(sample.tenant_id) / result.archive_key
    row = duckdb.connect().execute(
        "SELECT machine_id, values_json FROM read_parquet(?)", [str(path)]
    ).fetchone()
    assert result.buffered is False
    assert str(row[0]) == str(sample.machine_id)
    assert json.loads(row[1]) == sample.values


def test_hot_storage_failure_is_buffered_until_stage_is_available(
    tmp_path, sample, monkeypatch
):
    buffer_dir = tmp_path / "buffer"
    monkeypatch.setattr(
        "apps.streams.pipeline.ClickHouseTelemetryStore.insert",
        lambda *_: (_ for _ in ()).throw(RuntimeError("clickhouse unavailable")),
    )
    with override_settings(
        TELEMETRY_HOT_STORAGE_ENABLED=True,
        TELEMETRY_ARCHIVE_ENABLED=False,
        TELEMETRY_BUFFER_DIR=str(buffer_dir),
        TELEMETRY_PIPELINE_RETRIES=0,
    ):
        result = ingest_samples([sample])
    assert result.buffered is True
    assert len(list(buffer_dir.glob("*.json"))) == 1

    # Turning a stage off pauses delivery; it must not discard its buffer.
    with override_settings(
        TELEMETRY_HOT_STORAGE_ENABLED=False,
        TELEMETRY_ARCHIVE_ENABLED=False,
        TELEMETRY_BUFFER_DIR=str(buffer_dir),
    ):
        status = flush_buffer()
    assert status["remaining"] == 1


def test_clickhouse_schema_has_partition_codec_ttl_and_aggregate(monkeypatch):
    queries = []
    monkeypatch.setattr(
        ClickHouseTelemetryStore,
        "_request",
        lambda self, query, body=b"": queries.append(query) or b"",
    )
    with override_settings(CLICKHOUSE_RETENTION_DAYS=45):
        ClickHouseTelemetryStore().initialize()
    ddl = "\n".join(queries)
    assert "PARTITION BY toYYYYMM(observed_at)" in ddl
    assert "CODEC(Delta, ZSTD(3))" in ddl
    assert "INTERVAL 45 DAY DELETE" in ddl
    assert "CREATE MATERIALIZED VIEW" in ddl
    assert "machine_telemetry_1m" in ddl


def test_clickhouse_machine_query_always_contains_tenant_predicate(monkeypatch):
    tenant_id = uuid.uuid4()
    machine_id = uuid.uuid4()
    queries = []
    row = {
        "id": str(uuid.uuid4()),
        "event_id": str(uuid.uuid4()),
        "run_id": "run",
        "cycle_id": "cycle",
        "values_json": '{"temperature":42}',
    }
    monkeypatch.setattr(
        ClickHouseTelemetryStore,
        "_request",
        lambda self, query, body=b"": queries.append(query) or (json.dumps(row) + "\n").encode(),
    )
    result = ClickHouseTelemetryStore().latest_for_machine(
        tenant_id=tenant_id, machine_id=machine_id, limit=10
    )
    assert f"tenant_id = toUUID('{tenant_id}')" in queries[0]
    assert f"machine_id = toUUID('{machine_id}')" in queries[0]
    assert result[0]["values"] == {"temperature": 42}


def test_simulated_sources_are_rejected_when_disabled(factory, tenant, monkeypatch):
    stream = DataInputStream.objects.create(
        tenant=tenant,
        factory=factory,
        name="External simulator",
        base_url="http://simulator.test",
    )
    monkeypatch.setattr(
        "apps.streams.services.request_json",
        lambda *args, **kwargs: {"protocol": "http-pull-v1", "simulated": True},
    )
    with (
        override_settings(TELEMETRY_ALLOW_SIMULATED_INPUTS=False),
        pytest.raises(StreamClientError, match="disabled"),
    ):
        discover_stream(stream)


@pytest.mark.parametrize("level", ["machine", "machine-family", "line"])
def test_training_dataset_generation_is_versioned_and_tenant_scoped(
    tmp_path, tenant, factory, sample, level
):
    with override_settings(
        TELEMETRY_STORAGE_BACKEND="filesystem",
        TELEMETRY_STORAGE_ROOT=str(tmp_path),
    ):
        generated = generate_training_datasets(
            tenant=tenant, factory=factory, level=level, version="1.2.0"
        )

    assert len(generated) == 1
    item = generated[0]
    assert f"datasets/{factory.code.lower()}/{level}/" in item["data_key"]
    assert "/v1.2.0/data.parquet" in item["data_key"]
    root = tmp_path / "tenants" / str(tenant.id)
    manifest = json.loads((root / item["manifest_key"]).read_text())
    assert manifest["tenant"] == tenant.slug
    assert manifest["rows"] == 1
    assert manifest["features"] == ["feature__active", "feature__pressure_bar"]
    assert (root / item["data_key"]).read_bytes().startswith(b"PAR1")
