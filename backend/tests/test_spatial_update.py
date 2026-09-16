"""Tests for in-place spatial layout update and observation preservation."""

import pytest
from apps.spatial.models import (
    FactoryLayout,
    MachineObservation,
    SpatialMachine,
)

pytestmark = pytest.mark.django_db


def test_layout_patch_preserves_observations(api_client, tenant, factory):
    """Updating layout machines must NOT delete existing observations."""
    layout = FactoryLayout.objects.create(
        tenant=tenant,
        factory=factory,
        floor_width=50,
        floor_height=16,
        unit_system="meters",
    )
    machine1 = SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Room 1",
        position_x=0,
        position_y=0,
        size_width=10,
        size_height=7,
    )
    obs1 = MachineObservation.objects.create(
        tenant=tenant,
        machine=machine1,
        values={"temperature_c": 18.5, "humidity_pct": 92.0},
    )

    # Update layout via API: move machine1 and add machine2
    url = f"/api/spatial/layouts/{layout.id}/"
    patch_payload = {
        "floor_width": 50,
        "floor_height": 16,
        "unit_system": "meters",
        "machines": [
            {
                "id": str(machine1.id),
                "name": "Room 1 (Updated)",
                "position_x": 1,
                "position_y": 1,
                "size_width": 10,
                "size_height": 7,
                "parameters": [],
                "custom_kpis": [],
            },
            {
                "name": "Room 2 (New)",
                "position_x": 11,
                "position_y": 1,
                "size_width": 10,
                "size_height": 7,
                "parameters": [],
                "custom_kpis": [],
            },
        ],
        "connections": [],
    }

    response = api_client.patch(url, patch_payload, format="json")
    assert response.status_code == 200, response.data

    # Verify machine1 retained observation
    obs1.refresh_from_db()
    assert obs1.machine.id == machine1.id
    assert obs1.machine.name == "Room 1 (Updated)"
    assert obs1.machine.position_x == 1
    assert obs1.machine.position_y == 1

    # Verify 2 machines exist now
    assert layout.machines.count() == 2
    assert MachineObservation.objects.filter(id=obs1.id).exists()
