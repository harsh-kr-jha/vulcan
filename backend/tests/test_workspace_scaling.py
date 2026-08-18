from concurrent.futures import ThreadPoolExecutor
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from apps.analytics import workspace
from apps.operations.models import StandardRecord, Upload
from django.core.cache import cache


def completed_upload(factory, user, dataset_type):
    return Upload.objects.create(
        tenant=factory.tenant,
        factory=factory,
        original_filename=f"{dataset_type}.csv",
        file_type="csv",
        uploaded_by=user,
        template_code=dataset_type,
        template_version="1",
        dataset_type=dataset_type,
        status="COMPLETED",
    )


def record(factory, upload, dataset_type, operational_date):
    return StandardRecord(
        tenant=factory.tenant,
        factory=factory,
        upload=upload,
        dataset_type=dataset_type,
        source_row=operational_date.toordinal(),
        operational_date=operational_date,
        values={"date": str(operational_date), "actual_quantity": 1},
    )


@pytest.mark.django_db
def test_workspace_query_bounds_fact_rows_but_preserves_business_history(factory, user):
    uploads = {
        kind: completed_upload(factory, user, kind)
        for kind in ("production", "inventory", "orders")
    }
    StandardRecord.objects.bulk_create(
        [
            record(factory, uploads["production"], "production", date(2026, 1, 1)),
            record(factory, uploads["production"], "production", date(2026, 8, 10)),
            record(factory, uploads["inventory"], "inventory", date(2025, 12, 1)),
            record(factory, uploads["inventory"], "inventory", date(2026, 9, 1)),
            record(factory, uploads["orders"], "orders", date(2026, 9, 1)),
        ]
    )

    rows = list(workspace.workspace_record_rows(factory, date(2026, 8, 6), date(2026, 8, 12)))
    selected = {(item["dataset_type"], item["operational_date"]) for item in rows}

    assert ("production", date(2026, 1, 1)) not in selected
    assert ("production", date(2026, 8, 10)) in selected
    assert ("inventory", date(2025, 12, 1)) in selected
    assert ("inventory", date(2026, 9, 1)) not in selected
    assert ("orders", date(2026, 9, 1)) in selected


def test_concurrent_cold_workspace_requests_share_one_build(monkeypatch):
    cache.clear()
    factory = SimpleNamespace(id=uuid4())
    build_count = 0

    def build(*_args, **_kwargs):
        nonlocal build_count
        build_count += 1
        return {"build": build_count}

    monkeypatch.setattr(workspace, "build_workspace_snapshot", build)
    filters = {"from": "2026-08-06", "to": "2026-08-12"}
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(
            executor.map(
                lambda _index: workspace.workspace_snapshot(None, factory, filters),
                range(2),
            )
        )

    assert results == [{"build": 1}, {"build": 1}]
    assert build_count == 1
