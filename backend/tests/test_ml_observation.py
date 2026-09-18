import hashlib
import io
import json
import uuid
import zipfile
from datetime import timedelta

import pytest
from apps.ml.engine import feature_fields, field_contract, observe
from apps.ml.models import FeatureSnapshot, MachineCycle, ObservationConfig, ProductionProfile
from apps.spatial.models import FactoryLayout, MachineParameter, SpatialMachine
from apps.streams.models import MachineTelemetrySample
from apps.tenancy.models import FactoryMaster
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

pytestmark = pytest.mark.django_db


class FailurePipeline:
    def predict_proba(self, rows):
        return [[0.1, 0.9] for _ in rows]


@pytest.fixture
def setup_ml(tenant, factory):
    layout = FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=100, floor_height=100
    )
    machine = SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        code="test-machine",
        name="ML test",
        position_x=1,
        position_y=1,
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


def install_model(tmp_path, machine, profile, version, *, stage="production", checksum=None):
    import joblib
    from django.utils.text import slugify

    model_dir = tmp_path.joinpath(
        slugify(machine.tenant.slug),
        slugify(machine.layout.factory.code),
        slugify(machine.code),
        slugify(profile.sku.code),
        "quality-risk",
        f"v{version}",
    )
    model_dir.mkdir(parents=True)
    artifact = model_dir / "model.joblib"
    joblib.dump(FailurePipeline(), artifact)
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    manifest = {
        "schema_version": 1,
        "name": "quality-risk",
        "version": version,
        "runtime": "sklearn-joblib",
        "stage": stage,
        "machine": {
            "tenant": machine.tenant.slug,
            "factory": machine.layout.factory.code,
            "code": machine.code,
        },
        "profile": {
            "sku": profile.sku.code,
            "version": profile.version,
            "contract": profile.contract,
            "checkpoint_phase": profile.checkpoint_phase,
            "checkpoint_second": profile.checkpoint_second,
        },
        "artifact": artifact.name,
        "sha256": checksum or digest,
        "threshold": 0.7,
        "metrics": {"balanced_accuracy": 0.91},
    }
    (model_dir / "manifest.json").write_text(json.dumps(manifest))


def test_registry_versions_selects_latest_production_model_and_predicts(
    setup_ml, settings, tmp_path
):
    from apps.ml.models import PredictionModel
    from apps.ml.registry import sync_models

    machine, profile, _ = setup_ml
    settings.ML_MODEL_SOURCE = "local"
    settings.ML_MODEL_DIR = str(tmp_path)
    install_model(tmp_path, machine, profile, "1.2.0")
    install_model(tmp_path, machine, profile, "1.10.0")

    assert sync_models() == {"discovered": 2, "active": 1}
    assert list(PredictionModel.objects.order_by("version").values_list("version", "active")) == [
        ("1.10.0", True),
        ("1.2.0", False),
    ]

    event = sample(machine, 999, cycle="unseen", value=650)
    observe(event)
    prediction = FeatureSnapshot.objects.get(event_id=event.event_id)
    assert prediction.model.version == "1.10.0"
    assert prediction.predicted_label == "failure"


def test_registry_rejects_artifact_checksum_mismatch(setup_ml, settings, tmp_path):
    from apps.ml.registry import sync_models

    machine, profile, _ = setup_ml
    settings.ML_MODEL_SOURCE = "local"
    settings.ML_MODEL_DIR = str(tmp_path)
    install_model(tmp_path, machine, profile, "2.0.0", checksum="0" * 64)

    with pytest.raises(ValueError, match="Checksum mismatch"):
        sync_models()


def model_zip():
    import joblib

    artifact = io.BytesIO()
    joblib.dump(FailurePipeline(), artifact)
    package = io.BytesIO()
    with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("export/model.joblib", artifact.getvalue())
    return SimpleUploadedFile("quality-risk.zip", package.getvalue(), "application/zip")


def test_admin_upload_installs_canonical_production_package(setup_ml, settings, tmp_path):
    from apps.ml.uploads import install_uploaded_model

    machine, profile, _ = setup_ml
    settings.ML_MODEL_SOURCE = "local"
    settings.ML_MODEL_DIR = str(tmp_path)
    model = install_uploaded_model(
        profile=profile,
        name="quality-risk",
        version="3.1.0",
        stage="production",
        threshold=0.65,
        metrics={"balanced_accuracy": 0.92},
        upload=model_zip(),
    )

    expected = tmp_path / "vulcan" / "pnq-01" / "test-machine" / "t1"
    expected = expected / "quality-risk" / "v3.1.0"
    manifest = json.loads((expected / "manifest.json").read_text())
    assert (expected / "model.joblib").is_file()
    assert manifest["machine"] == {
        "tenant": machine.tenant.slug,
        "factory": machine.layout.factory.code,
        "code": machine.code,
    }
    assert manifest["profile"]["contract"] == profile.contract
    assert manifest["sha256"] == model.checksum
    assert model.active is True


def test_admin_upload_rejects_duplicate_immutable_version(setup_ml, settings, tmp_path):
    from apps.ml.uploads import install_uploaded_model

    _, profile, _ = setup_ml
    settings.ML_MODEL_SOURCE = "local"
    settings.ML_MODEL_DIR = str(tmp_path)
    arguments = {
        "profile": profile,
        "name": "quality-risk",
        "version": "1.0.0",
        "stage": "available",
        "threshold": 0.5,
        "metrics": {},
    }
    install_uploaded_model(**arguments, upload=model_zip())
    with pytest.raises(ValueError, match="already exists"):
        install_uploaded_model(**arguments, upload=model_zip())


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
