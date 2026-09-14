import uuid
from datetime import timedelta

import pytest
from apps.ml.engine import feature_fields, field_contract, observe
from apps.ml.models import FeatureSnapshot, MachineCycle, ObservationConfig, ProductionProfile
from apps.spatial.models import FactoryLayout, MachineParameter, SpatialMachine
from apps.streams.models import MachineTelemetrySample
from apps.tenancy.models import FactoryMaster
from django.utils import timezone

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup_ml(tenant, factory):
    layout = FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=100, floor_height=100
    )
    machine = SpatialMachine.objects.create(
        tenant=tenant, layout=layout, name="ML test", position_x=1, position_y=1
    )
    sku = FactoryMaster.objects.create(
        tenant=tenant, factory=factory, kind="skus", name="Tube", code="T1"
    )
    MachineParameter.objects.create(
        machine=machine, key="temperature", data_type="number", unit="C"
    )
    MachineParameter.objects.create(
        machine=machine, key="is_failure", data_type="boolean", semantic="quality_outcome"
    )
    fields = feature_fields(machine)
    profile = ProductionProfile.objects.create(
        tenant=tenant,
        machine=machine,
        sku=sku,
        version=1,
        fields=fields,
        contract=field_contract(fields),
        checkpoint_phase="cutting",
        checkpoint_second=2,
        ranges=[{"key": "temperature", "min": 590, "max": 610, "weight": 2, "phases": ["cutting"]}],
    )
    config = ObservationConfig.objects.create(
        tenant=tenant, machine=machine, enabled=True, active_profile=profile
    )
    return machine, profile, config


def sample(machine, sequence, phase="cutting", cycle="one", value=600):
    return MachineTelemetrySample.objects.create(
        tenant=machine.tenant,
        machine=machine,
        channel_external_id="test",
        schema_version="1",
        event_id=uuid.uuid4(),
        observed_at=timezone.now() + timedelta(seconds=sequence),
        sequence_no=sequence,
        run_id="run",
        cycle_id=cycle,
        cycle_phase=phase,
        values={"temperature": value, "is_failure": True},
    )


def test_health_prefixes_checkpoint_and_label_isolation(setup_ml):
    machine, _, _ = setup_ml
    first = sample(machine, 1)
    observe(first)
    frozen = FeatureSnapshot.objects.get(event_id=first.event_id).features
    observe(sample(machine, 2, value=650))
    observe(sample(machine, 3, phase="release", value=0))
    cycle = MachineCycle.objects.get(machine=machine)
    assert cycle.health == 50
    assert cycle.snapshots.filter(checkpoint=True).count() == 1
    forbidden = [
        "is_failure",
        "outcome",
        "run_id",
        "cycle_id",
        "event_id",
        "observed_at",
        "received_at",
        "cycle_health",
        "failure_within_5_cycles",
    ]
    assert all(term not in key for key in frozen for term in forbidden)
    assert FeatureSnapshot.objects.get(event_id=first.event_id).features == frozen
    observe(first)
    assert cycle.snapshots.count() == 3


def test_disabled_and_next_cycle_activation(setup_ml):
    machine, profile, config = setup_ml
    observe(sample(machine, 1))
    other = ProductionProfile.objects.create(
        tenant=machine.tenant,
        machine=machine,
        sku=profile.sku,
        version=2,
        ranges=profile.ranges,
        fields=profile.fields,
        contract=profile.contract,
        checkpoint_phase="cutting",
        checkpoint_second=2,
    )
    config.pending_profile = other
    config.save()
    observe(sample(machine, 2))
    assert MachineCycle.objects.get(cycle_id="one").profile == profile
    observe(sample(machine, 3, cycle="two"))
    assert MachineCycle.objects.get(cycle_id="two").profile == other
    config.refresh_from_db()
    config.enabled = False
    config.save()
    observe(sample(machine, 4, cycle="three"))
    assert not FeatureSnapshot.objects.filter(cycle__cycle_id="three").exists()


def test_schema_change_pauses_features(setup_ml):
    machine, _, config = setup_ml
    MachineParameter.objects.filter(machine=machine, key="temperature").update(unit="F")
    observe(sample(machine, 1))
    config.refresh_from_db()
    assert config.stale_reason
    assert not FeatureSnapshot.objects.exists()


def test_successful_observation_clears_transient_database_lock(setup_ml):
    machine, _, config = setup_ml
    config.stale_reason = "database is locked"
    config.save(update_fields=["stale_reason"])

    observe(sample(machine, 1))

    config.refresh_from_db()
    assert config.stale_reason == ""


def test_configuration_validates_and_scopes_sku(api_client, setup_ml):
    machine, profile, _ = setup_ml
    response = api_client.get(f"/api/ml/machines/{machine.id}/")
    assert response.status_code == 200
    assert response.data["machine"]["id"] == str(machine.id)
    assert response.data["machine"]["name"] == "ML test"
    assert response.data["machine"]["factory"]["id"] == str(machine.layout.factory_id)
    assert response.data["input_stream"] is None
    response = api_client.post(
        f"/api/ml/machines/{machine.id}/profiles/",
        {
            "sku": str(profile.sku_id),
            "ranges": [
                {"key": "temperature", "min": 20, "max": 10, "weight": 1, "phases": ["cutting"]}
            ],
            "checkpoint_phase": "cutting",
            "checkpoint_second": 2,
        },
        format="json",
    )
    assert response.status_code == 400


def test_training_validation_artifact_and_live_inference(setup_ml, monkeypatch):
    import io

    from apps.ml.models import TrainingRun
    from apps.ml.training import load_artifact, train
    from apps.streams.models import MachineCycleOutcome

    machine, profile, _ = setup_ml
    artifacts = {}

    class Storage:
        bucket = "private-test"

        def __init__(self):
            self.client = self

        def put_object(self, **kwargs):
            artifacts[kwargs["Key"]] = kwargs["Body"]

        def get_object(self, **kwargs):
            return {"Body": io.BytesIO(artifacts[kwargs["Key"]])}

    monkeypatch.setattr("apps.ml.training.ObjectStorage", Storage)
    cycles, snapshots, outcomes = [], [], []
    for i in range(240):
        bad = i % 2 == 0
        cycle = MachineCycle(
            tenant=machine.tenant,
            machine=machine,
            profile=profile,
            run_id=f"run-{i // 80}",
            cycle_id=str(i),
            completed=True,
            started_at=timezone.now() + timedelta(seconds=i),
        )
        cycles.append(cycle)
        for j in range(2):
            snapshots.append(
                FeatureSnapshot(
                    tenant=machine.tenant,
                    cycle=cycle,
                    event_id=uuid.uuid4(),
                    sequence_no=i * 2 + j,
                    observed_at=cycle.started_at,
                    checkpoint=j == 1,
                    features={
                        "field:temperature:phase:cutting:latest": 650 if bad else 600,
                        "context:phase": "cutting",
                        "context:elapsed": j + 1,
                    },
                )
            )
        outcomes.append(
            MachineCycleOutcome(
                tenant=machine.tenant,
                machine=machine,
                run_id=cycle.run_id,
                cycle_id=cycle.cycle_id,
                source_label="failure" if bad else "good",
                effective_label="failure" if bad else "good",
            )
        )
    MachineCycle.objects.bulk_create(cycles)
    FeatureSnapshot.objects.bulk_create(snapshots)
    MachineCycleOutcome.objects.bulk_create(outcomes)
    run = TrainingRun.objects.create(tenant=machine.tenant, profile=profile)
    train(run.id)
    run.refresh_from_db()
    assert run.status == "candidate", run.error
    assert run.metrics["balanced_accuracy"] >= 0.70
    assert run.metrics["split_strategy"] == "run_isolated"
    partitions = {}
    for row in run.dataset:
        assert row["cycle"] not in partitions
        partitions[row["cycle"]] = row["partition"]
    assert load_artifact(run) is not None
    run.active = True
    run.save()
    event = sample(machine, 999, cycle="unseen", value=650)
    observe(event)
    prediction = FeatureSnapshot.objects.get(event_id=event.event_id)
    assert prediction.model == run
    assert prediction.predicted_label == "failure"


def test_local_model_artifact_round_trip(settings, tmp_path, monkeypatch):
    from apps.ml.training import _read_artifact, _store_artifact

    settings.ML_ARTIFACT_DIR = str(tmp_path)
    monkeypatch.setattr(
        "apps.ml.training.ObjectStorage",
        lambda: type("Storage", (), {"client": None})(),
    )

    key = _store_artifact("ml/tenant/run/model.joblib", b"private model")

    assert key == "local:ml/tenant/run/model.joblib"
    assert _read_artifact(key) == b"private model"
    assert (tmp_path / "ml/tenant/run/model.joblib").stat().st_mode & 0o777 == 0o600


def test_split_cycles_stratifies_when_run_groups_have_one_class():
    from types import SimpleNamespace

    from apps.ml.training import split_cycles

    def row(run_id, label, index):
        return (
            SimpleNamespace(run_id=run_id, id=f"{run_id}-{index}"),
            SimpleNamespace(effective_label=label),
            [],
        )

    rows = [row("small-start", "good", index) for index in range(6)]
    rows += [row("main", "good", index) for index in range(257)]
    rows += [row("main", "failure", index) for index in range(31)]
    rows += [row("small-end", "good", index) for index in range(17)]

    partitions = split_cycles(rows)

    assert [len(partition) for partition in partitions] == [187, 62, 62]
    for partition in partitions:
        labels = [outcome.effective_label for _, outcome, _ in partition]
        assert labels.count("good") >= 5
        assert labels.count("failure") >= 5
    assert split_cycles(rows) == partitions


def test_training_action_saves_selected_cycle_range(api_client, setup_ml, monkeypatch):
    from apps.ml.models import TrainingRun

    machine, profile, _ = setup_ml
    monkeypatch.setattr("apps.ml.training.labeled_cycles", lambda selected: [None] * 300)
    monkeypatch.setattr("apps.ml.training.rows_eligibility", lambda rows: True)

    response = api_client.post(
        f"/api/ml/machines/{machine.id}/train/", {"cycle_limit": 200}, format="json"
    )

    assert response.status_code == 200
    run = TrainingRun.objects.get(profile=profile)
    assert run.metrics["requested_cycle_limit"] == 200


def test_delayed_quality_channel_keeps_human_override(setup_ml, user, monkeypatch, factory):
    from apps.ml.models import OutcomeBinding, OutcomeReceipt
    from apps.ml.worker import poll_outcomes
    from apps.streams.models import DataInputStream, DataStreamChannel, MachineCycleOutcome

    machine, _, _ = setup_ml
    stream = DataInputStream.objects.create(
        tenant=machine.tenant, factory=factory, name="QC", base_url="https://qc.example"
    )
    channel = DataStreamChannel.objects.create(
        tenant=machine.tenant,
        stream=stream,
        external_id="qc",
        name="QC",
        schema={
            "fields": [
                {
                    "key": "quality",
                    "semantic": "quality_outcome",
                    "data_type": "selection",
                    "options": ["good", "failure"],
                }
            ]
        },
    )
    binding = OutcomeBinding.objects.create(tenant=machine.tenant, machine=machine, channel=channel)
    outcome = MachineCycleOutcome.objects.create(
        tenant=machine.tenant,
        machine=machine,
        run_id="r",
        cycle_id="c",
        source_label="good",
        effective_label="good",
        overridden_by=user,
        overridden_at=timezone.now(),
    )
    quality_event_id = uuid.uuid4()
    monkeypatch.setattr(
        "apps.ml.worker.request_json",
        lambda *a, **kw: {
            "readings": [
                {
                    "event_id": str(quality_event_id),
                    "observed_at": timezone.now().isoformat(),
                    "run_id": "r",
                    "cycle_id": "c",
                    "values": {"quality": "failure"},
                }
            ],
            "next_cursor": "1",
        },
    )
    poll_outcomes(binding)
    poll_outcomes(binding)
    outcome.refresh_from_db()
    assert outcome.source_label == "failure"
    assert outcome.effective_label == "good"
    assert OutcomeReceipt.objects.filter(event_id=quality_event_id).count() == 1


def test_local_scheduler_supersedes_duplicate_requests(setup_ml, settings, monkeypatch):
    from apps.ml.models import TrainingRun
    from apps.ml.worker import schedule_training

    _, profile, config = setup_ml
    config.enabled = False  # Only exercise already-requested runs in this test.
    config.save(update_fields=["enabled"])
    older = TrainingRun.objects.create(tenant=profile.tenant, profile=profile, error="old")
    newer = TrainingRun.objects.create(tenant=profile.tenant, profile=profile, error="new")
    trained = []
    settings.CELERY_TASK_ALWAYS_EAGER = True
    monkeypatch.setattr("apps.ml.training.train", lambda run_id: trained.append(run_id))

    schedule_training()

    older.refresh_from_db()
    assert older.status == "superseded"
    assert older.error == ""
    assert trained == [newer.id]
