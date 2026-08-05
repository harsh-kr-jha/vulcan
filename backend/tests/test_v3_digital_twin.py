from datetime import date, timedelta

import pytest
from apps.operations.models import StandardRecord, Upload
from apps.tenancy.models import Factory, FactoryMaster, Membership, Role
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command

pytestmark = pytest.mark.django_db


def create_master(api_client, factory_id, kind, name, code, **extra):
    return api_client.post(
        f"/api/factory-masters/?factory={factory_id}",
        {"factory": factory_id, "kind": kind, "name": name, "code": code, **extra},
        format="json",
    )


def test_factory_details_are_unit_aware_and_validated(api_client):
    details = {
        "factoryType": "Rubber products plant",
        "facilityAreaM2": 18_500,
        "ratedCapacityPerDay": 18_000,
        "productionUnit": "tubes",
        "operatingHoursPerDay": 24,
        "shiftsPerDay": 3,
        "powerCapacityKva": 2_500,
        "energyUnit": "kWh",
        "weightUnit": "kg",
        "temperatureUnit": "°C",
        "pressureUnit": "bar",
        "commissionedYear": 1998,
    }
    response = api_client.post(
        "/api/factories/",
        {
            "name": "Unit-aware factory",
            "code": "UNIT-01",
            "location": "Mysuru",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
            "details": details,
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["details"] == details

    invalid_hours = api_client.patch(
        f"/api/factories/{response.data['id']}/",
        {"details": {"operatingHoursPerDay": 25}},
        format="json",
    )
    invalid_unit = api_client.patch(
        f"/api/factories/{response.data['id']}/",
        {"details": {"pressureUnit": "atmospheres"}},
        format="json",
    )
    unknown_detail = api_client.patch(
        f"/api/factories/{response.data['id']}/",
        {"details": {"mysteryValue": 10}},
        format="json",
    )

    assert invalid_hours.status_code == 400
    assert invalid_unit.status_code == 400
    assert unknown_detail.status_code == 400


def test_processes_require_an_ordered_line_parent(api_client):
    factory_id = api_client.get("/api/workspace/").data["state"]["activeFactoryId"]
    line = create_master(api_client, factory_id, "lines", "Tube line", "LINE-01")
    machine = create_master(
        api_client,
        factory_id,
        "machines",
        "Mixer",
        "MIX-01",
        parentId=line.data["id"],
    )

    missing_parent = create_master(
        api_client,
        factory_id,
        "processes",
        "Unassigned process",
        "PROC-NONE",
        metadata={"sequence": 1},
    )
    wrong_parent = create_master(
        api_client,
        factory_id,
        "processes",
        "Wrong parent",
        "PROC-WRONG",
        parentId=machine.data["id"],
        metadata={"sequence": 1},
    )
    first = create_master(
        api_client,
        factory_id,
        "processes",
        "Mixing",
        "MIX",
        parentId=line.data["id"],
        metadata={"sequence": 1, "inputUnit": "kg", "outputUnit": "kg"},
    )
    duplicate_sequence = create_master(
        api_client,
        factory_id,
        "processes",
        "Extrusion",
        "EXT",
        parentId=line.data["id"],
        metadata={"sequence": 1},
    )

    assert line.status_code == 201
    assert machine.status_code == 201
    assert missing_parent.status_code == 400
    assert wrong_parent.status_code == 400
    assert first.status_code == 201
    assert first.data["metadata"]["sequence"] == 1
    assert duplicate_sequence.status_code == 400


def test_process_import_uses_selected_process_code_without_mutating_source(api_client):
    factory_id = api_client.get("/api/workspace/").data["state"]["activeFactoryId"]
    line = create_master(api_client, factory_id, "lines", "Tube line", "LINE-01").data
    process = create_master(
        api_client,
        factory_id,
        "processes",
        "Mixing",
        "MIX",
        parentId=line["id"],
        metadata={"sequence": 1, "inputUnit": "kg", "outputUnit": "kg"},
    ).data
    create_master(
        api_client,
        factory_id,
        "machines",
        "Internal Mixer 01",
        "MIX-01",
        parentId=line["id"],
        metadata={"processCode": "MIX"},
    )
    create_master(api_client, factory_id, "shifts", "Shift A", "SHIFT-A")
    content = (
        b"date,line,machine,shift,status,input_quantity,output_quantity,"
        b"rejected_quantity,run_minutes,downtime_minutes\n"
        b"2026-08-01,Tube line,Internal Mixer 01,Shift A,running,100,95,2,450,10\n"
    )

    inspection = api_client.post(
        "/api/imports/inspect/",
        {
            "factory": factory_id,
            "datasetType": "process",
            "process": process["id"],
            "file": SimpleUploadedFile("mixing.csv", content, content_type="text/csv"),
        },
        format="multipart",
    )

    assert inspection.status_code == 201
    upload_id = inspection.data["upload"]["id"]
    preview = api_client.get(f"/api/imports/{upload_id}/preview/")
    assert preview.status_code == 200
    assert "process" not in preview.data["headers"]
    assert "process" not in preview.data["rows"][0]

    validation = api_client.post(
        f"/api/imports/{upload_id}/validate/",
        {"mapping": inspection.data["mapping"]},
        format="json",
    )
    assert validation.status_code == 200
    assert validation.data["canImport"] is True
    assert (
        api_client.post(f"/api/imports/{upload_id}/commit/", {}, format="json").status_code == 200
    )

    record = StandardRecord.objects.get(upload_id=upload_id)
    assert record.values["process"] == "MIX"

    twin = api_client.get(
        f"/api/workspace/?factory={factory_id}&from=2026-08-01&to=2026-08-01"
    ).data["intelligence"]["digitalTwin"]
    node = twin["lines"][0]["processes"][0]
    assert node["hasData"] is True
    assert node["latestDate"] == "2026-08-01"
    assert node["metrics"]["temperatureC"] is None
    assert node["metrics"]["pressureBar"] is None


def test_seed_mypol_is_idempotent_and_populates_every_feature(
    api_client, user, membership
):
    call_command("seed_mypol", verbosity=0)
    factory = Factory.objects.get(tenant__slug="vulcan-workspace", code="MYPOL-MYS")
    first_counts = {
        "masters": factory.master_records.count(),
        "uploads": factory.uploads.count(),
        "records": factory.standard_records.count(),
    }

    call_command("seed_mypol", verbosity=0)
    factory.refresh_from_db()
    second_counts = {
        "masters": factory.master_records.count(),
        "uploads": factory.uploads.count(),
        "records": factory.standard_records.count(),
    }

    processes = FactoryMaster.objects.filter(
        factory=factory, kind=FactoryMaster.Kind.PROCESS, is_active=True
    )
    materials = FactoryMaster.objects.filter(
        factory=factory, kind=FactoryMaster.Kind.MATERIAL, is_active=True
    )
    suppliers = FactoryMaster.objects.filter(
        factory=factory, kind=FactoryMaster.Kind.SUPPLIER, is_active=True
    )
    process_uploads = Upload.objects.filter(
        factory=factory, dataset_type="process", source_type="showcase", status="COMPLETED"
    )
    assert first_counts == second_counts
    assert processes.count() >= 6
    assert materials.count() >= 6
    assert suppliers.count() >= 6
    assert process_uploads.count() == processes.count()
    assert all(len(upload.standard_records.all()) > 0 for upload in process_uploads)

    membership.is_active = False
    membership.save(update_fields=["is_active"])
    Membership.objects.create(
        user=user,
        tenant=factory.tenant,
        role=Role.COMPANY_ADMIN,
        all_factories=True,
    )

    today = date.today()
    result = api_client.get(
        f"/api/workspace/?factory={factory.id}"
        f"&from={(today - timedelta(days=6)).isoformat()}&to={today.isoformat()}"
    )
    assert result.status_code == 200
    intelligence = result.data["intelligence"]
    twin = intelligence["digitalTwin"]
    twin_processes = [item for line in twin["lines"] for item in line["processes"]]

    assert twin["factory"]["name"] == "MyPol"
    assert [item["sequence"] for item in twin_processes] == list(range(1, len(twin_processes) + 1))
    assert all(item["hasData"] for item in twin_processes)
    assert any(item["status"] in {"warning", "down"} for item in twin_processes)
    assert any(value is None for item in twin_processes for value in item["metrics"].values())
    assert intelligence["alerts"]
    assert intelligence["supplierScore"] > 0
    assert len(intelligence["inventoryRisks"]) >= 6
    assert len(intelligence["supplierScores"]) >= 6
    assert {item["status"] for item in intelligence["supplierScores"]} == {
        "preferred",
        "stable",
        "watch",
        "critical",
    }
    assert intelligence["orderRisks"]
    assert any(
        item["pinnedToHome"] and item["value"] is not None for item in intelligence["customKpis"]
    )
    for dataset_type in [
        "process",
        "production",
        "downtime",
        "quality",
        "inventory",
        "supplier",
        "orders",
    ]:
        assert intelligence["dataAvailability"][dataset_type] > 0
