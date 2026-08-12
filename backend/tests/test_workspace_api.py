from io import BytesIO
from pathlib import Path

import pytest
from apps.operations.models import StandardRecord, Upload
from apps.tenancy.models import Company
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import load_workbook


def import_sheet(api_client, factory_id, dataset_type, filename, content):
    content_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if filename.endswith(".xlsx")
        else "text/csv"
    )
    inspection = api_client.post(
        "/api/imports/inspect/",
        {
            "factory": factory_id,
            "datasetType": dataset_type,
            "file": SimpleUploadedFile(filename, content, content_type=content_type),
        },
        format="multipart",
    )
    assert inspection.status_code == 201
    upload_id = inspection.data["upload"]["id"]
    validation = api_client.post(
        f"/api/imports/{upload_id}/validate/",
        {"mapping": inspection.data["mapping"]},
        format="json",
    )
    assert validation.status_code == 200
    assert validation.data["canImport"] is True
    committed = api_client.post(f"/api/imports/{upload_id}/commit/", {}, format="json")
    assert committed.status_code == 200
    return upload_id


@pytest.mark.django_db
def test_project_templates_are_downloaded_as_excel_workbooks(api_client):
    response = api_client.get("/api/imports/template/projects/")

    assert response.status_code == 200
    assert response["Content-Disposition"].endswith('"mushroom_projects_template.xlsx"')
    workbook = load_workbook(BytesIO(response.content), read_only=True)
    worksheet = workbook.active
    headers = [cell.value for cell in next(worksheet.iter_rows())]
    assert headers[:4] == ["project_number", "customer", "project_name", "po_number"]
    assert worksheet["A2"].value == "MUS-2608-R1"
    workbook.close()


@pytest.mark.django_db
def test_mock_project_workbooks_import_end_to_end(api_client):
    factory_id = api_client.get("/api/workspace/").data["state"]["activeFactoryId"]
    fixture_dir = Path(__file__).parents[2] / "test-data" / "projects"

    for dataset_type, filename in [
        ("projects", "project_master_mock.xlsx"),
        ("project_stages", "project_stages_mock.xlsx"),
    ]:
        source = fixture_dir / filename
        import_sheet(api_client, factory_id, dataset_type, filename, source.read_bytes())

    intelligence = api_client.get(f"/api/workspace/?factory={factory_id}").data["intelligence"]
    assert intelligence["dataAvailability"]["projects"] == 6
    assert intelligence["dataAvailability"]["project_stages"] == 54
    assert len(intelligence["projects"]) == 6
    assert {project["status"] for project in intelligence["projects"]} == {
        "Not Started",
        "In Progress",
        "Delayed",
        "Completed",
    }
    assert any(alert["id"] == "project-IG-2026-048" for alert in intelligence["alerts"])


@pytest.mark.django_db
def test_factory_and_master_data_are_persisted_for_authenticated_admin(api_client):
    factory_response = api_client.post(
        "/api/factories/",
        {
            "name": "Mysuru Plant",
            "code": "MYS-01",
            "location": "Mysuru, Karnataka",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
        },
        format="json",
    )
    assert factory_response.status_code == 201
    factory_id = factory_response.data["id"]

    master_response = api_client.post(
        f"/api/factory-masters/?factory={factory_id}",
        {"factory": factory_id, "kind": "lines", "name": "Cure Line", "code": "CURE-01"},
        format="json",
    )
    assert master_response.status_code == 201

    workspace = api_client.get(f"/api/workspace/?factory={factory_id}")
    assert workspace.status_code == 200
    factories = {item["id"]: item for item in workspace.data["state"]["factories"]}
    assert factories[factory_id]["name"] == "Mysuru Plant"
    assert workspace.data["state"]["masters"]["lines"][0]["code"] == "CURE-01"


@pytest.mark.django_db
def test_company_identity_survives_profile_rename_and_reload(api_client):
    initial = api_client.get("/api/workspace/")
    factory_id = initial.data["state"]["activeFactoryId"]
    company_id = initial.data["state"]["company"]["id"]
    industry = settings.VULCAN_VARIANT_CONFIG["industry"]

    renamed = api_client.patch(
        f"/api/workspace/configuration/?factory={factory_id}",
        {"name": "Renamed Manufacturing Company", "industry": industry},
        format="json",
    )
    reloaded = api_client.get(f"/api/workspace/?factory={factory_id}")
    saved_again = api_client.patch(
        f"/api/workspace/configuration/?factory={factory_id}",
        {"name": "Renamed Manufacturing Company", "industry": industry},
        format="json",
    )

    assert renamed.status_code == 200
    assert reloaded.data["state"]["company"] == {
        "id": company_id,
        "name": "Renamed Manufacturing Company",
        "industry": industry,
    }
    assert saved_again.status_code == 200
    assert Company.objects.count() == 1


@pytest.mark.django_db
def test_workspace_snapshot_is_isolated_to_selected_factory(api_client):
    first = api_client.get("/api/workspace/").data["state"]["activeFactoryId"]
    second_response = api_client.post(
        "/api/factories/",
        {
            "name": "Second Plant",
            "code": "SECOND-01",
            "location": "Chennai",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
        },
        format="json",
    )
    second = second_response.data["id"]
    api_client.post(
        f"/api/factory-masters/?factory={first}",
        {"factory": first, "kind": "lines", "name": "First line", "code": "FIRST-LINE"},
        format="json",
    )
    api_client.post(
        f"/api/factory-masters/?factory={second}",
        {"factory": second, "kind": "lines", "name": "Second line", "code": "SECOND-LINE"},
        format="json",
    )
    api_client.post(
        "/api/workspace/actions/",
        {"factory": first, "alertId": "first-alert", "title": "First action"},
        format="json",
    )
    api_client.post(
        "/api/workspace/actions/",
        {"factory": second, "alertId": "second-alert", "title": "Second action"},
        format="json",
    )

    first_state = api_client.get(f"/api/workspace/?factory={first}").data["state"]
    second_state = api_client.get(f"/api/workspace/?factory={second}").data["state"]

    assert first_state["activeFactoryId"] == first
    assert [item["code"] for item in first_state["masters"]["lines"]] == ["FIRST-LINE"]
    assert [item["alertId"] for item in first_state["actions"]] == ["first-alert"]
    assert second_state["activeFactoryId"] == second
    assert [item["code"] for item in second_state["masters"]["lines"]] == ["SECOND-LINE"]
    assert [item["alertId"] for item in second_state["actions"]] == ["second-alert"]


@pytest.mark.django_db
def test_import_is_inspected_validated_and_calculated_in_django(api_client):
    workspace = api_client.get("/api/workspace/")
    factory_id = workspace.data["state"]["activeFactoryId"]
    content = (
        b"date,line,machine,sku,shift,planned_quantity,actual_quantity,good_quantity,ignored\n"
        b"2026-07-31,Line 1,Machine 1,SKU-1,Shift A,100,90,88,not imported\n"
    )
    inspection = api_client.post(
        "/api/imports/inspect/",
        {
            "factory": factory_id,
            "datasetType": "production",
            "file": SimpleUploadedFile("production.csv", content, content_type="text/csv"),
        },
        format="multipart",
    )
    assert inspection.status_code == 201
    upload_id = inspection.data["upload"]["id"]
    assert inspection.data["mapping"]["ignored"] == ""
    after_inspection = api_client.get(f"/api/workspace/?factory={factory_id}")
    assert after_inspection.data["state"]["uploads"] == []
    preview = api_client.get(f"/api/imports/{upload_id}/preview/")
    assert preview.status_code == 200
    assert preview.data["headers"][0] == "date"
    assert preview.data["rows"][0]["actual_quantity"] == "90"
    assert preview.data["totalRows"] == 1

    validation = api_client.post(
        f"/api/imports/{upload_id}/validate/",
        {"mapping": inspection.data["mapping"]},
        format="json",
    )
    assert validation.status_code == 200
    assert validation.data["canImport"] is True
    assert validation.data["upload"]["acceptedRows"] == 1
    after_validation = api_client.get(f"/api/workspace/?factory={factory_id}")
    assert after_validation.data["state"]["uploads"] == []

    committed = api_client.post(f"/api/imports/{upload_id}/commit/", {}, format="json")
    assert committed.status_code == 200
    assert committed.data["status"] == "COMPLETED"
    assert committed.data["omittedFields"] == ["ignored"]
    after_commit = api_client.get(f"/api/workspace/?factory={factory_id}")
    assert [item["id"] for item in after_commit.data["state"]["uploads"]] == [upload_id]

    configured = api_client.patch(
        f"/api/workspace/configuration/?factory={factory_id}",
        {
            "customKpis": [
                {
                    "id": "good-output-share",
                    "name": "Good output share",
                    "variableA": "production.good",
                    "operation": "divide",
                    "variableB": "production.actual",
                    "scale": 100,
                    "decimals": 1,
                    "unit": "%",
                    "pinnedToHome": True,
                }
            ]
        },
        format="json",
    )
    assert configured.status_code == 200

    result = api_client.get(f"/api/workspace/?factory={factory_id}&from=2026-07-31&to=2026-07-31")
    assert result.data["intelligence"]["totals"]["planned"] == 100
    assert result.data["intelligence"]["totals"]["actual"] == 90
    assert result.data["intelligence"]["totals"]["good"] == 88
    assert result.data["intelligence"]["totals"]["estimatedProductionLost"] == 10
    assert result.data["intelligence"]["totals"]["rejectionRate"] == 0
    assert result.data["intelligence"]["customKpis"][0]["value"] == 97.8
    assert result.data["intelligence"]["customKpis"][0]["pinnedToHome"] is True
    assert any(
        item["key"] == "downtime.minutes"
        for item in result.data["intelligence"]["customKpiVariables"]
    )


@pytest.mark.django_db
def test_utility_log_calculates_mypol_steam_recovery_kpis(api_client):
    factory_id = api_client.get("/api/workspace/").data["state"]["activeFactoryId"]
    utility_csv = (
        b"date,shift,boiler,feedwater_kg,feedwater_inlet_temperature_c,"
        b"feedwater_tank_temperature_c,steam_generated_kg,recovered_condensate_kg,"
        b"flash_steam_recovered_kg,briquette_used_kg,briquette_gcv_kcal_per_kg,"
        b"boiler_efficiency_percent\n"
        b"2026-07-31,Shift A,BB-01,10000,30,70,9000,4500,450,1800,3800,72\n"
    )
    import_sheet(api_client, factory_id, "utilities", "utilities.csv", utility_csv)
    production_csv = (
        b"date,line,machine,sku,shift,planned_quantity,actual_quantity,good_quantity\n"
        b"2026-07-31,Line 1,Press 1,SKU-1,Shift A,6500,6000,5900\n"
    )
    import_sheet(api_client, factory_id, "production", "production.csv", production_csv)

    result = api_client.get(
        f"/api/workspace/?factory={factory_id}&from=2026-07-31&to=2026-07-31"
    ).data["intelligence"]
    steam = result["steamRecovery"]

    assert result["dataAvailability"]["utilities"] == 1
    assert steam["temperatureLiftC"] == 40
    assert steam["heatRecoveredMj"] == 1674.4
    assert steam["condensateRecoveryPercent"] == 50
    assert steam["flashSteamRecoveryPercent"] == 5
    assert steam["specificSteamKgPerUnit"] == 1.5
    assert steam["specificBriquetteKgPerTonneSteam"] == 200
    assert len(steam["trend"]) == 1


@pytest.mark.django_db
def test_mapping_mismatch_returns_a_specific_correction(api_client):
    workspace = api_client.get("/api/workspace/")
    factory_id = workspace.data["state"]["activeFactoryId"]
    inspection = api_client.post(
        "/api/imports/inspect/",
        {
            "factory": factory_id,
            "datasetType": "downtime",
            "file": SimpleUploadedFile(
                "downtime.csv", b"date,line\n2026-07-31,Line 1\n", content_type="text/csv"
            ),
        },
        format="multipart",
    )
    upload_id = inspection.data["upload"]["id"]
    validation = api_client.post(
        f"/api/imports/{upload_id}/validate/",
        {"mapping": inspection.data["mapping"]},
        format="json",
    )
    assert validation.data["canImport"] is False
    missing_machine = next(
        issue for issue in validation.data["issues"] if issue["field"] == "machine"
    )
    assert missing_machine["ruleCode"] == "required_mapping"
    assert "Map the source column" in missing_machine["suggestedCorrection"]


@pytest.mark.django_db
def test_completed_source_can_be_reopened_for_editing_and_deleted(api_client):
    factory_id = api_client.get("/api/workspace/").data["state"]["activeFactoryId"]
    inspection = api_client.post(
        "/api/imports/inspect/",
        {
            "factory": factory_id,
            "datasetType": "downtime",
            "file": SimpleUploadedFile(
                "editable.csv",
                b"date,line,machine,shift,reason,minutes\n"
                b"2026-07-31,Line 1,Mixer 1,Shift A,Failure,75\n",
                content_type="text/csv",
            ),
        },
        format="multipart",
    )
    upload_id = inspection.data["upload"]["id"]
    validation = api_client.post(
        f"/api/imports/{upload_id}/validate/",
        {"mapping": inspection.data["mapping"]},
        format="json",
    )
    assert validation.data["canImport"] is True
    committed = api_client.post(f"/api/imports/{upload_id}/commit/", {}, format="json")
    assert committed.status_code == 200

    edit = api_client.get(f"/api/imports/{upload_id}/edit/")
    assert edit.status_code == 200
    assert edit.data["upload"]["status"] == "COMPLETED"
    assert edit.data["mapping"]["minutes"] == "minutes"
    assert edit.data["samples"][0]["minutes"] == "75"

    # Warm the workspace cache to reproduce the former stale-table failure.
    before_delete = api_client.get(f"/api/workspace/?factory={factory_id}")
    assert [item["id"] for item in before_delete.data["state"]["uploads"]] == [upload_id]

    deleted = api_client.delete(f"/api/imports/{upload_id}/delete/")
    assert deleted.status_code == 204
    assert not Upload.objects.filter(id=upload_id).exists()
    assert not StandardRecord.objects.filter(upload_id=upload_id).exists()
    after_delete = api_client.get(f"/api/workspace/?factory={factory_id}")
    assert after_delete.data["state"]["uploads"] == []

    retried = api_client.delete(f"/api/imports/{upload_id}/delete/")
    assert retried.status_code == 204


@pytest.mark.django_db
def test_do_not_import_never_adds_source_to_upload_history(api_client):
    factory_id = api_client.get("/api/workspace/").data["state"]["activeFactoryId"]
    inspection = api_client.post(
        "/api/imports/inspect/",
        {
            "factory": factory_id,
            "datasetType": "downtime",
            "file": SimpleUploadedFile(
                "declined.csv",
                b"date,line,machine,shift,reason,minutes\n"
                b"2026-07-31,Line 1,Mixer 1,Shift A,Failure,75\n",
                content_type="text/csv",
            ),
        },
        format="multipart",
    )
    upload_id = inspection.data["upload"]["id"]
    validation = api_client.post(
        f"/api/imports/{upload_id}/validate/",
        {"mapping": inspection.data["mapping"]},
        format="json",
    )
    assert validation.data["canImport"] is True

    cancelled = api_client.post(f"/api/imports/{upload_id}/cancel/", {}, format="json")
    assert cancelled.status_code == 200
    assert cancelled.data["status"] == "CANCELLED"
    workspace = api_client.get(f"/api/workspace/?factory={factory_id}")
    assert workspace.data["state"]["uploads"] == []
    assert StandardRecord.objects.filter(upload_id=upload_id).count() == 0


@pytest.mark.django_db
def test_downtime_target_unit_is_validated_and_minutes_remain_canonical(api_client):
    factory_id = api_client.get("/api/workspace/").data["state"]["activeFactoryId"]
    saved = api_client.patch(
        f"/api/workspace/configuration/?factory={factory_id}",
        {"targets": {"downtimeMinutes": 90, "downtimeUnit": "hours"}},
        format="json",
    )
    assert saved.status_code == 200
    assert saved.data["state"]["targets"]["downtimeMinutes"] == 90
    assert saved.data["state"]["targets"]["downtimeUnit"] == "hours"

    rejected = api_client.patch(
        f"/api/workspace/configuration/?factory={factory_id}",
        {"targets": {"downtimeUnit": "shifts"}},
        format="json",
    )
    assert rejected.status_code == 400
    assert "minutes or hours" in rejected.data["detail"]


@pytest.mark.django_db
def test_full_production_fixture_can_be_inspected(api_client):
    workspace = api_client.get("/api/workspace/")
    factory_id = workspace.data["state"]["activeFactoryId"]
    source = Path(__file__).parents[2] / "test-data" / "mypol-mysuru" / "production.csv"

    inspection = api_client.post(
        "/api/imports/inspect/",
        {
            "factory": factory_id,
            "datasetType": "production",
            "file": SimpleUploadedFile(
                source.name,
                source.read_bytes(),
                content_type="text/csv",
            ),
        },
        format="multipart",
    )

    assert inspection.status_code == 201
    assert inspection.data["upload"]["acceptedRows"] == 0
    assert len(inspection.data["headers"]) == 14


@pytest.mark.django_db
def test_supplier_sheet_is_scored_from_agreed_delivery_facts(api_client):
    workspace = api_client.get("/api/workspace/")
    factory_id = workspace.data["state"]["activeFactoryId"]
    content = (
        b"supplier,material,purchase_order,order_date,promised_date,actual_delivery_date,"
        b"ordered_quantity,received_quantity,accepted_quantity,terms_met\n"
        b"Reliable Supply,Steel,PO-1,2026-07-20,2026-07-30,2026-07-30,100,100,98,yes\n"
        b"Late Supply,Rubber,PO-2,2026-07-20,2026-07-29,2026-07-31,100,90,85,no\n"
    )
    inspection = api_client.post(
        "/api/imports/inspect/",
        {
            "factory": factory_id,
            "datasetType": "supplier",
            "file": SimpleUploadedFile("suppliers.csv", content, content_type="text/csv"),
        },
        format="multipart",
    )
    assert inspection.status_code == 201

    upload_id = inspection.data["upload"]["id"]
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

    result = api_client.get(
        f"/api/workspace/?factory={factory_id}&from=2026-07-25&to=2026-07-31"
    ).data["intelligence"]
    assert result["dataAvailability"]["supplier"] == 2
    assert result["supplierScores"][0]["supplier"] == "Late Supply"
    assert result["supplierScores"][0]["score"] == pytest.approx(71.9)
    assert result["supplierScores"][1]["score"] == pytest.approx(99.8)
    assert result["supplierScore"] == pytest.approx(85.85)
    assert result["dataHealth"]["supplier"]["status"] == "current"
    assert any(alert["id"] == "supplier-Late Supply" for alert in result["alerts"])


@pytest.mark.django_db
def test_inventory_reports_actual_unit_and_stale_data(api_client):
    workspace = api_client.get("/api/workspace/")
    factory_id = workspace.data["state"]["activeFactoryId"]
    assert workspace.data["intelligence"]["dataHealth"]["inventory"]["status"] == "absent"
    content = (
        b"date,material,supplier,unit,available_quantity,daily_consumption,safety_stock,"
        b"expected_receipt_date,required_date,receipt_status\n"
        b"2026-07-20,Butyl Rubber,Reliable Supply,kg,1250,1000,3000,"
        b"2026-07-24,2026-07-23,delayed\n"
    )
    inspection = api_client.post(
        "/api/imports/inspect/",
        {
            "factory": factory_id,
            "datasetType": "inventory",
            "file": SimpleUploadedFile("inventory.csv", content, content_type="text/csv"),
        },
        format="multipart",
    )
    upload_id = inspection.data["upload"]["id"]
    validation = api_client.post(
        f"/api/imports/{upload_id}/validate/",
        {"mapping": inspection.data["mapping"]},
        format="json",
    )
    assert validation.data["canImport"] is True
    assert (
        api_client.post(f"/api/imports/{upload_id}/commit/", {}, format="json").status_code == 200
    )

    result = api_client.get(
        f"/api/workspace/?factory={factory_id}&from=2026-07-20&to=2026-07-31"
    ).data["intelligence"]
    assert result["inventoryRisks"][0]["availableQuantity"] == 1250
    assert result["inventoryRisks"][0]["unit"] == "kg"
    assert result["dataHealth"]["inventory"] == {
        "status": "stale",
        "latestDate": "2026-07-20",
        "ageDays": 11,
        "staleAfterDays": 3,
    }


@pytest.mark.django_db
def test_project_sheets_drive_factory_scoped_tracker_and_latest_source_wins(api_client):
    factory_id = api_client.get("/api/workspace/").data["state"]["activeFactoryId"]
    project = (
        b"project_number,customer,project_name,po_number,category,quantity,uom,"
        b"factory_unit,order_value,po_received_date,start_date,customer_due_date,"
        b"commitment_date,priority,status,progress,assigned_team\n"
        b"IG-2026-047,Customer A,Water skid,PO-4821,Process Equipment,1,Set,Unit-I,"
        b"4850000,2026-07-25,2026-07-28,2026-08-20,2026-08-20,High,In Progress,"
        b"50,Nisha Rao|Project lead; Imran Shaikh|Production\n"
    )
    import_sheet(api_client, factory_id, "projects", "project-master.csv", project)
    stages = (
        b"project_number,stage_code,stage_name,sequence,stage_status,progress,"
        b"planned_start,actual_start,planned_completion,actual_completion,assigned_to,"
        b"delay_days,notes,attachments\n"
        b"IG-2026-047,RAW,Raw Material Delivery,1,Completed,100,2026-07-28,"
        b"2026-07-28,2026-07-30,2026-07-30,Ajay Kumar,0,Material verified,mtc.pdf\n"
        b"IG-2026-047,CUT,Profile Cutting,2,In Progress,50,2026-07-31,2026-08-01,"
        b"2026-08-05,,Imran Shaikh,0,Cutting active,drawing.dwg\n"
        b"IG-2026-047,WELD,Welding,3,Delayed,25,2026-08-06,2026-08-07,"
        b"2026-08-20,,Ravi Joshi,3,Capacity constraint,inspection.pdf\n"
    )
    import_sheet(api_client, factory_id, "project_stages", "project-stages.csv", stages)

    workspace = api_client.get(
        f"/api/workspace/?factory={factory_id}&from=2026-08-01&to=2026-08-10"
    ).data["intelligence"]
    assert workspace["dataAvailability"]["projects"] == 1
    assert workspace["dataAvailability"]["project_stages"] == 3
    assert len(workspace["projects"]) == 1
    tracker = workspace["projects"][0]
    project_id = tracker["id"]
    assert tracker["status"] == "Delayed"
    assert tracker["progress"] == 58
    assert tracker["deliveryPrediction"] == {
        "date": "2026-08-23",
        "confidence": 68,
        "state": "Late",
    }
    assert [stage["name"] for stage in tracker["stages"]] == [
        "Raw Material Delivery",
        "Profile Cutting",
        "Welding",
    ]
    assert {document["name"] for document in tracker["documents"]} == {
        "mtc.pdf",
        "drawing.dwg",
        "inspection.pdf",
    }
    assert any(alert["id"] == "project-IG-2026-047" for alert in workspace["alerts"])

    refreshed = project.replace(b"4850000", b"5100000").replace(
        b"Customer A", b"Customer A Updated"
    )
    import_sheet(api_client, factory_id, "projects", "project-master-v2.csv", refreshed)
    latest = api_client.get(f"/api/workspace/?factory={factory_id}").data["intelligence"]
    assert len(latest["projects"]) == 1
    assert latest["projects"][0]["id"] == project_id
    assert latest["projects"][0]["customer"] == "Customer A Updated"
    assert latest["projects"][0]["orderValue"] == 5_100_000

    second_factory = api_client.post(
        "/api/factories/",
        {
            "name": "Project-free plant",
            "code": "PROJECT-FREE",
            "location": "Pune",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
        },
        format="json",
    ).data["id"]
    isolated = api_client.get(f"/api/workspace/?factory={second_factory}").data["intelligence"]
    assert isolated["projects"] == []
    assert isolated["dataAvailability"]["projects"] == 0


@pytest.mark.django_db
def test_project_stage_validation_rejects_orphans_and_inconsistent_progress(api_client):
    factory_id = api_client.get("/api/workspace/").data["state"]["activeFactoryId"]
    content = (
        b"project_number,stage_code,stage_name,sequence,stage_status,progress,"
        b"planned_start,planned_completion\n"
        b"MISSING-01,PACK,Packing,1,Completed,20,2026-08-01,2026-08-02\n"
    )
    inspection = api_client.post(
        "/api/imports/inspect/",
        {
            "factory": factory_id,
            "datasetType": "project_stages",
            "file": SimpleUploadedFile("orphan.csv", content, content_type="text/csv"),
        },
        format="multipart",
    )
    validation = api_client.post(
        f"/api/imports/{inspection.data['upload']['id']}/validate/",
        {"mapping": inspection.data["mapping"]},
        format="json",
    )
    assert validation.data["canImport"] is False
    assert {issue["ruleCode"] for issue in validation.data["issues"]} >= {
        "unknown_project",
        "status_progress_consistency",
    }
