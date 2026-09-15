from pathlib import Path

import pytest
from apps.audit.models import AuditEvent
from apps.spatial.models import SpatialMachine
from apps.tenancy.models import FactoryMaster, Role
from django.core.files.uploadedfile import SimpleUploadedFile

pytestmark = pytest.mark.django_db

REFERENCE = (
    Path(__file__).resolve().parents[2]
    / "test-data"
    / "infinexxgen-chakan"
    / "factory_master_reference.csv"
)
INSPECT_URL = "/api/factory-masters/import/inspect/"
APPLY_URL = "/api/factory-masters/import/apply/"


def upload(content=None, name="factory_master_reference.csv"):
    return SimpleUploadedFile(
        name,
        REFERENCE.read_bytes() if content is None else content,
        content_type="text/csv",
    )


def test_reference_csv_can_be_previewed_without_writing(api_client, factory):
    response = api_client.post(
        INSPECT_URL,
        {"factory": str(factory.id), "file": upload()},
        format="multipart",
    )

    assert response.status_code == 200
    assert response.data["canApply"] is True
    assert response.data["totalRows"] == 83
    assert response.data["importableRows"] == 81
    assert response.data["actions"] == {
        "create": 81,
        "update": 0,
        "reactivate": 0,
        "unchanged": 0,
    }
    assert response.data["counts"] == {
        "lines": 2,
        "machines": 12,
        "materials": 14,
        "processes": 11,
        "reasonCodes": 16,
        "shifts": 2,
        "skus": 12,
        "suppliers": 12,
    }
    assert len(response.data["contextRows"]) == 2
    assert any(item["severity"] == "warning" for item in response.data["issues"])
    assert FactoryMaster.objects.filter(factory=factory).count() == 0


def test_apply_is_atomic_hierarchical_audited_and_idempotent(api_client, factory):
    preview = api_client.post(
        INSPECT_URL,
        {"factory": str(factory.id), "file": upload()},
        format="multipart",
    )
    response = api_client.post(
        APPLY_URL,
        {
            "factory": str(factory.id),
            "expectedChecksum": preview.data["checksum"],
            "file": upload(),
        },
        format="multipart",
    )

    assert response.status_code == 200
    assert response.data["appliedTotal"] == 81
    assert response.data["applied"]["create"] == 81
    assert FactoryMaster.objects.filter(factory=factory, is_active=True).count() == 69

    process = FactoryMaster.objects.get(factory=factory, code="L2-OWLD")
    machine = FactoryMaster.objects.get(factory=factory, code="OWM-01")
    assert process.parent.code == "LINE-02"
    assert process.metadata["sequence"] == 3
    assert process.metadata["source"] == "factory-master-csv"
    assert machine.parent.code == "LINE-02"
    assert machine.metadata["processCode"] == "L2-OWLD"
    assert machine.is_active is False
    canonical = SpatialMachine.objects.get(id=machine.metadata["canonicalMachineId"])
    assert canonical.code == "OWM-01"
    assert canonical.process == process
    assert AuditEvent.objects.filter(
        event_type="factory_masters.imported", entity_id=str(factory.id)
    ).exists()

    second_preview = api_client.post(
        INSPECT_URL,
        {"factory": str(factory.id), "file": upload()},
        format="multipart",
    )
    assert second_preview.data["actions"]["unchanged"] == 81
    reapplied = api_client.post(
        APPLY_URL,
        {
            "factory": str(factory.id),
            "expectedChecksum": second_preview.data["checksum"],
            "file": upload(),
        },
        format="multipart",
    )
    assert reapplied.status_code == 200
    assert reapplied.data["applied"]["unchanged"] == 81
    assert FactoryMaster.objects.filter(factory=factory).count() == 81


def test_invalid_hierarchy_is_rejected_without_partial_writes(api_client, factory):
    content = "\n".join(
        [
            "entity_type,code,name,parent_code,uom,metadata_json,notes",
            "line,LINE-01,Line One,FACTORY,unit,{},Synthetic line",
            "process,PROC-01,First Process,LINE-01,unit,"
            '"{""sequence"":1,""inputUnit"":""kg"",""outputUnit"":""unit""}",First',
            "process,PROC-02,Duplicate Sequence,LINE-01,unit,"
            '"{""sequence"":1,""inputUnit"":""kg"",""outputUnit"":""unit""}",Second',
            'machine,MC-01,Wrong Machine,LINE-01,,"{""processCode"":""MISSING""}",Machine',
            "",
        ]
    ).encode()
    preview = api_client.post(
        INSPECT_URL,
        {"factory": str(factory.id), "file": upload(content)},
        format="multipart",
    )

    assert preview.status_code == 200
    assert preview.data["canApply"] is False
    messages = " ".join(item["message"] for item in preview.data["issues"])
    assert "duplicated" in messages
    assert "MISSING" in messages

    applied = api_client.post(
        APPLY_URL,
        {
            "factory": str(factory.id),
            "expectedChecksum": preview.data["checksum"],
            "file": upload(content),
        },
        format="multipart",
    )
    assert applied.status_code == 400
    assert FactoryMaster.objects.filter(factory=factory).count() == 0


def test_apply_rejects_a_file_changed_after_preview(api_client, factory):
    preview = api_client.post(
        INSPECT_URL,
        {"factory": str(factory.id), "file": upload()},
        format="multipart",
    )
    changed = REFERENCE.read_bytes().replace(b"LINE-01", b"LINE-X1", 1)

    response = api_client.post(
        APPLY_URL,
        {
            "factory": str(factory.id),
            "expectedChecksum": preview.data["checksum"],
            "file": upload(changed),
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert "changed after preview" in response.data["detail"]
    assert FactoryMaster.objects.filter(factory=factory).count() == 0


def test_executive_cannot_preview_or_apply_factory_masters(api_client, membership, factory):
    membership.role = Role.EXECUTIVE
    membership.save(update_fields=["role"])

    preview = api_client.post(
        INSPECT_URL,
        {"factory": str(factory.id), "file": upload()},
        format="multipart",
    )
    applied = api_client.post(
        APPLY_URL,
        {"factory": str(factory.id), "file": upload()},
        format="multipart",
    )

    assert preview.status_code == 403
    assert applied.status_code == 403
    assert FactoryMaster.objects.filter(factory=factory).count() == 0
