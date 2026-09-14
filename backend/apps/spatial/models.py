from django.db import models

from apps.common.models import TenantScopedModel, UUIDModel
from apps.tenancy.models import Factory


class UnitSystem(models.TextChoices):
    FEET = "feet", "Feet"
    METERS = "meters", "Meters"


class MachineOperationalStatus(models.TextChoices):
    RUNNING = "running", "Running"
    WARNING = "warning", "Warning"
    DOWN = "down", "Down"
    IDLE = "idle", "Idle"
    NO_DATA = "no_data", "No data"


class ParamDataType(models.TextChoices):
    NUMBER = "number", "Number"
    TEXT = "text", "Text"
    BOOLEAN = "boolean", "Boolean"
    DATE = "date", "Date"
    SELECTION = "selection", "Selection"


class FactoryLayout(UUIDModel, TenantScopedModel):
    """Root entity representing a spatial factory layout."""

    factory = models.OneToOneField(Factory, on_delete=models.CASCADE, related_name="spatial_layout")
    floor_width = models.DecimalField(max_digits=7, decimal_places=1)
    floor_height = models.DecimalField(max_digits=7, decimal_places=1)
    unit_system = models.CharField(
        max_length=10, choices=UnitSystem.choices, default=UnitSystem.METERS
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "factory"]),
        ]

    def __str__(self) -> str:
        return (
            f"Layout for {self.factory} ({self.floor_width}x{self.floor_height} {self.unit_system})"
        )


class SpatialMachine(UUIDModel, TenantScopedModel):
    """A machine placed on the factory floor grid."""

    layout = models.ForeignKey(FactoryLayout, on_delete=models.CASCADE, related_name="machines")
    name = models.CharField(max_length=50)
    position_x = models.PositiveIntegerField()  # grid column
    position_y = models.PositiveIntegerField()  # grid row
    size_width = models.PositiveIntegerField(default=1)  # tiles wide
    size_height = models.PositiveIntegerField(default=1)  # tiles tall
    inputs = models.JSONField(default=list, blank=True)  # [{id, label, unitType}]
    outputs = models.JSONField(default=list, blank=True)  # [{id, label, unitType}]
    status = models.CharField(
        max_length=10,
        choices=MachineOperationalStatus.choices,
        default=MachineOperationalStatus.NO_DATA,
    )
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["layout", "position_x", "position_y"],
                name="unique_machine_position_per_layout",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "layout"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} @ ({self.position_x}, {self.position_y})"


class MachineParameter(UUIDModel):
    """Custom parameter definition for a spatial machine."""

    machine = models.ForeignKey(SpatialMachine, on_delete=models.CASCADE, related_name="parameters")
    key = models.CharField(max_length=64)  # alphanumeric + underscore
    data_type = models.CharField(max_length=12, choices=ParamDataType.choices)
    options = models.JSONField(default=list, blank=True)  # for selection type
    required = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["machine", "key"],
                name="unique_param_key_per_machine",
            ),
        ]
        ordering = ["order"]

    def __str__(self) -> str:
        return f"{self.key} ({self.data_type})"


class MachineCustomKpi(UUIDModel):
    """User-defined KPI formula for a spatial machine."""

    machine = models.ForeignKey(
        SpatialMachine, on_delete=models.CASCADE, related_name="custom_kpis"
    )
    name = models.CharField(max_length=50)
    display_unit = models.CharField(max_length=20)
    formula = models.JSONField()  # {operations: [{operator, parameterKey}]}

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["machine", "name"],
                name="unique_kpi_name_per_machine",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.display_unit})"


class MachineConnection(UUIDModel, TenantScopedModel):
    """Directional material-flow connection between two machines."""

    layout = models.ForeignKey(FactoryLayout, on_delete=models.CASCADE, related_name="connections")
    source = models.ForeignKey(
        SpatialMachine, on_delete=models.CASCADE, related_name="outgoing_connections"
    )
    target = models.ForeignKey(
        SpatialMachine, on_delete=models.CASCADE, related_name="incoming_connections"
    )
    name = models.CharField(max_length=50, blank=True)
    description = models.CharField(max_length=200, blank=True)
    material_type = models.CharField(max_length=100, blank=True)
    quantity_per_cycle = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    input_spec = models.CharField(max_length=200, blank=True)
    output_spec = models.CharField(max_length=200, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "layout"]),
        ]

    def __str__(self) -> str:
        return f"{self.source.name} → {self.target.name}"


class MachineObservation(UUIDModel, TenantScopedModel):
    """A single observation row submitted via QR data entry."""

    machine = models.ForeignKey(
        SpatialMachine, on_delete=models.CASCADE, related_name="observations"
    )
    values = models.JSONField()  # {parameter_key: value, ...}
    submitted_at = models.DateTimeField(auto_now_add=True)
    submitted_by = models.ForeignKey("auth.User", on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        ordering = ["-submitted_at"]
        indexes = [
            models.Index(fields=["tenant", "machine", "-submitted_at"]),
        ]

    def __str__(self) -> str:
        return f"Observation for {self.machine.name} at {self.submitted_at}"


class InventoryConfiguration(UUIDModel, TenantScopedModel):
    """Inventory panel configuration for a factory layout."""

    layout = models.OneToOneField(
        FactoryLayout, on_delete=models.CASCADE, related_name="inventory_config"
    )
    storage_capacity = models.PositiveIntegerField()  # 1–1,000,000
    capacity_unit = models.CharField(max_length=20)  # kg, litres, meters, units
    materials = models.JSONField(default=list)  # [{id, name, unit, initialQuantity}]

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "layout"]),
        ]

    def __str__(self) -> str:
        return f"Inventory for {self.layout}"


class InventoryChange(UUIDModel, TenantScopedModel):
    """Records an inventory addition or removal via QR scan."""

    inventory = models.ForeignKey(
        InventoryConfiguration, on_delete=models.CASCADE, related_name="changes"
    )
    material_id = models.CharField(max_length=40)  # references materials JSON id
    direction = models.CharField(max_length=10)  # "inbound" or "outbound"
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    submitted_at = models.DateTimeField(auto_now_add=True)
    submitted_by = models.ForeignKey("auth.User", on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        ordering = ["-submitted_at"]
        indexes = [
            models.Index(fields=["tenant", "inventory", "-submitted_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.direction} {self.quantity} of {self.material_id}"


class DispatchConfiguration(UUIDModel, TenantScopedModel):
    """Dispatch panel configuration for a factory layout."""

    layout = models.OneToOneField(
        FactoryLayout, on_delete=models.CASCADE, related_name="dispatch_config"
    )
    products = models.JSONField(default=list)  # [{id, name, unit}]

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "layout"]),
        ]

    def __str__(self) -> str:
        return f"Dispatch for {self.layout}"


class DispatchEvent(UUIDModel, TenantScopedModel):
    """Records a dispatch arrival or actual dispatch event."""

    dispatch = models.ForeignKey(
        DispatchConfiguration, on_delete=models.CASCADE, related_name="events"
    )
    product_id = models.CharField(max_length=40)  # references products JSON id
    event_type = models.CharField(max_length=20)  # "arrival" or "dispatched"
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=20)
    submitted_at = models.DateTimeField(auto_now_add=True)
    submitted_by = models.ForeignKey("auth.User", on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        ordering = ["-submitted_at"]
        indexes = [
            models.Index(fields=["tenant", "dispatch", "-submitted_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.event_type} {self.quantity} {self.unit} of {self.product_id}"
