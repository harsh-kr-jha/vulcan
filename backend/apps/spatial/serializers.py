import re
from datetime import date

from rest_framework import serializers

from apps.spatial.models import (
    DispatchConfiguration,
    DispatchEvent,
    FactoryLayout,
    InventoryChange,
    InventoryConfiguration,
    MachineConnection,
    MachineCustomKpi,
    MachineObservation,
    MachineParameter,
    ParamDataType,
    SpatialMachine,
)

PARAM_KEY_REGEX = re.compile(r"^[a-zA-Z0-9_]+$")


class MachineParameterSerializer(serializers.ModelSerializer):
    class Meta:
        model = MachineParameter
        fields = ["id", "key", "data_type", "options", "required", "order"]
        read_only_fields = ["id"]

    def validate_key(self, value):
        """Validate key matches alphanumeric/underscore pattern and length."""
        if not value or len(value) > 64:
            raise serializers.ValidationError("Key must be between 1 and 64 characters.")
        if not PARAM_KEY_REGEX.match(value):
            raise serializers.ValidationError(
                "Key must contain only alphanumeric characters and underscores."
            )
        return value

    def validate(self, attrs):
        """Validate case-insensitive key uniqueness within the machine."""
        key = attrs.get("key", "")
        machine = self.context.get("machine")

        if machine and key:
            existing_keys = MachineParameter.objects.filter(machine=machine).values_list(
                "key", flat=True
            )

            # Exclude current instance on update
            if self.instance:
                existing_keys = existing_keys.exclude(pk=self.instance.pk)

            for existing_key in existing_keys:
                if existing_key.lower() == key.lower():
                    raise serializers.ValidationError(
                        {
                            "key": (
                                f"Parameter key '{key}' already exists "
                                f"(case-insensitive match with '{existing_key}')."
                            )
                        }
                    )

        return attrs


class MachineCustomKpiSerializer(serializers.ModelSerializer):
    class Meta:
        model = MachineCustomKpi
        fields = ["id", "name", "display_unit", "formula"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        """Validate name length."""
        if not value or len(value) > 50:
            raise serializers.ValidationError("Name must be between 1 and 50 characters.")
        return value

    def validate_display_unit(self, value):
        """Validate display unit length."""
        if not value or len(value) > 20:
            raise serializers.ValidationError("Display unit must be between 1 and 20 characters.")
        return value

    def validate_formula(self, value):
        """Validate formula has max 10 operations."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Formula must be a JSON object.")

        operations = value.get("operations", [])
        if not isinstance(operations, list):
            raise serializers.ValidationError("Formula 'operations' must be a list.")

        if len(operations) > 10:
            raise serializers.ValidationError("Formula cannot have more than 10 operations.")

        valid_operators = {"add", "subtract", "multiply", "divide"}
        for i, op in enumerate(operations):
            if not isinstance(op, dict):
                raise serializers.ValidationError(f"Operation at index {i} must be an object.")
            operator = op.get("operator")
            param_key = op.get("parameterKey")
            if operator not in valid_operators:
                raise serializers.ValidationError(
                    f"Operation at index {i} has invalid operator '{operator}'. "
                    f"Must be one of: {', '.join(sorted(valid_operators))}."
                )
            if not param_key or not isinstance(param_key, str):
                raise serializers.ValidationError(
                    f"Operation at index {i} must have a non-empty 'parameterKey' string."
                )

        return value

    def validate(self, attrs):
        """Validate name uniqueness within the machine."""
        name = attrs.get("name", "")
        machine = self.context.get("machine")

        if machine and name:
            existing_names = MachineCustomKpi.objects.filter(machine=machine).values_list(
                "name", flat=True
            )

            # Exclude current instance on update
            if self.instance:
                existing_names = existing_names.exclude(pk=self.instance.pk)

            for existing_name in existing_names:
                if existing_name.lower() == name.lower():
                    raise serializers.ValidationError(
                        {"name": f"KPI name '{name}' already exists for this machine."}
                    )

        return attrs


class SpatialMachineSerializer(serializers.ModelSerializer):
    # id is optional on input (client can send a pre-generated UUID for connection refs)
    id = serializers.UUIDField(required=False)
    parameters = MachineParameterSerializer(many=True, required=False, default=[])
    custom_kpis = MachineCustomKpiSerializer(many=True, required=False, default=[])

    class Meta:
        model = SpatialMachine
        fields = [
            "id",
            "name",
            "position_x",
            "position_y",
            "size_width",
            "size_height",
            "inputs",
            "outputs",
            "status",
            "display_order",
            "parameters",
            "custom_kpis",
        ]


class MachineConnectionSerializer(serializers.ModelSerializer):
    source = serializers.UUIDField(source="source_id", required=True)
    target = serializers.UUIDField(source="target_id", required=True)

    class Meta:
        model = MachineConnection
        fields = [
            "id",
            "source",
            "target",
            "name",
            "description",
            "material_type",
            "quantity_per_cycle",
            "input_spec",
            "output_spec",
        ]
        read_only_fields = ["id"]


class InventoryConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryConfiguration
        fields = ["id", "storage_capacity", "capacity_unit", "materials"]
        read_only_fields = ["id"]


class DispatchConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DispatchConfiguration
        fields = ["id", "products"]
        read_only_fields = ["id"]


class FactoryLayoutSerializer(serializers.ModelSerializer):
    machines = SpatialMachineSerializer(many=True, required=False, default=[])
    connections = MachineConnectionSerializer(many=True, required=False, default=[])
    inventory_config = InventoryConfigurationSerializer(required=False, allow_null=True)
    dispatch_config = DispatchConfigurationSerializer(required=False, allow_null=True)

    class Meta:
        model = FactoryLayout
        fields = [
            "id",
            "factory",
            "floor_width",
            "floor_height",
            "unit_system",
            "is_active",
            "machines",
            "connections",
            "inventory_config",
            "dispatch_config",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        """Validate machine positions within floor bounds and connection references."""
        floor_width = attrs.get("floor_width", getattr(self.instance, "floor_width", None))
        floor_height = attrs.get("floor_height", getattr(self.instance, "floor_height", None))
        machines_data = attrs.get("machines", [])
        connections_data = attrs.get("connections", [])

        # Validate machine positions are within floor bounds
        if floor_width is not None and floor_height is not None:
            for machine_data in machines_data:
                pos_x = machine_data.get("position_x", 0)
                pos_y = machine_data.get("position_y", 0)
                if pos_x >= int(floor_width) or pos_y >= int(floor_height):
                    raise serializers.ValidationError(
                        {
                            "machines": (
                                f"Position ({pos_x}, {pos_y}) is outside "
                                f"floor dimensions ({int(floor_width)}x{int(floor_height)})"
                            )
                        }
                    )

        # Validate duplicate positions
        positions = set()
        for machine_data in machines_data:
            pos = (machine_data.get("position_x"), machine_data.get("position_y"))
            if pos in positions:
                raise serializers.ValidationError(
                    {
                        "machines": (
                            f"Duplicate machine position ({pos[0]}, {pos[1]}). "
                            f"Each grid position can only hold one machine."
                        )
                    }
                )
            positions.add(pos)

        # Validate connection source/target references
        if connections_data:
            valid_machine_ids = set()

            # If updating an existing layout and machines not being replaced,
            # include existing machine IDs
            if self.instance and not machines_data:
                existing_ids = set(self.instance.machines.values_list("id", flat=True))
                valid_machine_ids.update(existing_ids)

            # Include IDs from machines being submitted in the same request
            for machine_data in machines_data:
                machine_id = machine_data.get("id")
                if machine_id:
                    valid_machine_ids.add(machine_id)

            # Validate that all connection references point to known machines
            if valid_machine_ids:
                for conn_data in connections_data:
                    source_id = conn_data.get("source_id")
                    target_id = conn_data.get("target_id")

                    if source_id and source_id not in valid_machine_ids:
                        raise serializers.ValidationError(
                            {
                                "connections": (
                                    f"Connection source references machine ID "
                                    f"'{source_id}' which does not exist in this layout."
                                )
                            }
                        )
                    if target_id and target_id not in valid_machine_ids:
                        raise serializers.ValidationError(
                            {
                                "connections": (
                                    f"Connection target references machine ID "
                                    f"'{target_id}' which does not exist in this layout."
                                )
                            }
                        )

        return attrs

    def create(self, validated_data):
        """Create a full layout with nested machines, connections, inventory, dispatch."""
        machines_data = validated_data.pop("machines", [])
        connections_data = validated_data.pop("connections", [])
        inventory_data = validated_data.pop("inventory_config", None)
        dispatch_data = validated_data.pop("dispatch_config", None)

        layout = FactoryLayout.objects.create(**validated_data)
        tenant = validated_data.get("tenant")

        # Create machines with their nested parameters and KPIs
        machine_id_map = {}  # maps client-provided UUIDs to created machine objects
        for machine_data in machines_data:
            parameters_data = machine_data.pop("parameters", [])
            custom_kpis_data = machine_data.pop("custom_kpis", [])
            client_id = machine_data.pop("id", None)

            # Use client-provided ID as the PK if given
            create_kwargs = {"layout": layout, "tenant": tenant, **machine_data}
            if client_id:
                create_kwargs["id"] = client_id

            machine = SpatialMachine.objects.create(**create_kwargs)

            if client_id:
                machine_id_map[client_id] = machine
            else:
                machine_id_map[machine.id] = machine

            # Create parameters
            for param_data in parameters_data:
                param_data.pop("id", None)
                MachineParameter.objects.create(machine=machine, **param_data)

            # Create custom KPIs
            for kpi_data in custom_kpis_data:
                kpi_data.pop("id", None)
                MachineCustomKpi.objects.create(machine=machine, **kpi_data)

        # Create connections, resolving source/target references
        for conn_data in connections_data:
            conn_data.pop("id", None)
            source_id = conn_data.pop("source_id", None)
            target_id = conn_data.pop("target_id", None)

            source = machine_id_map.get(source_id)
            target = machine_id_map.get(target_id)

            if source and target:
                MachineConnection.objects.create(
                    layout=layout,
                    tenant=tenant,
                    source=source,
                    target=target,
                    **conn_data,
                )

        # Create inventory configuration if provided
        if inventory_data:
            inventory_data.pop("id", None)
            InventoryConfiguration.objects.create(layout=layout, tenant=tenant, **inventory_data)

        # Create dispatch configuration if provided
        if dispatch_data:
            dispatch_data.pop("id", None)
            DispatchConfiguration.objects.create(layout=layout, tenant=tenant, **dispatch_data)

        return layout

    def update(self, instance, validated_data):
        """Update layout with full replacement of nested objects."""
        machines_data = validated_data.pop("machines", None)
        connections_data = validated_data.pop("connections", None)
        inventory_data = validated_data.pop("inventory_config", None)
        dispatch_data = validated_data.pop("dispatch_config", None)

        # Update layout scalar fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        tenant = instance.tenant

        # Replace machines if provided (full replacement strategy)
        if machines_data is not None:
            # Delete existing machines (cascades to parameters, KPIs, connections)
            instance.machines.all().delete()

            machine_id_map = {}
            for machine_data in machines_data:
                parameters_data = machine_data.pop("parameters", [])
                custom_kpis_data = machine_data.pop("custom_kpis", [])
                client_id = machine_data.pop("id", None)

                create_kwargs = {"layout": instance, "tenant": tenant, **machine_data}
                if client_id:
                    create_kwargs["id"] = client_id

                machine = SpatialMachine.objects.create(**create_kwargs)

                if client_id:
                    machine_id_map[client_id] = machine
                else:
                    machine_id_map[machine.id] = machine

                for param_data in parameters_data:
                    param_data.pop("id", None)
                    MachineParameter.objects.create(machine=machine, **param_data)

                for kpi_data in custom_kpis_data:
                    kpi_data.pop("id", None)
                    MachineCustomKpi.objects.create(machine=machine, **kpi_data)

            # Replace connections if provided alongside machines
            if connections_data is not None:
                instance.connections.all().delete()
                for conn_data in connections_data:
                    conn_data.pop("id", None)
                    source_id = conn_data.pop("source_id", None)
                    target_id = conn_data.pop("target_id", None)

                    source = machine_id_map.get(source_id)
                    target = machine_id_map.get(target_id)

                    if source and target:
                        MachineConnection.objects.create(
                            layout=instance,
                            tenant=tenant,
                            source=source,
                            target=target,
                            **conn_data,
                        )
        elif connections_data is not None:
            # Connections updated without machines — resolve against existing machines
            instance.connections.all().delete()
            for conn_data in connections_data:
                conn_data.pop("id", None)
                source_id = conn_data.pop("source_id", None)
                target_id = conn_data.pop("target_id", None)

                if source_id and target_id:
                    # Verify machines exist in this layout
                    source = instance.machines.filter(id=source_id).first()
                    target = instance.machines.filter(id=target_id).first()
                    if source and target:
                        MachineConnection.objects.create(
                            layout=instance,
                            tenant=tenant,
                            source=source,
                            target=target,
                            **conn_data,
                        )

        # Update inventory config
        if inventory_data is not None:
            inventory_data.pop("id", None)
            if hasattr(instance, "inventory_config"):
                try:
                    existing_inv = instance.inventory_config
                    for attr, value in inventory_data.items():
                        setattr(existing_inv, attr, value)
                    existing_inv.save()
                except InventoryConfiguration.DoesNotExist:
                    InventoryConfiguration.objects.create(
                        layout=instance, tenant=tenant, **inventory_data
                    )
            else:
                InventoryConfiguration.objects.create(
                    layout=instance, tenant=tenant, **inventory_data
                )

        # Update dispatch config
        if dispatch_data is not None:
            dispatch_data.pop("id", None)
            if hasattr(instance, "dispatch_config"):
                try:
                    existing_disp = instance.dispatch_config
                    for attr, value in dispatch_data.items():
                        setattr(existing_disp, attr, value)
                    existing_disp.save()
                except DispatchConfiguration.DoesNotExist:
                    DispatchConfiguration.objects.create(
                        layout=instance, tenant=tenant, **dispatch_data
                    )
            else:
                DispatchConfiguration.objects.create(
                    layout=instance, tenant=tenant, **dispatch_data
                )

        return instance


class MachineObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = MachineObservation
        fields = ["id", "machine", "values", "submitted_at", "submitted_by"]
        read_only_fields = ["id", "machine", "submitted_at", "submitted_by"]

    def validate_values(self, value):
        """Validate submitted values against the machine's parameter definitions."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Values must be a JSON object.")

        # Get machine from context (set by view via perform_create kwargs)
        machine_id = self.context.get("machine_id")
        if not machine_id:
            # Fallback: try to get from initial_data
            machine_id = self.initial_data.get("machine")

        if not machine_id:
            return value

        try:
            machine = SpatialMachine.objects.get(pk=machine_id)
        except SpatialMachine.DoesNotExist as err:
            raise serializers.ValidationError("Referenced machine does not exist.") from err

        parameters = {p.key: p for p in machine.parameters.all()}
        errors = {}

        # Build set of valid IO field keys from inputs/outputs
        io_keys = set()
        for io_item in machine.inputs or []:
            if isinstance(io_item, dict) and io_item.get("id"):
                io_keys.add(f"input_{io_item['id']}")
        for io_item in machine.outputs or []:
            if isinstance(io_item, dict) and io_item.get("id"):
                io_keys.add(f"output_{io_item['id']}")

        # Check for required parameters
        for key, param in parameters.items():
            if param.required and key not in value:
                errors[key] = f"Required parameter '{key}' is missing."

        # Validate each submitted value against its parameter definition
        for key, submitted_value in value.items():
            if key in io_keys:
                # IO fields are always valid (number type, not strictly validated)
                continue
            if key not in parameters:
                errors[key] = f"Unknown parameter '{key}'."
                continue

            param = parameters[key]
            validation_error = self._validate_value_type(key, submitted_value, param)
            if validation_error:
                errors[key] = validation_error

        if errors:
            raise serializers.ValidationError(errors)

        return value

    def _validate_value_type(self, key, value, param):
        """Validate a single value against its parameter data type definition."""
        # Allow None for non-required parameters
        if value is None:
            if param.required:
                return f"Required parameter '{key}' cannot be null."
            return None

        data_type = param.data_type

        if data_type == ParamDataType.NUMBER:
            if not isinstance(value, (int, float)):
                return f"Parameter '{key}' expects a number, got {type(value).__name__}."
            return None

        elif data_type == ParamDataType.TEXT:
            if not isinstance(value, str):
                return f"Parameter '{key}' expects text, got {type(value).__name__}."
            return None

        elif data_type == ParamDataType.BOOLEAN:
            if not isinstance(value, bool):
                return f"Parameter '{key}' expects a boolean, got {type(value).__name__}."
            return None

        elif data_type == ParamDataType.DATE:
            if not isinstance(value, str):
                return (
                    f"Parameter '{key}' expects a date string (YYYY-MM-DD), "
                    f"got {type(value).__name__}."
                )
            try:
                date.fromisoformat(value)
            except (ValueError, TypeError):
                return f"Parameter '{key}' has an invalid date format. Expected YYYY-MM-DD."
            return None

        elif data_type == ParamDataType.SELECTION:
            if not isinstance(value, str):
                return f"Parameter '{key}' expects a selection string, got {type(value).__name__}."
            valid_options = param.options or []
            if valid_options and value not in valid_options:
                return (
                    f"Parameter '{key}' value '{value}' is not a valid option. "
                    f"Valid options: {valid_options}."
                )
            return None

        return None


class MachineEntrySchemaSerializer(serializers.Serializer):
    """Serializes machine parameter definitions for the data entry page."""

    id = serializers.UUIDField()
    key = serializers.CharField()
    data_type = serializers.CharField()
    options = serializers.ListField(child=serializers.CharField(), required=False)
    required = serializers.BooleanField()
    order = serializers.IntegerField()


class InventoryChangeSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryChange
        fields = [
            "id",
            "material_id",
            "direction",
            "quantity",
            "submitted_at",
            "submitted_by",
        ]
        read_only_fields = ["id", "submitted_at", "submitted_by"]

    def validate_direction(self, value):
        if value not in ("inbound", "outbound"):
            raise serializers.ValidationError("Direction must be 'inbound' or 'outbound'.")
        return value

    def validate_quantity(self, value):
        from decimal import Decimal

        if value == 0:
            raise serializers.ValidationError("Quantity must be non-zero.")
        max_val = Decimal("999999999.99")
        if value < -max_val or value > max_val:
            raise serializers.ValidationError(
                "Quantity must be between -999999999.99 and 999999999.99."
            )
        return value

    def validate_material_id(self, value):
        inventory = self.context.get("inventory")
        if not inventory:
            return value
        materials = inventory.materials or []
        valid_ids = {m.get("id") for m in materials if isinstance(m, dict)}
        if value not in valid_ids:
            raise serializers.ValidationError(
                f"Material '{value}' does not exist in the inventory configuration."
            )
        return value

    def validate(self, attrs):
        direction = attrs.get("direction")
        quantity = attrs.get("quantity")
        material_id = attrs.get("material_id")
        inventory = self.context.get("inventory")

        if direction == "outbound" and inventory and quantity is not None:
            self._validate_stock_available(inventory, material_id, quantity)

        return attrs

    def _validate_stock_available(self, inventory, material_id, removal_quantity):
        from decimal import Decimal

        from django.db.models import Sum

        # Find initial quantity from materials config
        materials = inventory.materials or []
        initial_quantity = Decimal("0")
        for material in materials:
            if isinstance(material, dict) and material.get("id") == material_id:
                initial_quantity = Decimal(str(material.get("initialQuantity", 0)))
                break

        # Compute current stock: initial + sum(inbound) - sum(outbound)
        changes = InventoryChange.objects.filter(inventory=inventory, material_id=material_id)
        inbound_total = changes.filter(direction="inbound").aggregate(total=Sum("quantity"))[
            "total"
        ] or Decimal("0")
        outbound_total = changes.filter(direction="outbound").aggregate(total=Sum("quantity"))[
            "total"
        ] or Decimal("0")
        current_stock = initial_quantity + inbound_total - outbound_total

        if removal_quantity > current_stock:
            raise serializers.ValidationError(
                {
                    "quantity": (
                        f"Insufficient stock. Current stock for this material is "
                        f"{current_stock}. Cannot remove {removal_quantity}."
                    )
                }
            )


class DispatchEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DispatchEvent
        fields = [
            "id",
            "product_id",
            "event_type",
            "quantity",
            "unit",
            "submitted_at",
            "submitted_by",
        ]
        read_only_fields = ["id", "submitted_at", "submitted_by"]

    def validate_event_type(self, value):
        if value not in ("arrival", "dispatched"):
            raise serializers.ValidationError("Event type must be 'arrival' or 'dispatched'.")
        return value

    def validate_quantity(self, value):
        from decimal import Decimal

        min_val = Decimal("0.01")
        max_val = Decimal("999999999.99")
        if value < min_val or value > max_val:
            raise serializers.ValidationError("Quantity must be between 0.01 and 999999999.99.")
        return value

    def validate_product_id(self, value):
        dispatch = self.context.get("dispatch")
        if not dispatch:
            return value
        products = dispatch.products or []
        valid_ids = {p.get("id") for p in products if isinstance(p, dict)}
        if value not in valid_ids:
            raise serializers.ValidationError(
                f"Product '{value}' does not exist in the dispatch configuration."
            )
        return value

    def validate(self, attrs):
        dispatch = self.context.get("dispatch")
        if dispatch and attrs.get("product_id") and attrs.get("unit"):
            self._validate_unit_matches_product(dispatch, attrs["product_id"], attrs["unit"])
        return attrs

    def _validate_unit_matches_product(self, dispatch, product_id, unit):
        products = dispatch.products or []
        for product in products:
            if isinstance(product, dict) and product.get("id") == product_id:
                expected_unit = product.get("unit")
                if expected_unit and unit != expected_unit:
                    raise serializers.ValidationError(
                        {
                            "unit": (
                                f"Unit '{unit}' does not match the configured unit "
                                f"'{expected_unit}' for product '{product_id}'."
                            )
                        }
                    )
                break
