"""Unit tests for spatial app serializers.

Covers: MachineParameter, MachineCustomKpi, MachineObservation.
"""

import pytest
from apps.spatial.models import (
    FactoryLayout,
    MachineCustomKpi,
    MachineParameter,
    SpatialMachine,
)
from apps.spatial.serializers import (
    MachineCustomKpiSerializer,
    MachineObservationSerializer,
    MachineParameterSerializer,
)
from apps.tenancy.models import Company, Factory, Tenant

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenant():
    return Tenant.objects.create(name="Test Tenant", slug="test-tenant")


@pytest.fixture
def factory(tenant):
    company = Company.objects.create(tenant=tenant, name="Test Co")
    return Factory.objects.create(
        tenant=tenant, company=company, name="Test Factory", code="TST-01"
    )


@pytest.fixture
def layout(tenant, factory):
    return FactoryLayout.objects.create(
        tenant=tenant,
        factory=factory,
        floor_width=100,
        floor_height=100,
        unit_system="meters",
    )


@pytest.fixture
def machine(tenant, layout):
    return SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Machine A",
        position_x=5,
        position_y=5,
    )


# ──────────────────────────────────────────────────────────────────────────────
# MachineParameterSerializer tests
# ──────────────────────────────────────────────────────────────────────────────


class TestMachineParameterSerializer:
    def test_valid_key_accepted(self, machine):
        data = {"key": "temperature_1", "data_type": "number", "required": True, "order": 0}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert serializer.is_valid(), serializer.errors

    def test_key_with_special_chars_rejected(self, machine):
        data = {"key": "temp-value!", "data_type": "number", "required": True, "order": 0}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "key" in serializer.errors

    def test_key_with_spaces_rejected(self, machine):
        data = {"key": "temp value", "data_type": "number", "required": True, "order": 0}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "key" in serializer.errors

    def test_empty_key_rejected(self, machine):
        data = {"key": "", "data_type": "number", "required": True, "order": 0}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "key" in serializer.errors

    def test_key_too_long_rejected(self, machine):
        data = {"key": "a" * 65, "data_type": "number", "required": True, "order": 0}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "key" in serializer.errors

    def test_key_exactly_64_chars_accepted(self, machine):
        data = {"key": "a" * 64, "data_type": "number", "required": True, "order": 0}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert serializer.is_valid(), serializer.errors

    def test_duplicate_key_case_insensitive_rejected(self, machine):
        # Create an existing parameter
        MachineParameter.objects.create(
            machine=machine, key="Temperature", data_type="number", required=True, order=0
        )
        # Try to create another with same key in different case
        data = {"key": "temperature", "data_type": "text", "required": False, "order": 1}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "key" in serializer.errors.get("non_field_errors", serializer.errors)

    def test_duplicate_key_exact_match_rejected(self, machine):
        MachineParameter.objects.create(
            machine=machine, key="pressure", data_type="number", required=True, order=0
        )
        data = {"key": "pressure", "data_type": "number", "required": True, "order": 1}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()

    def test_unique_key_accepted_when_others_exist(self, machine):
        MachineParameter.objects.create(
            machine=machine, key="pressure", data_type="number", required=True, order=0
        )
        data = {"key": "temperature", "data_type": "number", "required": True, "order": 1}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert serializer.is_valid(), serializer.errors

    def test_update_same_key_allowed(self, machine):
        param = MachineParameter.objects.create(
            machine=machine, key="pressure", data_type="number", required=True, order=0
        )
        # Updating the same parameter with same key should be allowed
        data = {"key": "pressure", "data_type": "text", "required": False, "order": 0}
        serializer = MachineParameterSerializer(
            instance=param, data=data, context={"machine": machine}
        )
        assert serializer.is_valid(), serializer.errors

    def test_alphanumeric_with_underscores_accepted(self, machine):
        data = {"key": "ABC_123_xyz", "data_type": "text", "required": True, "order": 0}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert serializer.is_valid(), serializer.errors

    def test_key_with_hyphen_rejected(self, machine):
        data = {"key": "my-param", "data_type": "text", "required": True, "order": 0}
        serializer = MachineParameterSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "key" in serializer.errors


# ──────────────────────────────────────────────────────────────────────────────
# MachineCustomKpiSerializer tests
# ──────────────────────────────────────────────────────────────────────────────


class TestMachineCustomKpiSerializer:
    def test_valid_kpi_accepted(self, machine):
        data = {
            "name": "Efficiency",
            "display_unit": "%",
            "formula": {
                "operations": [
                    {"operator": "divide", "parameterKey": "output"},
                    {"operator": "multiply", "parameterKey": "input"},
                ]
            },
        }
        serializer = MachineCustomKpiSerializer(data=data, context={"machine": machine})
        assert serializer.is_valid(), serializer.errors

    def test_formula_with_more_than_10_operations_rejected(self, machine):
        operations = [{"operator": "add", "parameterKey": f"param_{i}"} for i in range(11)]
        data = {
            "name": "BigFormula",
            "display_unit": "units",
            "formula": {"operations": operations},
        }
        serializer = MachineCustomKpiSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "formula" in serializer.errors

    def test_formula_with_exactly_10_operations_accepted(self, machine):
        operations = [{"operator": "add", "parameterKey": f"param_{i}"} for i in range(10)]
        data = {
            "name": "MaxFormula",
            "display_unit": "units",
            "formula": {"operations": operations},
        }
        serializer = MachineCustomKpiSerializer(data=data, context={"machine": machine})
        assert serializer.is_valid(), serializer.errors

    def test_formula_with_invalid_operator_rejected(self, machine):
        data = {
            "name": "BadOp",
            "display_unit": "kg",
            "formula": {"operations": [{"operator": "modulo", "parameterKey": "pressure"}]},
        }
        serializer = MachineCustomKpiSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "formula" in serializer.errors

    def test_formula_with_missing_parameter_key_rejected(self, machine):
        data = {
            "name": "NoKey",
            "display_unit": "kg",
            "formula": {"operations": [{"operator": "add"}]},
        }
        serializer = MachineCustomKpiSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "formula" in serializer.errors

    def test_formula_not_dict_rejected(self, machine):
        data = {
            "name": "NotDict",
            "display_unit": "kg",
            "formula": "invalid",
        }
        serializer = MachineCustomKpiSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "formula" in serializer.errors

    def test_duplicate_kpi_name_rejected(self, machine):
        MachineCustomKpi.objects.create(
            machine=machine,
            name="Efficiency",
            display_unit="%",
            formula={"operations": [{"operator": "add", "parameterKey": "x"}]},
        )
        data = {
            "name": "efficiency",  # case-insensitive match
            "display_unit": "ratio",
            "formula": {"operations": [{"operator": "add", "parameterKey": "y"}]},
        }
        serializer = MachineCustomKpiSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()

    def test_unique_kpi_name_accepted(self, machine):
        MachineCustomKpi.objects.create(
            machine=machine,
            name="Efficiency",
            display_unit="%",
            formula={"operations": [{"operator": "add", "parameterKey": "x"}]},
        )
        data = {
            "name": "Throughput",
            "display_unit": "units/hr",
            "formula": {"operations": [{"operator": "multiply", "parameterKey": "rate"}]},
        }
        serializer = MachineCustomKpiSerializer(data=data, context={"machine": machine})
        assert serializer.is_valid(), serializer.errors

    def test_name_too_long_rejected(self, machine):
        data = {
            "name": "x" * 51,
            "display_unit": "kg",
            "formula": {"operations": []},
        }
        serializer = MachineCustomKpiSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "name" in serializer.errors

    def test_display_unit_too_long_rejected(self, machine):
        data = {
            "name": "Valid",
            "display_unit": "x" * 21,
            "formula": {"operations": []},
        }
        serializer = MachineCustomKpiSerializer(data=data, context={"machine": machine})
        assert not serializer.is_valid()
        assert "display_unit" in serializer.errors


# ──────────────────────────────────────────────────────────────────────────────
# MachineObservationSerializer tests
# ──────────────────────────────────────────────────────────────────────────────


class TestMachineObservationSerializer:
    @pytest.fixture
    def machine_with_params(self, machine):
        """Create a machine with various parameter types."""
        MachineParameter.objects.create(
            machine=machine, key="temperature", data_type="number", required=True, order=0
        )
        MachineParameter.objects.create(
            machine=machine, key="notes", data_type="text", required=False, order=1
        )
        MachineParameter.objects.create(
            machine=machine, key="active", data_type="boolean", required=True, order=2
        )
        MachineParameter.objects.create(
            machine=machine, key="inspection_date", data_type="date", required=False, order=3
        )
        MachineParameter.objects.create(
            machine=machine,
            key="status",
            data_type="selection",
            options=["good", "fair", "poor"],
            required=True,
            order=4,
        )
        return machine

    def test_valid_observation_accepted(self, machine_with_params):
        data = {
            "values": {
                "temperature": 42.5,
                "notes": "All good",
                "active": True,
                "inspection_date": "2024-06-15",
                "status": "good",
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert serializer.is_valid(), serializer.errors

    def test_missing_required_param_rejected(self, machine_with_params):
        data = {
            "values": {
                "notes": "Missing temperature and active and status",
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert not serializer.is_valid()
        errors = serializer.errors["values"]
        assert "temperature" in errors
        assert "active" in errors
        assert "status" in errors

    def test_unknown_param_rejected(self, machine_with_params):
        data = {
            "values": {
                "temperature": 42.5,
                "active": True,
                "status": "good",
                "unknown_field": "value",
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert not serializer.is_valid()
        errors = serializer.errors["values"]
        assert "unknown_field" in errors

    def test_wrong_type_number_rejected(self, machine_with_params):
        data = {
            "values": {
                "temperature": "not a number",
                "active": True,
                "status": "good",
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert not serializer.is_valid()
        errors = serializer.errors["values"]
        assert "temperature" in errors

    def test_wrong_type_boolean_rejected(self, machine_with_params):
        data = {
            "values": {
                "temperature": 42.5,
                "active": "yes",  # should be boolean
                "status": "good",
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert not serializer.is_valid()
        errors = serializer.errors["values"]
        assert "active" in errors

    def test_invalid_date_format_rejected(self, machine_with_params):
        data = {
            "values": {
                "temperature": 42.5,
                "active": True,
                "status": "good",
                "inspection_date": "15/06/2024",  # invalid format
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert not serializer.is_valid()
        errors = serializer.errors["values"]
        assert "inspection_date" in errors

    def test_valid_date_accepted(self, machine_with_params):
        data = {
            "values": {
                "temperature": 42.5,
                "active": True,
                "status": "good",
                "inspection_date": "2024-12-31",
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert serializer.is_valid(), serializer.errors

    def test_invalid_selection_option_rejected(self, machine_with_params):
        data = {
            "values": {
                "temperature": 42.5,
                "active": True,
                "status": "excellent",  # not in options
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert not serializer.is_valid()
        errors = serializer.errors["values"]
        assert "status" in errors

    def test_valid_selection_option_accepted(self, machine_with_params):
        data = {
            "values": {
                "temperature": 42.5,
                "active": True,
                "status": "fair",
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert serializer.is_valid(), serializer.errors

    def test_optional_param_null_accepted(self, machine_with_params):
        data = {
            "values": {
                "temperature": 42.5,
                "active": True,
                "status": "good",
                "notes": None,  # optional param set to null
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert serializer.is_valid(), serializer.errors

    def test_required_param_null_rejected(self, machine_with_params):
        data = {
            "values": {
                "temperature": None,  # required param set to null
                "active": True,
                "status": "good",
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert not serializer.is_valid()
        errors = serializer.errors["values"]
        assert "temperature" in errors

    def test_integer_accepted_for_number_type(self, machine_with_params):
        data = {
            "values": {
                "temperature": 42,  # int is valid for number type
                "active": True,
                "status": "good",
            }
        }
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert serializer.is_valid(), serializer.errors

    def test_values_not_dict_rejected(self, machine_with_params):
        data = {"values": [1, 2, 3]}
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(machine_with_params.id)}
        )
        assert not serializer.is_valid()
        assert "values" in serializer.errors

    def test_nonexistent_machine_rejected(self):
        import uuid

        data = {"values": {"key": "value"}}
        serializer = MachineObservationSerializer(
            data=data, context={"machine_id": str(uuid.uuid4())}
        )
        assert not serializer.is_valid()
        assert "values" in serializer.errors


# ──────────────────────────────────────────────────────────────────────────────
# InventoryChangeSerializer tests
# ──────────────────────────────────────────────────────────────────────────────


class TestInventoryChangeSerializer:
    @pytest.fixture
    def inventory_config(self, tenant, layout):
        from apps.spatial.models import InventoryConfiguration

        return InventoryConfiguration.objects.create(
            tenant=tenant,
            layout=layout,
            storage_capacity=10000,
            capacity_unit="kilograms",
            materials=[
                {"id": "mat-001", "name": "Steel", "unit": "kilograms", "initialQuantity": 500},
                {"id": "mat-002", "name": "Copper", "unit": "kilograms", "initialQuantity": 200},
            ],
        )

    def test_valid_inbound_change_accepted(self, inventory_config):
        from apps.spatial.serializers import InventoryChangeSerializer

        data = {"material_id": "mat-001", "direction": "inbound", "quantity": "100.00"}
        serializer = InventoryChangeSerializer(data=data, context={"inventory": inventory_config})
        assert serializer.is_valid(), serializer.errors

    def test_valid_outbound_within_stock_accepted(self, inventory_config):
        from apps.spatial.serializers import InventoryChangeSerializer

        data = {"material_id": "mat-001", "direction": "outbound", "quantity": "100.00"}
        serializer = InventoryChangeSerializer(data=data, context={"inventory": inventory_config})
        assert serializer.is_valid(), serializer.errors

    def test_outbound_exceeding_stock_rejected(self, inventory_config):
        from apps.spatial.serializers import InventoryChangeSerializer

        data = {"material_id": "mat-001", "direction": "outbound", "quantity": "600.00"}
        serializer = InventoryChangeSerializer(data=data, context={"inventory": inventory_config})
        assert not serializer.is_valid()
        assert "quantity" in serializer.errors

    def test_outbound_exactly_at_stock_accepted(self, inventory_config):
        from apps.spatial.serializers import InventoryChangeSerializer

        data = {"material_id": "mat-001", "direction": "outbound", "quantity": "500.00"}
        serializer = InventoryChangeSerializer(data=data, context={"inventory": inventory_config})
        assert serializer.is_valid(), serializer.errors

    def test_outbound_considers_previous_changes(self, tenant, inventory_config):
        from apps.spatial.models import InventoryChange
        from apps.spatial.serializers import InventoryChangeSerializer

        # Add some inbound stock
        InventoryChange.objects.create(
            tenant=tenant,
            inventory=inventory_config,
            material_id="mat-002",
            direction="inbound",
            quantity=100,
        )
        # Current stock for mat-002: 200 (initial) + 100 (inbound) = 300
        # Removing 300 should be valid
        data = {"material_id": "mat-002", "direction": "outbound", "quantity": "300.00"}
        serializer = InventoryChangeSerializer(data=data, context={"inventory": inventory_config})
        assert serializer.is_valid(), serializer.errors

    def test_outbound_considers_previous_outbound(self, tenant, inventory_config):
        from apps.spatial.models import InventoryChange
        from apps.spatial.serializers import InventoryChangeSerializer

        # Remove some stock first
        InventoryChange.objects.create(
            tenant=tenant,
            inventory=inventory_config,
            material_id="mat-001",
            direction="outbound",
            quantity=400,
        )
        # Current stock for mat-001: 500 (initial) - 400 (outbound) = 100
        # Removing 150 should fail
        data = {"material_id": "mat-001", "direction": "outbound", "quantity": "150.00"}
        serializer = InventoryChangeSerializer(data=data, context={"inventory": inventory_config})
        assert not serializer.is_valid()
        assert "quantity" in serializer.errors

    def test_invalid_material_id_rejected(self, inventory_config):
        from apps.spatial.serializers import InventoryChangeSerializer

        data = {"material_id": "nonexistent", "direction": "inbound", "quantity": "50.00"}
        serializer = InventoryChangeSerializer(data=data, context={"inventory": inventory_config})
        assert not serializer.is_valid()
        assert "material_id" in serializer.errors

    def test_invalid_direction_rejected(self, inventory_config):
        from apps.spatial.serializers import InventoryChangeSerializer

        data = {"material_id": "mat-001", "direction": "sideways", "quantity": "50.00"}
        serializer = InventoryChangeSerializer(data=data, context={"inventory": inventory_config})
        assert not serializer.is_valid()
        assert "direction" in serializer.errors

    def test_zero_quantity_rejected(self, inventory_config):
        from apps.spatial.serializers import InventoryChangeSerializer

        data = {"material_id": "mat-001", "direction": "inbound", "quantity": "0.00"}
        serializer = InventoryChangeSerializer(data=data, context={"inventory": inventory_config})
        assert not serializer.is_valid()
        assert "quantity" in serializer.errors

    def test_quantity_exceeding_max_rejected(self, inventory_config):
        from apps.spatial.serializers import InventoryChangeSerializer

        data = {"material_id": "mat-001", "direction": "inbound", "quantity": "1000000000.00"}
        serializer = InventoryChangeSerializer(data=data, context={"inventory": inventory_config})
        assert not serializer.is_valid()
        assert "quantity" in serializer.errors


# ──────────────────────────────────────────────────────────────────────────────
# DispatchEventSerializer tests
# ──────────────────────────────────────────────────────────────────────────────


class TestDispatchEventSerializer:
    @pytest.fixture
    def dispatch_config(self, tenant, layout):
        from apps.spatial.models import DispatchConfiguration

        return DispatchConfiguration.objects.create(
            tenant=tenant,
            layout=layout,
            products=[
                {"id": "prod-001", "name": "Widget A", "unit": "units"},
                {"id": "prod-002", "name": "Widget B", "unit": "kilograms"},
            ],
        )

    def test_valid_dispatch_event_accepted(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "prod-001",
            "event_type": "arrival",
            "quantity": "100.00",
            "unit": "units",
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert serializer.is_valid(), serializer.errors

    def test_valid_dispatched_event_accepted(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "prod-002",
            "event_type": "dispatched",
            "quantity": "50.50",
            "unit": "kilograms",
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert serializer.is_valid(), serializer.errors

    def test_invalid_product_id_rejected(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "nonexistent",
            "event_type": "arrival",
            "quantity": "100.00",
            "unit": "units",
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert not serializer.is_valid()
        assert "product_id" in serializer.errors

    def test_invalid_event_type_rejected(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "prod-001",
            "event_type": "returned",
            "quantity": "100.00",
            "unit": "units",
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert not serializer.is_valid()
        assert "event_type" in serializer.errors

    def test_quantity_below_minimum_rejected(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "prod-001",
            "event_type": "arrival",
            "quantity": "0.001",
            "unit": "units",
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert not serializer.is_valid()
        assert "quantity" in serializer.errors

    def test_quantity_zero_rejected(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "prod-001",
            "event_type": "arrival",
            "quantity": "0.00",
            "unit": "units",
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert not serializer.is_valid()
        assert "quantity" in serializer.errors

    def test_quantity_above_maximum_rejected(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "prod-001",
            "event_type": "arrival",
            "quantity": "1000000000.00",
            "unit": "units",
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert not serializer.is_valid()
        assert "quantity" in serializer.errors

    def test_quantity_at_minimum_accepted(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "prod-001",
            "event_type": "arrival",
            "quantity": "0.01",
            "unit": "units",
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert serializer.is_valid(), serializer.errors

    def test_quantity_at_maximum_accepted(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "prod-001",
            "event_type": "arrival",
            "quantity": "999999999.99",
            "unit": "units",
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert serializer.is_valid(), serializer.errors

    def test_unit_mismatch_rejected(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "prod-001",  # configured with "units"
            "event_type": "arrival",
            "quantity": "100.00",
            "unit": "kilograms",  # doesn't match configured "units"
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert not serializer.is_valid()
        assert "unit" in serializer.errors

    def test_unit_matching_product_accepted(self, dispatch_config):
        from apps.spatial.serializers import DispatchEventSerializer

        data = {
            "product_id": "prod-002",  # configured with "kilograms"
            "event_type": "dispatched",
            "quantity": "75.00",
            "unit": "kilograms",
        }
        serializer = DispatchEventSerializer(data=data, context={"dispatch": dispatch_config})
        assert serializer.is_valid(), serializer.errors
