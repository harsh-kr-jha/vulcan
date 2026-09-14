"""Tests for spatial factory feed and list-create endpoints."""

import pytest
from django.urls import reverse

from apps.spatial.models import (
    DispatchConfiguration,
    DispatchEvent,
    FactoryLayout,
    InventoryChange,
    InventoryConfiguration,
    MachineObservation,
    SpatialMachine,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def layout(tenant, factory):
    return FactoryLayout.objects.create(
        tenant=tenant,
        factory=factory,
        floor_width=80,
        floor_height=50,
        unit_system="meters",
    )


def test_spatial_feed_endpoint(api_client, tenant, factory, layout):
    machine = SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Growing Room 1",
        position_x=10,
        position_y=10,
    )
    MachineObservation.objects.create(
        tenant=tenant,
        machine=machine,
        values={"temp_c": 18.5, "rh_pct": 92},
    )

    inv = InventoryConfiguration.objects.create(
        tenant=tenant,
        layout=layout,
        storage_capacity=50000,
        capacity_unit="kilograms",
        materials=[{"id": "mat-1", "name": "Straw substrate", "unit": "kilograms", "quantity": 1000}],
    )
    InventoryChange.objects.create(
        tenant=tenant,
        inventory=inv,
        material_id="mat-1",
        direction="inbound",
        quantity=500,
    )

    disp = DispatchConfiguration.objects.create(
        tenant=tenant,
        layout=layout,
        products=[{"id": "prod-1", "name": "Fresh Buttons", "unit": "kilograms"}],
    )
    DispatchEvent.objects.create(
        tenant=tenant,
        dispatch=disp,
        product_id="prod-1",
        event_type="arrival",
        quantity=300,
        unit="kilograms",
    )

    url = reverse("spatial:spatial-feed")
    response = api_client.get(f"{url}?factory={factory.id}")
    assert response.status_code == 200
    data = response.json()

    assert data["layout_id"] == str(layout.id)
    assert data["freshness"]["machines"]["reporting_count"] == 1
    assert data["freshness"]["machines"]["total_count"] == 1
    assert data["freshness"]["machines"]["status"] == "fresh"
    assert data["inventory"]["stock"]["mat-1"] == 1500.0
    assert data["dispatch"]["awaiting"]["prod-1"] == 300.0
    assert len(data["recent_events"]) >= 3


def test_inventory_and_dispatch_list_endpoints(api_client, tenant, layout):
    inv = InventoryConfiguration.objects.create(
        tenant=tenant,
        layout=layout,
        storage_capacity=10000,
        capacity_unit="kilograms",
        materials=[{"id": "mat-1", "name": "Spawn", "unit": "kilograms", "quantity": 200}],
    )
    InventoryChange.objects.create(
        tenant=tenant,
        inventory=inv,
        material_id="mat-1",
        direction="inbound",
        quantity=100,
    )

    url = reverse("spatial:inventory-changes", kwargs={"layout_id": layout.id})
    res = api_client.get(url)
    assert res.status_code == 200
    res_data = res.json()
    results = res_data.get("results", res_data) if isinstance(res_data, dict) else res_data
    assert len(results) == 1
    assert results[0]["material_id"] == "mat-1"

    disp = DispatchConfiguration.objects.create(
        tenant=tenant,
        layout=layout,
        products=[{"id": "prod-1", "name": "Packed Mushrooms", "unit": "kilograms"}],
    )
    DispatchEvent.objects.create(
        tenant=tenant,
        dispatch=disp,
        product_id="prod-1",
        event_type="dispatched",
        quantity=50,
        unit="kilograms",
    )

    disp_url = reverse("spatial:dispatch-events", kwargs={"layout_id": layout.id})
    disp_res = api_client.get(disp_url)
    assert disp_res.status_code == 200
    disp_res_data = disp_res.json()
    disp_results = disp_res_data.get("results", disp_res_data) if isinstance(disp_res_data, dict) else disp_res_data
    assert len(disp_results) == 1
    assert disp_results[0]["event_type"] == "dispatched"
