import uuid
from datetime import timedelta

import pytest
from apps.spatial.models import FactoryLayout, MachineCustomKpi, MachineParameter, SpatialMachine
from apps.streams.client import StreamClientError
from apps.streams.crypto import decrypt_secret, encrypt_secret
from apps.streams.models import (
    BindingStatus,
    DataInputStream,
    DataStreamChannel,
    DataStreamCredential,
    DataStreamSchemaVersion,
    MachineCycleOutcome,
    MachineStreamBinding,
    MachineTelemetrySample,
)
from apps.streams.services import (
    bind_machine,
    mark_poll_failure,
    poll_binding,
    refresh_binding_schema,
)
from django.db import IntegrityError, transaction
from django.utils import timezone

pytestmark = pytest.mark.django_db


def make_schema(version="1", *, unit="°C", data_type="number", latest_cursor="10"):
    return {
        "schema_version": version,
        "latest_cursor": latest_cursor,
        "fields": [
            {
                "id": "temperature-current",
                "key": "temperature_current_c",
                "label": "Temperature Current",
                "data_type": data_type,
                "unit": unit,
                "semantic": "actual",
                "required": True,
                "order": 0,
            },
            {
                "id": "phase",
                "key": "cycle_phase",
                "label": "Cycle phase",
                "data_type": "text",
                "unit": "",
                "semantic": "context",
                "required": True,
                "order": 1,
            },
        ],
    }


@pytest.fixture
def layout(tenant, factory):
    return FactoryLayout.objects.create(
        tenant=tenant,
        factory=factory,
        floor_width=100,
        floor_height=50,
    )


@pytest.fixture
def machine(tenant, layout):
    return SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Splicer A",
        position_x=1,
        position_y=1,
    )


@pytest.fixture
def stream(tenant, factory):
    value = DataInputStream.objects.create(
        tenant=tenant,
        factory=factory,
        name="Simulator",
        base_url="http://simulator.test",
    )
    DataStreamCredential.objects.create(
        tenant=tenant,
        stream=value,
        encrypted_secret=encrypt_secret("top-secret-key"),
        key_hint="-key",
    )
    return value


@pytest.fixture
def channel(tenant, stream):
    schema = make_schema()
    return DataStreamChannel.objects.create(
        tenant=tenant,
        stream=stream,
        external_id="splicer-01",
        name="Splicer 01",
        schema_version="1",
        schema=schema,
        latest_cursor="10",
    )


def test_api_key_is_encrypted_and_never_serialized(api_client, factory):
    response = api_client.post(
        "/api/data-streams/",
        {
            "factory": str(factory.id),
            "name": "Gateway",
            "base_url": "https://gateway.example.com",
            "api_key": "plain-secret",
        },
        format="json",
    )

    assert response.status_code == 201, response.data
    assert "api_key" not in response.data
    stream = DataInputStream.objects.get(pk=response.data["id"])
    assert stream.credential.encrypted_secret != "plain-secret"
    assert decrypt_secret(stream.credential.encrypted_secret) == "plain-secret"

    listed = api_client.get(f"/api/data-streams/?factory={factory.id}")
    assert listed.status_code == 200
    result = listed.data.get("results", listed.data)[0]
    assert "api_key" not in result
    assert "encrypted_secret" not in result


def test_binding_replaces_manual_parameter_and_starts_at_current_cursor(machine, channel):
    MachineParameter.objects.create(
        machine=machine,
        key="temperature_current_c",
        data_type="text",
        origin="manual",
    )
    MachineCustomKpi.objects.create(
        machine=machine,
        name="Temperature KPI",
        display_unit="°C",
        formula={"operations": [{"operator": "add", "parameterKey": "temperature_current_c"}]},
    )

    binding = bind_machine(machine, channel)

    assert binding.cursor == "10"
    parameter = machine.parameters.get(key="temperature_current_c")
    assert parameter.origin == "stream"
    assert parameter.data_type == "number"
    assert parameter.source_schema_version == "1"
    assert not machine.custom_kpis.get().is_enabled

    binding.cursor = "15"
    binding.save(update_fields=["cursor"])
    assert bind_machine(machine, channel).cursor == "15"


def test_splicing_schema_initializes_all_fifteen_parameters(machine, channel):
    field_keys = [
        "temperature_set_c",
        "temperature_current_c",
        "knife_current_a",
        "knife_speed_set_mm_s",
        "knife_speed_actual_mm_s",
        "clamping_pressure_control_bar",
        "clamping_pressure_actual_bar",
        "butting_pressure_bar",
        "knife_production_count_present",
        "knife_production_count_set",
        "jaw_production_count_present",
        "jaw_production_count_set",
        "jaw_cycles_total",
        "butting_time_present_s",
        "butting_time_set_s",
    ]
    channel.schema = {
        "schema_version": "splicing.telemetry.v1",
        "latest_cursor": "0",
        "fields": [
            {
                "id": key,
                "key": key,
                "label": key.replace("_", " ").title(),
                "data_type": "number",
                "unit": "s" if key == "butting_time_set_s" else "",
                "semantic": "measurement",
                "required": True,
                "order": index,
            }
            for index, key in enumerate(field_keys)
        ],
    }
    channel.schema_version = channel.schema["schema_version"]
    channel.latest_cursor = channel.schema["latest_cursor"]
    channel.save()

    bind_machine(machine, channel)

    assert machine.parameters.filter(origin="stream", is_active=True).count() == 15
    assert machine.parameters.filter(key="butting_time_set_s", unit="s").exists()


def test_channel_can_only_be_bound_to_one_machine(tenant, layout, channel, machine):
    bind_machine(machine, channel)
    second = SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Splicer B",
        position_x=2,
        position_y=1,
    )

    with pytest.raises(StreamClientError, match="already assigned"):
        bind_machine(second, channel)

    with pytest.raises(IntegrityError), transaction.atomic():
        MachineStreamBinding.objects.create(tenant=tenant, machine=second, channel=channel)


def test_poll_commits_samples_and_cursor_idempotently(monkeypatch, machine, channel):
    binding = bind_machine(machine, channel)
    observed_at = timezone.now() - timedelta(seconds=1)
    event_id = uuid.uuid4()
    payload = {
        "schema_version": "1",
        "readings": [
            {
                "event_id": str(event_id),
                "observed_at": observed_at.isoformat(),
                "sequence_no": 11,
                "run_id": "run-1",
                "cycle_id": "cycle-1",
                "cycle_number": 1,
                "cycle_phase": "loading",
                "recipe_id": "standard",
                "outcome": {
                    "splice_result": "good",
                    "is_failure": 0,
                    "quality_score": 0.97,
                    "failure_mode": "none",
                    "sensor_data_quality": "valid",
                },
                "values": {"temperature_current_c": 598.2, "cycle_phase": "loading"},
            }
        ],
        "next_cursor": "11",
    }
    monkeypatch.setattr("apps.streams.services.request_json", lambda *args, **kwargs: payload)

    assert poll_binding(binding) == 1
    binding.refresh_from_db()
    assert binding.cursor == "11"
    assert (
        MachineTelemetrySample.objects.get(event_id=event_id).values["temperature_current_c"]
        == 598.2
    )

    assert poll_binding(binding) == 0
    assert MachineTelemetrySample.objects.filter(event_id=event_id).count() == 1
    outcome = MachineCycleOutcome.objects.get(machine=machine, cycle_id="cycle-1")
    assert outcome.source_label == "good"
    assert outcome.effective_label == "good"


def test_cycle_outcome_is_visible_and_can_be_human_verified(api_client, user, machine, stream):
    sample = MachineTelemetrySample.objects.create(
        tenant=machine.tenant,
        machine=machine,
        stream=stream,
        channel_external_id="splicer-01",
        schema_version="1",
        event_id=uuid.uuid4(),
        observed_at=timezone.now(),
        sequence_no=1,
        run_id="run-visible",
        cycle_id="cycle-visible",
        cycle_number=7,
        cycle_phase="release",
        recipe_id="standard",
        values={"temperature_current_c": 600},
    )
    outcome = MachineCycleOutcome.objects.create(
        tenant=machine.tenant,
        machine=machine,
        stream=stream,
        run_id=sample.run_id,
        cycle_id=sample.cycle_id,
        cycle_number=sample.cycle_number,
        source_label="good",
        effective_label="good",
        quality_score=0.98,
    )

    history = api_client.get(f"/api/data-streams/machines/{machine.id}/telemetry/")
    assert history.status_code == 200
    assert history.data["results"][0]["outcome"]["effective_label"] == "good"

    changed = api_client.patch(
        f"/api/data-streams/machines/{machine.id}/outcomes/{outcome.id}/",
        {"effective_label": "failure", "override_note": "Tube failed visual inspection"},
        format="json",
    )
    assert changed.status_code == 200, changed.data
    outcome.refresh_from_db()
    assert outcome.source_label == "good"
    assert outcome.effective_label == "failure"
    assert outcome.overridden_by == user
    assert outcome.overridden_at is not None


def test_cycle_history_paginates_complete_expandable_cycles(api_client, machine, stream):
    started_at = timezone.now() - timedelta(minutes=5)
    samples = []
    for cycle_number in range(3):
        cycle_id = f"run-page:{cycle_number}"
        for second in range(23):
            samples.append(
                MachineTelemetrySample(
                    tenant=machine.tenant,
                    machine=machine,
                    stream=stream,
                    channel_external_id="splicer-01",
                    schema_version="1",
                    event_id=uuid.uuid4(),
                    observed_at=started_at + timedelta(seconds=(cycle_number * 23) + second),
                    sequence_no=(cycle_number * 23) + second,
                    run_id="run-page",
                    cycle_id=cycle_id,
                    cycle_number=cycle_number,
                    cycle_phase="butting" if 7 <= second < 21 else "loading",
                    recipe_id="standard",
                    values={"temperature_current_c": 600 + cycle_number},
                )
            )
    MachineTelemetrySample.objects.bulk_create(samples)

    first = api_client.get(f"/api/data-streams/machines/{machine.id}/cycles/?limit=2")
    assert first.status_code == 200, first.data
    assert [row["cycle_number"] for row in first.data["results"]] == [2, 1]
    assert all(row["sample_count"] == 23 for row in first.data["results"])
    assert all(len(row["samples"]) == 23 for row in first.data["results"])
    assert first.data["next_cursor"]

    second = api_client.get(
        f"/api/data-streams/machines/{machine.id}/cycles/",
        {"limit": 2, "cursor": first.data["next_cursor"]},
    )
    assert second.status_code == 200, second.data
    assert [row["cycle_number"] for row in second.data["results"]] == [0]
    assert second.data["next_cursor"] is None


def test_assignment_fetches_current_cursor_and_rolls_back_on_source_error(
    monkeypatch, tenant, factory, layout, machine, channel
):
    current = make_schema(latest_cursor="25")
    monkeypatch.setattr("apps.streams.services.request_json", lambda *args, **kwargs: current)
    binding = bind_machine(machine, channel, refresh_source=True)
    assert binding.cursor == "25"

    other_stream = DataInputStream.objects.create(
        tenant=tenant,
        factory=factory,
        name="Other gateway",
        base_url="https://other.example.com",
    )
    DataStreamCredential.objects.create(
        tenant=tenant,
        stream=other_stream,
        encrypted_secret=encrypt_secret("other-key"),
        key_hint="-key",
    )
    other_channel = DataStreamChannel.objects.create(
        tenant=tenant,
        stream=other_stream,
        external_id="other",
        name="Other",
        schema_version="1",
        schema=make_schema(),
        latest_cursor="10",
    )

    def fail(*args, **kwargs):
        raise StreamClientError("source unavailable")

    monkeypatch.setattr("apps.streams.services.request_json", fail)
    with pytest.raises(StreamClientError, match="unavailable"):
        bind_machine(machine, other_channel, refresh_source=True)

    binding.refresh_from_db()
    assert binding.channel_id == channel.id
    assert binding.cursor == "25"


def test_out_of_order_batch_does_not_advance_cursor(monkeypatch, machine, channel):
    binding = bind_machine(machine, channel)
    observed_at = timezone.now().isoformat()
    payload = {
        "schema_version": "1",
        "next_cursor": "12",
        "readings": [
            {
                "event_id": str(uuid.uuid4()),
                "observed_at": observed_at,
                "sequence_no": 12,
                "values": {"temperature_current_c": 600, "cycle_phase": "loading"},
            },
            {
                "event_id": str(uuid.uuid4()),
                "observed_at": observed_at,
                "sequence_no": 11,
                "values": {"temperature_current_c": 601, "cycle_phase": "loading"},
            },
        ],
    }
    monkeypatch.setattr("apps.streams.services.request_json", lambda *args, **kwargs: payload)

    with pytest.raises(StreamClientError, match="out of sequence"):
        poll_binding(binding)
    binding.refresh_from_db()
    assert binding.cursor == "10"
    assert MachineTelemetrySample.objects.count() == 0


def test_replayed_sequence_does_not_block_cursor(monkeypatch, machine, channel):
    binding = bind_machine(machine, channel)
    observed_at = timezone.now().isoformat()
    first_id, replay_id, next_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    payload = {
        "schema_version": "1",
        "next_cursor": "13",
        "readings": [
            {
                "event_id": str(first_id),
                "observed_at": observed_at,
                "sequence_no": 11,
                "run_id": "run-1",
                "values": {"temperature_current_c": 600, "cycle_phase": "loading"},
            },
            {
                "event_id": str(replay_id),
                "observed_at": observed_at,
                "sequence_no": 11,
                "run_id": "run-1",
                "values": {"temperature_current_c": 601, "cycle_phase": "loading"},
            },
            {
                "event_id": str(next_id),
                "observed_at": observed_at,
                "sequence_no": 12,
                "run_id": "run-1",
                "values": {"temperature_current_c": 602, "cycle_phase": "loading"},
            },
        ],
    }
    monkeypatch.setattr("apps.streams.services.request_json", lambda *args, **kwargs: payload)

    assert poll_binding(binding) == 2
    binding.refresh_from_db()
    assert binding.cursor == "13"
    assert MachineTelemetrySample.objects.filter(event_id=first_id).exists()
    assert not MachineTelemetrySample.objects.filter(event_id=replay_id).exists()
    assert MachineTelemetrySample.objects.filter(event_id=next_id).exists()


def test_new_run_may_restart_its_sequence(monkeypatch, machine, channel):
    binding = bind_machine(machine, channel)
    old_event = MachineTelemetrySample.objects.create(
        tenant=machine.tenant,
        machine=machine,
        stream=channel.stream,
        channel_external_id=channel.external_id,
        schema_version="1",
        event_id=uuid.uuid4(),
        observed_at=timezone.now() - timedelta(days=1),
        sequence_no=215,
        run_id="old-run",
        values={"temperature_current_c": 600, "cycle_phase": "release"},
    )
    new_event_id = uuid.uuid4()
    payload = {
        "schema_version": "1",
        "next_cursor": "11",
        "readings": [
            {
                "event_id": str(new_event_id),
                "observed_at": timezone.now().isoformat(),
                "sequence_no": 0,
                "run_id": "new-run",
                "values": {"temperature_current_c": 599, "cycle_phase": "loading"},
            }
        ],
    }
    monkeypatch.setattr("apps.streams.services.request_json", lambda *args, **kwargs: payload)

    assert poll_binding(binding) == 1
    assert MachineTelemetrySample.objects.filter(pk=old_event.pk).exists()
    assert MachineTelemetrySample.objects.filter(event_id=new_event_id, run_id="new-run").exists()


def test_poll_failures_back_off_without_disabling_other_bindings(machine, channel):
    binding = bind_machine(machine, channel)
    before = timezone.now()
    mark_poll_failure(binding, StreamClientError("gateway timeout"))
    binding.refresh_from_db()
    assert binding.status == BindingStatus.DEGRADED
    assert binding.consecutive_failures == 1
    assert binding.next_poll_at >= before + timedelta(seconds=9)


def test_incompatible_schema_pauses_until_explicit_acceptance(monkeypatch, machine, channel):
    binding = bind_machine(machine, channel)
    MachineCustomKpi.objects.create(
        machine=machine,
        name="Temperature KPI",
        display_unit="°C",
        formula={"operations": [{"operator": "add", "parameterKey": "temperature_current_c"}]},
    )
    changed = make_schema("2", unit="°F", latest_cursor="20")
    monkeypatch.setattr("apps.streams.services.request_json", lambda *args, **kwargs: changed)

    refresh_binding_schema(binding)
    binding.refresh_from_db()
    channel.refresh_from_db()
    assert binding.status == BindingStatus.SCHEMA_REVIEW
    assert channel.schema_version == "1"
    assert DataStreamSchemaVersion.objects.filter(channel=channel, version="2").exists()

    refresh_binding_schema(binding, accept_incompatible=True)
    binding.refresh_from_db()
    channel.refresh_from_db()
    assert binding.status == BindingStatus.ACTIVE
    assert channel.schema_version == "2"
    assert binding.cursor == "10"
    assert machine.parameters.get(key="temperature_current_c").unit == "°F"
    assert not machine.custom_kpis.get().is_enabled


def test_compatible_schema_adds_and_archives_fields(monkeypatch, machine, channel):
    binding = bind_machine(machine, channel)
    changed = make_schema("2", latest_cursor="20")
    changed["fields"] = [
        changed["fields"][0],
        {
            "id": "clamp-pressure",
            "key": "clamping_pressure_actual_bar",
            "label": "Clamping pressure actual",
            "data_type": "number",
            "unit": "bar",
            "semantic": "actual",
            "required": True,
            "order": 1,
        },
    ]
    monkeypatch.setattr("apps.streams.services.request_json", lambda *args, **kwargs: changed)

    refresh_binding_schema(binding)

    assert not machine.parameters.get(key="cycle_phase").is_active
    added = machine.parameters.get(key="clamping_pressure_actual_bar")
    assert added.is_active
    assert added.origin == "stream"
    binding.refresh_from_db()
    assert binding.status == BindingStatus.ACTIVE
    assert binding.cursor == "10"
