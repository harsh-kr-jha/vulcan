"""Tests for FactoryLayoutSerializer — task 2.1.

Covers:
- Nested create (machines with parameters, KPIs, connections)
- Position validation within floor bounds
- Connection reference validation
- Duplicate position detection
- Nested update (full replacement)
- Inventory/dispatch nested config
"""

import uuid

import pytest
from apps.spatial.models import (
    InventoryConfiguration,
    MachineConnection,
    SpatialMachine,
)
from apps.spatial.serializers import FactoryLayoutSerializer
from apps.tenancy.models import Company, Factory, Tenant

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenant():
    return Tenant.objects.create(name="Layout Test Tenant", slug="layout-test")


@pytest.fixture
def factory(tenant):
    company = Company.objects.create(tenant=tenant, name="Layout Co")
    return Factory.objects.create(
        tenant=tenant, company=company, name="Layout Factory", code="LYT-01"
    )


@pytest.fixture
def layout_payload(factory):
    """Minimal valid layout payload."""
    return {
        "factory": factory.id,
        "floor_width": "100.0",
        "floor_height": "50.0",
        "unit_system": "meters",
    }


@pytest.fixture
def machine_a_id():
    return str(uuid.uuid4())


@pytest.fixture
def machine_b_id():
    return str(uuid.uuid4())


@pytest.fixture
def machines_payload(machine_a_id, machine_b_id):
    return [
        {
            "id": machine_a_id,
            "name": "CNC Machine",
            "position_x": 5,
            "position_y": 10,
            "inputs": [{"id": "i1", "label": "Steel", "unitType": "kg"}],
            "outputs": [{"id": "o1", "label": "Parts", "unitType": "units"}],
            "parameters": [
                {
                    "key": "temperature",
                    "data_type": "number",
                    "options": [],
                    "required": True,
                    "order": 0,
                },
                {
                    "key": "material_type",
                    "data_type": "selection",
                    "options": ["Steel", "Aluminum", "Copper"],
                    "required": True,
                    "order": 1,
                },
            ],
            "custom_kpis": [
                {
                    "name": "Efficiency",
                    "display_unit": "%",
                    "formula": {
                        "operations": [
                            {"operator": "divide", "parameterKey": "temperature"}
                        ]
                    },
                }
            ],
        },
        {
            "id": machine_b_id,
            "name": "Laser Cutter",
            "position_x": 20,
            "position_y": 30,
            "inputs": [],
            "outputs": [],
            "parameters": [],
            "custom_kpis": [],
        },
    ]


class TestFactoryLayoutSerializerCreate:
    """Tests for nested create via FactoryLayoutSerializer."""

    def test_create_layout_with_machines(
        self, tenant, factory, layout_payload, machines_payload
    ):
        layout_payload["machines"] = machines_payload
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert serializer.is_valid(), serializer.errors

        layout = serializer.save(tenant=tenant)

        assert layout.floor_width == 100.0
        assert layout.floor_height == 50.0
        assert layout.machines.count() == 2

        cnc = layout.machines.get(name="CNC Machine")
        assert cnc.position_x == 5
        assert cnc.position_y == 10
        assert cnc.parameters.count() == 2
        assert cnc.custom_kpis.count() == 1

        laser = layout.machines.get(name="Laser Cutter")
        assert laser.position_x == 20
        assert laser.position_y == 30

    def test_create_layout_with_connections(
        self, tenant, factory, layout_payload, machines_payload, machine_a_id, machine_b_id
    ):
        layout_payload["machines"] = machines_payload
        layout_payload["connections"] = [
            {
                "source": machine_a_id,
                "target": machine_b_id,
                "name": "CNC to Laser",
                "description": "Parts transfer",
                "material_type": "Steel Parts",
                "quantity_per_cycle": "15.50",
            }
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert serializer.is_valid(), serializer.errors

        layout = serializer.save(tenant=tenant)

        assert layout.connections.count() == 1
        conn = layout.connections.first()
        assert conn.name == "CNC to Laser"
        assert conn.source.name == "CNC Machine"
        assert conn.target.name == "Laser Cutter"

    def test_create_layout_with_inventory_config(self, tenant, factory, layout_payload):
        layout_payload["inventory_config"] = {
            "storage_capacity": 5000,
            "capacity_unit": "kg",
            "materials": [
                {"id": "m1", "name": "Steel Rod", "unit": "kg", "quantity": 100}
            ],
        }
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert serializer.is_valid(), serializer.errors

        layout = serializer.save(tenant=tenant)

        assert hasattr(layout, "inventory_config")
        inv = layout.inventory_config
        assert inv.storage_capacity == 5000
        assert inv.capacity_unit == "kg"
        assert len(inv.materials) == 1

    def test_create_layout_with_dispatch_config(self, tenant, factory, layout_payload):
        layout_payload["dispatch_config"] = {
            "products": [{"id": "p1", "name": "Widget A", "unit": "units"}],
        }
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert serializer.is_valid(), serializer.errors

        layout = serializer.save(tenant=tenant)

        assert hasattr(layout, "dispatch_config")
        disp = layout.dispatch_config
        assert len(disp.products) == 1
        assert disp.products[0]["name"] == "Widget A"

    def test_create_layout_without_nested_data(self, tenant, factory, layout_payload):
        """Layout can be created with just floor dimensions."""
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert serializer.is_valid(), serializer.errors

        layout = serializer.save(tenant=tenant)

        assert layout.machines.count() == 0
        assert layout.connections.count() == 0

    def test_create_preserves_machine_parameters_order(
        self, tenant, factory, layout_payload
    ):
        mid = str(uuid.uuid4())
        layout_payload["machines"] = [
            {
                "id": mid,
                "name": "Ordered Machine",
                "position_x": 0,
                "position_y": 0,
                "inputs": [],
                "outputs": [],
                "parameters": [
                    {"key": "third", "data_type": "text", "order": 2, "required": False},
                    {"key": "first", "data_type": "number", "order": 0, "required": True},
                    {"key": "second", "data_type": "boolean", "order": 1, "required": True},
                ],
                "custom_kpis": [],
            }
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert serializer.is_valid(), serializer.errors
        layout = serializer.save(tenant=tenant)

        machine = layout.machines.first()
        params = list(machine.parameters.order_by("order").values_list("key", flat=True))
        assert params == ["first", "second", "third"]


class TestFactoryLayoutSerializerValidation:
    """Tests for validation logic."""

    def test_rejects_machine_position_outside_floor_width(
        self, factory, layout_payload
    ):
        layout_payload["machines"] = [
            {
                "name": "Out of bounds",
                "position_x": 100,  # exactly at floor_width (invalid: 0-99 valid)
                "position_y": 0,
                "inputs": [],
                "outputs": [],
            }
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert not serializer.is_valid()
        assert "machines" in serializer.errors

    def test_rejects_machine_position_outside_floor_height(
        self, factory, layout_payload
    ):
        layout_payload["machines"] = [
            {
                "name": "Out of bounds",
                "position_x": 0,
                "position_y": 50,  # exactly at floor_height (invalid: 0-49 valid)
                "inputs": [],
                "outputs": [],
            }
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert not serializer.is_valid()
        assert "machines" in serializer.errors

    def test_accepts_machine_at_max_valid_position(self, factory, layout_payload):
        layout_payload["machines"] = [
            {
                "name": "At boundary",
                "position_x": 99,  # floor_width - 1
                "position_y": 49,  # floor_height - 1
                "inputs": [],
                "outputs": [],
            }
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert serializer.is_valid(), serializer.errors

    def test_accepts_machine_at_origin(self, factory, layout_payload):
        layout_payload["machines"] = [
            {
                "name": "At origin",
                "position_x": 0,
                "position_y": 0,
                "inputs": [],
                "outputs": [],
            }
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert serializer.is_valid(), serializer.errors

    def test_rejects_duplicate_machine_positions(self, factory, layout_payload):
        layout_payload["machines"] = [
            {
                "name": "Machine A",
                "position_x": 5,
                "position_y": 10,
                "inputs": [],
                "outputs": [],
            },
            {
                "name": "Machine B",
                "position_x": 5,
                "position_y": 10,
                "inputs": [],
                "outputs": [],
            },
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert not serializer.is_valid()
        assert "machines" in serializer.errors

    def test_rejects_connection_with_invalid_source(self, factory, layout_payload):
        machine_id = str(uuid.uuid4())
        invalid_id = str(uuid.uuid4())
        layout_payload["machines"] = [
            {
                "id": machine_id,
                "name": "Machine A",
                "position_x": 5,
                "position_y": 10,
                "inputs": [],
                "outputs": [],
            }
        ]
        layout_payload["connections"] = [
            {
                "source": invalid_id,  # doesn't exist
                "target": machine_id,
            }
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert not serializer.is_valid()
        assert "connections" in serializer.errors

    def test_rejects_connection_with_invalid_target(self, factory, layout_payload):
        machine_id = str(uuid.uuid4())
        invalid_id = str(uuid.uuid4())
        layout_payload["machines"] = [
            {
                "id": machine_id,
                "name": "Machine A",
                "position_x": 5,
                "position_y": 10,
                "inputs": [],
                "outputs": [],
            }
        ]
        layout_payload["connections"] = [
            {
                "source": machine_id,
                "target": invalid_id,  # doesn't exist
            }
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert not serializer.is_valid()
        assert "connections" in serializer.errors

    def test_accepts_valid_connections(self, factory, layout_payload):
        id_a = str(uuid.uuid4())
        id_b = str(uuid.uuid4())
        layout_payload["machines"] = [
            {
                "id": id_a,
                "name": "Machine A",
                "position_x": 5,
                "position_y": 10,
                "inputs": [],
                "outputs": [],
            },
            {
                "id": id_b,
                "name": "Machine B",
                "position_x": 20,
                "position_y": 30,
                "inputs": [],
                "outputs": [],
            },
        ]
        layout_payload["connections"] = [
            {"source": id_a, "target": id_b, "name": "A to B"}
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert serializer.is_valid(), serializer.errors

    def test_accepts_multiple_connections_between_same_machines(
        self, factory, layout_payload
    ):
        id_a = str(uuid.uuid4())
        id_b = str(uuid.uuid4())
        layout_payload["machines"] = [
            {
                "id": id_a,
                "name": "Machine A",
                "position_x": 0,
                "position_y": 0,
                "inputs": [],
                "outputs": [],
            },
            {
                "id": id_b,
                "name": "Machine B",
                "position_x": 10,
                "position_y": 10,
                "inputs": [],
                "outputs": [],
            },
        ]
        layout_payload["connections"] = [
            {"source": id_a, "target": id_b, "name": "Flow 1"},
            {"source": id_b, "target": id_a, "name": "Return"},
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        assert serializer.is_valid(), serializer.errors


class TestFactoryLayoutSerializerUpdate:
    """Tests for nested update via FactoryLayoutSerializer."""

    def test_update_floor_dimensions(self, tenant, factory, layout_payload):
        serializer = FactoryLayoutSerializer(data=layout_payload)
        serializer.is_valid(raise_exception=True)
        layout = serializer.save(tenant=tenant)

        update_data = {"floor_width": "200.0", "floor_height": "100.0"}
        update_serializer = FactoryLayoutSerializer(
            layout, data=update_data, partial=True
        )
        assert update_serializer.is_valid(), update_serializer.errors
        updated = update_serializer.save()

        assert updated.floor_width == 200.0
        assert updated.floor_height == 100.0

    def test_update_replaces_machines(self, tenant, factory, layout_payload):
        # Create initial layout with one machine
        machine_id = str(uuid.uuid4())
        layout_payload["machines"] = [
            {
                "id": machine_id,
                "name": "Old Machine",
                "position_x": 0,
                "position_y": 0,
                "inputs": [],
                "outputs": [],
            }
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        serializer.is_valid(raise_exception=True)
        layout = serializer.save(tenant=tenant)
        assert layout.machines.count() == 1

        # Update with new machines (full replacement)
        new_id = str(uuid.uuid4())
        update_data = {
            "machines": [
                {
                    "id": new_id,
                    "name": "New Machine",
                    "position_x": 10,
                    "position_y": 20,
                    "inputs": [],
                    "outputs": [],
                    "parameters": [
                        {
                            "key": "speed",
                            "data_type": "number",
                            "options": [],
                            "required": True,
                            "order": 0,
                        }
                    ],
                    "custom_kpis": [],
                }
            ]
        }
        update_serializer = FactoryLayoutSerializer(
            layout, data=update_data, partial=True
        )
        assert update_serializer.is_valid(), update_serializer.errors
        updated = update_serializer.save()

        assert updated.machines.count() == 1
        new_machine = updated.machines.first()
        assert new_machine.name == "New Machine"
        assert new_machine.parameters.count() == 1
        assert not SpatialMachine.objects.filter(name="Old Machine").exists()

    def test_update_replaces_connections(self, tenant, factory, layout_payload):
        id_a = str(uuid.uuid4())
        id_b = str(uuid.uuid4())
        layout_payload["machines"] = [
            {
                "id": id_a,
                "name": "Machine A",
                "position_x": 0,
                "position_y": 0,
                "inputs": [],
                "outputs": [],
            },
            {
                "id": id_b,
                "name": "Machine B",
                "position_x": 10,
                "position_y": 10,
                "inputs": [],
                "outputs": [],
            },
        ]
        layout_payload["connections"] = [
            {"source": id_a, "target": id_b, "name": "Old Connection"}
        ]
        serializer = FactoryLayoutSerializer(data=layout_payload)
        serializer.is_valid(raise_exception=True)
        layout = serializer.save(tenant=tenant)
        assert layout.connections.count() == 1

        # Update with new machines and connections
        new_a = str(uuid.uuid4())
        new_b = str(uuid.uuid4())
        update_data = {
            "machines": [
                {
                    "id": new_a,
                    "name": "New A",
                    "position_x": 5,
                    "position_y": 5,
                    "inputs": [],
                    "outputs": [],
                },
                {
                    "id": new_b,
                    "name": "New B",
                    "position_x": 15,
                    "position_y": 15,
                    "inputs": [],
                    "outputs": [],
                },
            ],
            "connections": [
                {"source": new_a, "target": new_b, "name": "New Connection"},
                {"source": new_b, "target": new_a, "name": "Return"},
            ],
        }
        update_serializer = FactoryLayoutSerializer(
            layout, data=update_data, partial=True
        )
        assert update_serializer.is_valid(), update_serializer.errors
        updated = update_serializer.save()

        assert updated.connections.count() == 2
        assert not MachineConnection.objects.filter(name="Old Connection").exists()

    def test_update_inventory_config(self, tenant, factory, layout_payload):
        layout_payload["inventory_config"] = {
            "storage_capacity": 1000,
            "capacity_unit": "kg",
            "materials": [],
        }
        serializer = FactoryLayoutSerializer(data=layout_payload)
        serializer.is_valid(raise_exception=True)
        layout = serializer.save(tenant=tenant)

        update_data = {
            "inventory_config": {
                "storage_capacity": 5000,
                "capacity_unit": "litres",
                "materials": [
                    {"id": "m1", "name": "Water", "unit": "litres", "quantity": 500}
                ],
            }
        }
        update_serializer = FactoryLayoutSerializer(
            layout, data=update_data, partial=True
        )
        assert update_serializer.is_valid(), update_serializer.errors
        updated = update_serializer.save()

        updated.refresh_from_db()
        inv = updated.inventory_config
        assert inv.storage_capacity == 5000
        assert inv.capacity_unit == "litres"

    def test_update_adds_inventory_when_none_existed(self, tenant, factory, layout_payload):
        serializer = FactoryLayoutSerializer(data=layout_payload)
        serializer.is_valid(raise_exception=True)
        layout = serializer.save(tenant=tenant)

        update_data = {
            "inventory_config": {
                "storage_capacity": 2000,
                "capacity_unit": "units",
                "materials": [
                    {"id": "m1", "name": "Bolts", "unit": "units", "quantity": 100}
                ],
            }
        }
        update_serializer = FactoryLayoutSerializer(
            layout, data=update_data, partial=True
        )
        assert update_serializer.is_valid(), update_serializer.errors
        updated = update_serializer.save()

        assert InventoryConfiguration.objects.filter(layout=updated).exists()
        inv = updated.inventory_config
        assert inv.storage_capacity == 2000

    def test_update_dispatch_config(self, tenant, factory, layout_payload):
        layout_payload["dispatch_config"] = {
            "products": [{"id": "p1", "name": "Old Product", "unit": "kg"}],
        }
        serializer = FactoryLayoutSerializer(data=layout_payload)
        serializer.is_valid(raise_exception=True)
        layout = serializer.save(tenant=tenant)

        update_data = {
            "dispatch_config": {
                "products": [
                    {"id": "p2", "name": "New Product", "unit": "units"},
                    {"id": "p3", "name": "Another", "unit": "litres"},
                ],
            }
        }
        update_serializer = FactoryLayoutSerializer(
            layout, data=update_data, partial=True
        )
        assert update_serializer.is_valid(), update_serializer.errors
        updated = update_serializer.save()

        disp = updated.dispatch_config
        assert len(disp.products) == 2
        assert disp.products[0]["name"] == "New Product"
