import pytest
from apps.operations.models import StandardRecord, Upload
from apps.tenancy.models import Factory, FactoryMaster
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings

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


@override_settings(
    DEBUG=True,
    VULCAN_VARIANT="automotive",
    VULCAN_VARIANT_CONFIG={
        "industry": "automotive-manufacturing",
        "features": {"asyncUploads": False, "mushroomAnalytics": False},
    },
)
def test_seed_mypol_is_idempotent_and_imports_the_complete_fixture(api_client, membership):
    command_options = {"verbosity": 0, "tenant_slug": membership.tenant.slug}
    call_command("seed_mypol", **command_options)
    factory = Factory.objects.get(tenant=membership.tenant, code="MYP-MYS")
    first_counts = {
        "masters": factory.master_records.count(),
        "uploads": factory.uploads.count(),
        "records": factory.standard_records.count(),
    }

    call_command("seed_mypol", **command_options)
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
        factory=factory,
        dataset_type="process",
        source_type="showcase-derived",
        status="COMPLETED",
    )
    assert first_counts == second_counts
    assert factory.company.name == "MYPOL"
    assert factory.company.legal_name == "Mysore Polymers and Rubber Products Pvt. Ltd."
    assert factory.name == "MYPOL Mysuru Plant"
    assert factory.configuration["industry"] == "automotive-manufacturing"
    assert factory.configuration["showcase"]["synthetic"] is True
    assert processes.count() == 23
    assert materials.count() == 15
    assert suppliers.count() == 8
    assert process_uploads.count() == processes.count()
    assert all(len(upload.standard_records.all()) > 0 for upload in process_uploads)
    fixture_uploads = Upload.objects.filter(factory=factory, source_type="showcase")
    assert fixture_uploads.count() == 7
    assert sum(upload.accepted_rows for upload in fixture_uploads) == 5702
    assert factory.standard_records.count() == 5863

    result = api_client.get(f"/api/workspace/?factory={factory.id}&from=2026-07-25&to=2026-07-31")
    assert result.status_code == 200
    intelligence = result.data["intelligence"]
    twin = intelligence["digitalTwin"]
    twin_processes = [item for line in twin["lines"] for item in line["processes"]]

    assert twin["factory"]["name"] == "MYPOL Mysuru Plant"
    assert len(twin["lines"]) == 4
    assert len(twin_processes) == 23
    assert all(item["hasData"] for item in twin_processes)
    assert any(item["status"] in {"warning", "down"} for item in twin_processes)
    assert any(value is None for item in twin_processes for value in item["metrics"].values())
    assert intelligence["alerts"]
    assert intelligence["totals"]["planned"] == 85233
    assert intelligence["totals"]["actual"] == 73575
    assert round(intelligence["oee"]["value"], 2) == 75.93
    assert intelligence["machineLoss"][0]["machine"] == "Tube Cure Press HC-02"
    assert intelligence["supplierScore"] > 0
    assert len(intelligence["inventoryRisks"]) >= 3
    assert len(intelligence["supplierScores"]) >= 3
    assert intelligence["orderRisks"]
    assert {
        item["orderId"] for item in intelligence["orderRisks"] if item["risk"] == "critical"
    } >= {"MYP-ORD-AT-RISK-01", "MYP-ORD-AT-RISK-02"}
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
        "utilities",
    ]:
        assert intelligence["dataAvailability"][dataset_type] > 0
    assert intelligence["steamRecovery"]["heatRecoveredGj"] > 0
    assert intelligence["steamRecovery"]["equivalentBriquetteSavedKg"] > 0
