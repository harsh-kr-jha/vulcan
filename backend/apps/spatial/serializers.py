import math
import re
from datetime import date

from django.db import models, transaction
from rest_framework import serializers

from apps.spatial.models import (
    DispatchConfiguration,
    DispatchEvent,
    FactoryLayout,
    FactoryModelAsset,
    FactoryZone,
    InventoryChange,
    InventoryConfiguration,
    MachineConnection,
    MachineCustomKpi,
    MachineImageAsset,
    MachineModelAsset,
    MachineObservation,
    MachineParameter,
    ParamDataType,
    SpatialMachine,
    default_status_visualization,
)
from apps.tenancy.models import FactoryMaster

PARAM_KEY_REGEX = re.compile(r"^[a-zA-Z0-9_]+$")
HEX_COLOR_REGEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def validate_status_visualization(value):
    if not isinstance(value, dict):
        raise serializers.ValidationError("Status visualization settings must be an object.")
    defaults = default_status_visualization()
    unknown = set(value) - set(defaults)
    if unknown:
        raise serializers.ValidationError(
            f"Unknown status visualization setting: {sorted(unknown)[0]}."
        )
    merged = {**defaults, **value}
    for key, item in merged.items():
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            raise serializers.ValidationError(f"{key} must be a number.")
    if merged["recentMinutes"] < 1 or merged["persistentMinutes"] <= merged["recentMinutes"]:
        raise serializers.ValidationError("Persistent minutes must be greater than recent minutes.")
    if not 0 <= merged["outOfRangeConfirmationSeconds"] <= 3600:
        raise serializers.ValidationError(
            "Out-of-range confirmation must be between 0 and 3600 seconds."
        )
    if not 5 <= merged["rejectWindowCycles"] <= 100:
        raise serializers.ValidationError("Reject window must contain between 5 and 100 cycles.")
    if not 1 <= merged["rejectMinimumCycles"] <= merged["rejectWindowCycles"]:
        raise serializers.ValidationError("Reject minimum must fit inside the reject window.")
    return merged


def validate_model_transform(value):
    if not isinstance(value, dict):
        raise serializers.ValidationError("Model transform must be an object.")
    allowed = {"elevation", "scale", "rotationY"}
    if set(value) - allowed:
        raise serializers.ValidationError("Use elevation, scale and rotationY only.")
    normalized = {"elevation": 0.0, "scale": 1.0, "rotationY": 0.0}
    for key, raw in value.items():
        try:
            normalized[key] = float(raw)
        except (TypeError, ValueError) as exc:
            raise serializers.ValidationError(f"{key} must be numeric.") from exc
    if not 0.01 <= normalized["scale"] <= 100:
        raise serializers.ValidationError("Model scale must be between 0.01 and 100.")
    if not -1000 <= normalized["elevation"] <= 1000:
        raise serializers.ValidationError("Model elevation is outside the supported range.")
    if not -3600 <= normalized["rotationY"] <= 3600:
        raise serializers.ValidationError("Model rotation is outside the supported range.")
    return normalized


class MachineModelAssetSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = MachineModelAsset
        fields = ["id", "filename", "size_bytes", "checksum_sha256", "download_url"]

    def get_download_url(self, obj):
        version = obj.checksum_sha256[:12]
        return f"/api/backend/api/spatial/machines/{obj.machine_id}/model/?v={version}"


class MachineImageAssetSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = MachineImageAsset
        fields = ["id", "filename", "content_type", "size_bytes", "checksum_sha256", "download_url"]

    def get_download_url(self, obj):
        version = obj.checksum_sha256[:12]
        return f"/api/backend/api/spatial/machines/{obj.machine_id}/image/?v={version}"


class MachineParameterSerializer(serializers.ModelSerializer):
    class Meta:
        model = MachineParameter
        fields = [
            "id",
            "key",
            "label",
            "data_type",
            "unit",
            "semantic",
            "origin",
            "source_field_id",
            "source_schema_version",
            "is_active",
            "options",
            "required",
            "order",
        ]
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
        fields = ["id", "name", "display_unit", "formula", "is_enabled", "disabled_reason"]
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
    data_stream_id = serializers.UUIDField(required=False, allow_null=True, write_only=True)
    data_stream_channel_id = serializers.UUIDField(required=False, allow_null=True, write_only=True)
    stream_binding = serializers.SerializerMethodField()
    process_id = serializers.PrimaryKeyRelatedField(
        source="process",
        queryset=FactoryMaster.objects.all(),
        required=False,
        allow_null=True,
    )
    process = serializers.SerializerMethodField()
    line = serializers.SerializerMethodField()
    model_asset = MachineModelAssetSerializer(read_only=True)
    image_asset = MachineImageAssetSerializer(read_only=True)

    class Meta:
        model = SpatialMachine
        fields = [
            "id",
            "code",
            "name",
            "process_id",
            "process",
            "line",
            "position_x",
            "position_y",
            "size_width",
            "size_height",
            "visual_height",
            "rotation_degrees",
            "representation",
            "block_color",
            "model_transform",
            "model_asset",
            "image_asset",
            "inputs",
            "outputs",
            "status",
            "display_order",
            "is_active",
            "metadata",
            "parameters",
            "custom_kpis",
            "data_stream_id",
            "data_stream_channel_id",
            "stream_binding",
        ]

    def get_process(self, obj):
        if not obj.process_id:
            return None
        return {"id": str(obj.process_id), "name": obj.process.name, "code": obj.process.code}

    def get_line(self, obj):
        line = obj.process.parent if obj.process_id and obj.process.parent_id else None
        return {"id": str(line.id), "name": line.name, "code": line.code} if line else None

    def get_stream_binding(self, obj):
        try:
            binding = obj.stream_binding
        except Exception:
            return None
        return {
            "id": str(binding.id),
            "stream_id": str(binding.channel.stream_id),
            "channel_id": str(binding.channel_id),
            "channel_name": binding.channel.name,
            "status": binding.status,
            "last_received_at": binding.last_received_at,
            "last_error": binding.last_error,
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        process = attrs.get("process", getattr(self.instance, "process", None))
        if process and process.kind != FactoryMaster.Kind.PROCESS:
            raise serializers.ValidationError({"process_id": "Choose a manufacturing process."})
        if attrs.get("rotation_degrees", getattr(self.instance, "rotation_degrees", 0)) not in {
            0,
            90,
            180,
            270,
        }:
            raise serializers.ValidationError(
                {"rotation_degrees": "Use 0, 90, 180 or 270 degrees."}
            )
        if attrs.get("visual_height", getattr(self.instance, "visual_height", 1)) <= 0:
            raise serializers.ValidationError(
                {"visual_height": "Height must be greater than zero."}
            )
        color = attrs.get("block_color", getattr(self.instance, "block_color", "#DBEAFE"))
        if not HEX_COLOR_REGEX.match(color):
            raise serializers.ValidationError(
                {"block_color": "Use a six digit hex color such as #DBEAFE."}
            )
        attrs["block_color"] = color.upper()
        if "model_transform" in attrs:
            attrs["model_transform"] = validate_model_transform(attrs["model_transform"])
        return attrs


class FactoryZoneSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    line_id = serializers.PrimaryKeyRelatedField(
        source="line", queryset=FactoryMaster.objects.all(), required=False, allow_null=True
    )
    line = serializers.SerializerMethodField()

    class Meta:
        model = FactoryZone
        fields = [
            "id",
            "name",
            "zone_type",
            "color",
            "position_x",
            "position_y",
            "width",
            "height",
            "display_order",
            "line_id",
            "line",
        ]

    def get_line(self, obj):
        if not obj.line_id:
            return None
        return {"id": str(obj.line_id), "name": obj.line.name, "code": obj.line.code}

    def validate_color(self, value):
        if not re.match(r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$", value):
            raise serializers.ValidationError("Use a six or eight digit hex color.")
        return value.upper()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("width", 0) <= 0 or attrs.get("height", 0) <= 0:
            raise serializers.ValidationError("Zone width and height must be greater than zero.")
        line = attrs.get("line")
        if line and line.kind != FactoryMaster.Kind.LINE:
            raise serializers.ValidationError({"line_id": "Choose a production line."})
        return attrs


class FactoryModelAssetSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = FactoryModelAsset
        fields = ["id", "filename", "size_bytes", "checksum_sha256", "download_url"]

    def get_download_url(self, obj):
        version = obj.checksum_sha256[:12]
        return f"/api/backend/api/spatial/layouts/{obj.layout_id}/model/?v={version}"


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
            "connection_type",
            "direction",
            "geometry",
            "visual_style",
        ]
        read_only_fields = ["id"]

    def validate_connection_type(self, value):
        allowed = {
            "conveyor",
            "assembly_line",
            "pipe",
            "pickup_drop",
            "material_transfer",
            "inspection_transfer",
            "forklift_route",
            "utility_line",
        }
        if value not in allowed:
            raise serializers.ValidationError("Choose a supported factory connector type.")
        return value

    def validate_direction(self, value):
        if value not in {"forward", "reverse", "bidirectional", "none"}:
            raise serializers.ValidationError("Choose forward, reverse, bidirectional or none.")
        return value

    def validate_geometry(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Connector geometry must be an object.")
        allowed = {
            "sourceOffsetX",
            "sourceOffsetY",
            "targetOffsetX",
            "targetOffsetY",
            "elevation",
            "diameter",
            "curvature",
        }
        if set(value) - allowed:
            raise serializers.ValidationError("Connector geometry contains unsupported properties.")
        normalized = {}
        for key, raw in value.items():
            if isinstance(raw, bool):
                raise serializers.ValidationError(f"{key} must be numeric.")
            try:
                normalized[key] = float(raw)
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError(f"{key} must be numeric.") from exc
            if not math.isfinite(normalized[key]):
                raise serializers.ValidationError(f"{key} must be finite.")
        if not 0 <= normalized.get("elevation", 0.08) <= 100:
            raise serializers.ValidationError("Connector elevation must be between 0 and 100.")
        if not 0.01 <= normalized.get("diameter", 0.12) <= 10:
            raise serializers.ValidationError("Connector diameter must be between 0.01 and 10.")
        if not -100 <= normalized.get("curvature", 0) <= 100:
            raise serializers.ValidationError("Connector curvature must be between -100 and 100.")
        return normalized

    def validate_visual_style(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Connector visual style must be an object.")
        if set(value) - {"color", "opacity", "dashed"}:
            raise serializers.ValidationError(
                "Connector visual style contains unsupported properties."
            )
        color = value.get("color", "#64748B")
        if not isinstance(color, str) or not HEX_COLOR_REGEX.match(color):
            raise serializers.ValidationError("Connector color must be a six digit hex color.")
        opacity = value.get("opacity", 1)
        if (
            isinstance(opacity, bool)
            or not isinstance(opacity, (int, float))
            or not math.isfinite(opacity)
            or not 0.1 <= opacity <= 1
        ):
            raise serializers.ValidationError("Connector opacity must be between 0.1 and 1.")
        dashed = value.get("dashed", False)
        if not isinstance(dashed, bool):
            raise serializers.ValidationError("Connector dashed must be true or false.")
        return {"color": color.upper(), "opacity": float(opacity), "dashed": dashed}


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
    zones = FactoryZoneSerializer(many=True, required=False, default=[])
    model_asset = FactoryModelAssetSerializer(read_only=True)
    status_visualization = serializers.JSONField(
        required=False, validators=[validate_status_visualization]
    )

    class Meta:
        model = FactoryLayout
        fields = [
            "id",
            "factory",
            "floor_width",
            "floor_height",
            "unit_system",
            "is_active",
            "model_transform",
            "status_visualization",
            "machines",
            "connections",
            "zones",
            "model_asset",
            "inventory_config",
            "dispatch_config",
        ]
        read_only_fields = ["id"]

    @staticmethod
    def _apply_stream_binding(machine, tenant, stream_id, channel_id, requested):
        if not requested:
            return
        from apps.streams.client import StreamClientError
        from apps.streams.models import DataStreamChannel
        from apps.streams.services import bind_machine

        if stream_id and channel_id:
            channel = DataStreamChannel.objects.filter(
                id=channel_id, stream_id=stream_id, tenant=tenant, active=True
            ).first()
            if not channel:
                raise serializers.ValidationError(
                    {"machines": "Choose an active data-stream channel for this factory."}
                )
            try:
                bind_machine(machine, channel, refresh_source=True)
            except StreamClientError as exc:
                raise serializers.ValidationError({"machines": str(exc)}) from exc
        elif not stream_id and not channel_id:
            bind_machine(machine, None)
        else:
            raise serializers.ValidationError(
                {"machines": "Both data stream and channel must be selected."}
            )

    def validate(self, attrs):
        """Validate machine positions within floor bounds and connection references."""
        if "status_visualization" in attrs:
            attrs["status_visualization"] = validate_status_visualization(
                attrs["status_visualization"]
            )
        floor_width = attrs.get("floor_width", getattr(self.instance, "floor_width", None))
        floor_height = attrs.get("floor_height", getattr(self.instance, "floor_height", None))
        machines_data = attrs.get("machines", [])
        connections_data = attrs.get("connections", [])
        zones_data = attrs.get("zones", [])

        # Validate machine positions are within floor bounds
        if floor_width is not None and floor_height is not None:
            for machine_data in machines_data:
                pos_x = machine_data.get("position_x")
                pos_y = machine_data.get("position_y")
                if (pos_x is None) != (pos_y is None):
                    raise serializers.ValidationError(
                        {"machines": "Machine placement requires both X and Y coordinates."}
                    )
                if pos_x is None:
                    continue
                size_width = machine_data.get("size_width", 1)
                size_height = machine_data.get("size_height", 1)
                rotation = machine_data.get("rotation_degrees", 0)
                footprint_width, footprint_height = (
                    (size_height, size_width)
                    if rotation in {90, 270}
                    else (size_width, size_height)
                )
                if pos_x + footprint_width > float(floor_width) or pos_y + footprint_height > float(
                    floor_height
                ):
                    raise serializers.ValidationError(
                        {
                            "machines": (
                                f"Position ({pos_x}, {pos_y}) is outside "
                                f"floor dimensions ({int(floor_width)}x{int(floor_height)})"
                            )
                        }
                    )

            for zone in zones_data:
                if (
                    zone.get("position_x", 0) < 0
                    or zone.get("position_y", 0) < 0
                    or zone.get("position_x", 0) + zone.get("width", 0) > floor_width
                    or zone.get("position_y", 0) + zone.get("height", 0) > floor_height
                ):
                    raise serializers.ValidationError(
                        {"zones": "Every zone must fit inside the floor."}
                    )

        # Validate duplicate positions
        positions = set()
        footprints = []
        for machine_data in machines_data:
            pos = (machine_data.get("position_x"), machine_data.get("position_y"))
            if pos[0] is None or pos[1] is None:
                continue
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
            width = machine_data.get("size_width", 1)
            height = machine_data.get("size_height", 1)
            if machine_data.get("rotation_degrees", 0) in {90, 270}:
                width, height = height, width
            rect = (pos[0], pos[1], pos[0] + width, pos[1] + height)
            if any(
                rect[0] < other[2]
                and rect[2] > other[0]
                and rect[1] < other[3]
                and rect[3] > other[1]
                for other in footprints
            ):
                raise serializers.ValidationError(
                    {"machines": "Machine footprints cannot overlap."}
                )
            footprints.append(rect)

        factory = attrs.get("factory", getattr(self.instance, "factory", None))
        for machine_data in machines_data:
            process = machine_data.get("process")
            if process and (
                process.factory_id != factory.id or process.kind != FactoryMaster.Kind.PROCESS
            ):
                raise serializers.ValidationError(
                    {"machines": "Every assigned process must belong to this factory."}
                )
        for zone in zones_data:
            line = zone.get("line")
            if line and (line.factory_id != factory.id or line.kind != FactoryMaster.Kind.LINE):
                raise serializers.ValidationError(
                    {"zones": "Every zone line must belong to this factory."}
                )

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

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation["machines"] = SpatialMachineSerializer(
            instance.machines.filter(
                is_active=True, position_x__isnull=False, position_y__isnull=False
            ).select_related("process__parent"),
            many=True,
        ).data
        representation["unplaced_machines"] = SpatialMachineSerializer(
            instance.machines.filter(is_active=True)
            .filter(models.Q(position_x__isnull=True) | models.Q(position_y__isnull=True))
            .select_related("process__parent"),
            many=True,
        ).data
        return representation

    @staticmethod
    def _ensure_machine_code(layout, machine_data, exclude_id=None):
        requested = (
            re.sub(
                r"[^A-Za-z0-9]+",
                "-",
                str(machine_data.get("code") or machine_data.get("name") or "MACHINE"),
            )
            .strip("-")
            .upper()[:60]
        )
        base = requested or "MACHINE"
        candidate = base
        suffix = 2
        query = layout.machines.all()
        if exclude_id:
            query = query.exclude(id=exclude_id)
        while query.filter(code__iexact=candidate).exists():
            tail = f"-{suffix}"
            candidate = f"{base[: 60 - len(tail)]}{tail}"
            suffix += 1
        machine_data["code"] = candidate

    @transaction.atomic
    def create(self, validated_data):
        """Create a full layout with nested machines, connections, inventory, dispatch."""
        machines_data = validated_data.pop("machines", [])
        connections_data = validated_data.pop("connections", [])
        zones_data = validated_data.pop("zones", [])
        inventory_data = validated_data.pop("inventory_config", None)
        dispatch_data = validated_data.pop("dispatch_config", None)

        layout = FactoryLayout.objects.create(**validated_data)
        tenant = validated_data.get("tenant")
        for zone_data in zones_data:
            zone_data.pop("id", None)
            FactoryZone.objects.create(layout=layout, tenant=tenant, **zone_data)

        # Create machines with their nested parameters and KPIs
        machine_id_map = {}  # maps client-provided UUIDs to created machine objects
        for machine_data in machines_data:
            parameters_data = machine_data.pop("parameters", [])
            custom_kpis_data = machine_data.pop("custom_kpis", [])
            stream_requested = (
                "data_stream_id" in machine_data or "data_stream_channel_id" in machine_data
            )
            stream_id = machine_data.pop("data_stream_id", None)
            channel_id = machine_data.pop("data_stream_channel_id", None)
            client_id = machine_data.pop("id", None)
            self._ensure_machine_code(layout, machine_data)

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
                if param_data.get("origin", "manual") == "stream":
                    continue
                param_data.pop("id", None)
                MachineParameter.objects.create(machine=machine, **param_data)

            # Create custom KPIs
            for kpi_data in custom_kpis_data:
                kpi_data.pop("id", None)
                MachineCustomKpi.objects.create(machine=machine, **kpi_data)

            self._apply_stream_binding(machine, tenant, stream_id, channel_id, stream_requested)

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

    @transaction.atomic
    def update(self, instance, validated_data):
        """Update layout with merge strategy for nested objects.

        Machines are merged by ID (update existing, add new, remove missing)
        so that related data like MachineObservations is preserved.
        Inventory materials are merged by ID (add/edit) while preserving
        quantities from the live stock computation.
        Dispatch products are merged by ID (add/edit new, keep existing).
        """
        machines_data = validated_data.pop("machines", None)
        connections_data = validated_data.pop("connections", None)
        zones_data = validated_data.pop("zones", None)
        inventory_data = validated_data.pop("inventory_config", None)
        dispatch_data = validated_data.pop("dispatch_config", None)

        # Update layout scalar fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        tenant = instance.tenant

        if zones_data is not None:
            instance.zones.all().delete()
            for zone_data in zones_data:
                zone_data.pop("id", None)
                FactoryZone.objects.create(layout=instance, tenant=tenant, **zone_data)

        # Merge machines if provided (preserves observations)
        if machines_data is not None:
            existing_machines = {str(m.id): m for m in instance.machines.all()}
            incoming_ids = set()
            machine_id_map = {}

            for machine_data in machines_data:
                parameters_data = machine_data.pop("parameters", [])
                custom_kpis_data = machine_data.pop("custom_kpis", [])
                stream_requested = (
                    "data_stream_id" in machine_data or "data_stream_channel_id" in machine_data
                )
                stream_id = machine_data.pop("data_stream_id", None)
                channel_id = machine_data.pop("data_stream_channel_id", None)
                client_id = machine_data.pop("id", None)

                if client_id and str(client_id) in existing_machines:
                    # Update existing machine in place (preserves observations)
                    machine = existing_machines[str(client_id)]
                    self._ensure_machine_code(instance, machine_data, machine.id)
                    for attr, value in machine_data.items():
                        setattr(machine, attr, value)
                    machine.save()

                    # Stream definitions are source-owned and survive ordinary
                    # Lexicon edits. Only the editable manual definitions are replaced.
                    machine.parameters.filter(origin="manual").delete()
                    for param_data in parameters_data:
                        if param_data.get("origin", "manual") == "stream":
                            continue
                        param_data.pop("id", None)
                        MachineParameter.objects.create(machine=machine, **param_data)

                    # Merge custom KPIs: replace definitions
                    machine.custom_kpis.all().delete()
                    for kpi_data in custom_kpis_data:
                        kpi_data.pop("id", None)
                        MachineCustomKpi.objects.create(machine=machine, **kpi_data)

                    incoming_ids.add(str(client_id))
                    machine_id_map[str(client_id)] = machine
                    self._apply_stream_binding(
                        machine, tenant, stream_id, channel_id, stream_requested
                    )
                else:
                    # Create new machine
                    self._ensure_machine_code(instance, machine_data)
                    create_kwargs = {
                        "layout": instance,
                        "tenant": tenant,
                        **machine_data,
                    }
                    if client_id:
                        create_kwargs["id"] = client_id

                    machine = SpatialMachine.objects.create(**create_kwargs)

                    for param_data in parameters_data:
                        if param_data.get("origin", "manual") == "stream":
                            continue
                        param_data.pop("id", None)
                        MachineParameter.objects.create(machine=machine, **param_data)

                    for kpi_data in custom_kpis_data:
                        kpi_data.pop("id", None)
                        MachineCustomKpi.objects.create(machine=machine, **kpi_data)

                    mid = str(client_id) if client_id else str(machine.id)
                    incoming_ids.add(mid)
                    machine_id_map[mid] = machine
                    self._apply_stream_binding(
                        machine, tenant, stream_id, channel_id, stream_requested
                    )

            # Remove machines that are no longer in the incoming data
            for old_id, old_machine in existing_machines.items():
                if old_id not in incoming_ids and old_machine.position_x is not None:
                    old_machine.is_active = False
                    old_machine.save(update_fields=["is_active", "updated_at"])
                    try:
                        binding = old_machine.stream_binding
                    except Exception:
                        binding = None
                    if binding:
                        binding.status = "paused"
                        binding.save(update_fields=["status", "updated_at"])

            # Replace connections if provided alongside machines
            if connections_data is not None:
                instance.connections.all().delete()
                for conn_data in connections_data:
                    conn_data.pop("id", None)
                    source_id = conn_data.pop("source_id", None)
                    target_id = conn_data.pop("target_id", None)

                    source = machine_id_map.get(str(source_id)) if source_id else None
                    target = machine_id_map.get(str(target_id)) if target_id else None

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

        # Merge inventory config (preserves live stock quantities)
        if inventory_data is not None:
            inventory_data.pop("id", None)
            new_materials = inventory_data.pop("materials", None)

            try:
                existing_inv = instance.inventory_config
            except InventoryConfiguration.DoesNotExist:
                existing_inv = None

            if existing_inv:
                # Update scalar fields (capacity, unit)
                for attr, value in inventory_data.items():
                    setattr(existing_inv, attr, value)

                # Merge materials: keep existing material quantities as the
                # base for stock calculation, only update name/unit, add new ones
                if new_materials is not None:
                    existing_materials = existing_inv.materials or []
                    existing_map = {
                        m["id"]: m
                        for m in existing_materials
                        if isinstance(m, dict) and m.get("id")
                    }

                    merged = []
                    for mat in new_materials:
                        mat_id = mat.get("id")
                        if mat_id and mat_id in existing_map:
                            # Existing material: update name/unit but preserve
                            # the original quantity (base for stock calculation)
                            old = existing_map[mat_id]
                            merged.append(
                                {
                                    "id": mat_id,
                                    "name": mat.get("name", old.get("name")),
                                    "unit": mat.get("unit", old.get("unit")),
                                    "quantity": old.get("quantity", 0),
                                }
                            )
                        else:
                            # New material: use the provided quantity as initial
                            merged.append(mat)

                    existing_inv.materials = merged

                existing_inv.save()
            else:
                # No existing config — create fresh
                create_data = {**inventory_data}
                if new_materials is not None:
                    create_data["materials"] = new_materials
                InventoryConfiguration.objects.create(layout=instance, tenant=tenant, **create_data)

        # Merge dispatch config (preserves dispatch events)
        if dispatch_data is not None:
            dispatch_data.pop("id", None)
            new_products = dispatch_data.pop("products", None)

            try:
                existing_disp = instance.dispatch_config
            except DispatchConfiguration.DoesNotExist:
                existing_disp = None

            if existing_disp:
                # Update scalar fields if any
                for attr, value in dispatch_data.items():
                    setattr(existing_disp, attr, value)

                # Merge products: keep existing product entries, add/update new
                if new_products is not None:
                    existing_products = existing_disp.products or []
                    existing_map = {
                        p["id"]: p for p in existing_products if isinstance(p, dict) and p.get("id")
                    }

                    merged = []
                    incoming_ids = set()
                    for prod in new_products:
                        prod_id = prod.get("id")
                        incoming_ids.add(prod_id)
                        if prod_id and prod_id in existing_map:
                            # Update name/unit of existing product
                            merged.append(
                                {
                                    "id": prod_id,
                                    "name": prod.get("name", existing_map[prod_id].get("name")),
                                    "unit": prod.get("unit", existing_map[prod_id].get("unit")),
                                }
                            )
                        else:
                            # New product
                            merged.append(prod)

                    # Keep existing products not in incoming (user didn't remove them)
                    # — actually, if user removed from form, they intend removal
                    # So we only keep what's in the incoming list
                    existing_disp.products = merged

                existing_disp.save()
            else:
                create_data = {**dispatch_data}
                if new_products is not None:
                    create_data["products"] = new_products
                DispatchConfiguration.objects.create(layout=instance, tenant=tenant, **create_data)

        # Re-fetch instance with proper prefetching to ensure response
        # serialization picks up all newly created nested objects
        instance = (
            FactoryLayout.objects.select_related(
                "inventory_config",
                "dispatch_config",
            )
            .prefetch_related(
                "machines__parameters",
                "machines__custom_kpis",
                "connections",
            )
            .get(pk=instance.pk)
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
        except SpatialMachine.DoesNotExist as exc:
            raise serializers.ValidationError("Referenced machine does not exist.") from exc

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
                initial_quantity = Decimal(str(material.get("quantity", 0)))
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
