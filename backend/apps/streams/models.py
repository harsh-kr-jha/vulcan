from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models

from apps.common.models import TenantScopedModel, UUIDModel


class StreamStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    CONNECTED = "connected", "Connected"
    DEGRADED = "degraded", "Degraded"
    DISABLED = "disabled", "Disabled"


class BindingStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    DEGRADED = "degraded", "Degraded"
    SCHEMA_REVIEW = "schema_review", "Schema review required"
    PAUSED = "paused", "Paused"


class DataInputStream(UUIDModel, TenantScopedModel):
    factory = models.ForeignKey(
        "tenancy.Factory", on_delete=models.CASCADE, related_name="data_streams"
    )
    name = models.CharField(max_length=120)
    base_url = models.URLField(max_length=500)
    protocol = models.CharField(max_length=40, default="http-pull-v1")
    enabled = models.BooleanField(default=True)
    status = models.CharField(
        max_length=20, choices=StreamStatus.choices, default=StreamStatus.DRAFT
    )
    capabilities = models.JSONField(default=dict, blank=True)
    source_metadata = models.JSONField(default=dict, blank=True)
    poll_interval_seconds = models.PositiveIntegerField(default=5)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["factory", "name"], name="unique_data_stream_name_factory"
            )
        ]
        indexes = [models.Index(fields=["tenant", "factory", "enabled"])]


class DataStreamCredential(UUIDModel, TenantScopedModel):
    stream = models.OneToOneField(
        DataInputStream, on_delete=models.CASCADE, related_name="credential"
    )
    encrypted_secret = models.TextField()
    key_hint = models.CharField(max_length=12)
    rotated_at = models.DateTimeField(auto_now=True)
    revoked_at = models.DateTimeField(null=True, blank=True)


class DataStreamChannel(UUIDModel, TenantScopedModel):
    stream = models.ForeignKey(DataInputStream, on_delete=models.CASCADE, related_name="channels")
    external_id = models.CharField(max_length=160)
    name = models.CharField(max_length=160)
    schema_version = models.CharField(max_length=80, blank=True)
    schema = models.JSONField(default=dict, blank=True)
    latest_cursor = models.CharField(max_length=255, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["stream", "external_id"], name="unique_external_channel_stream"
            )
        ]


class DataStreamSchemaVersion(UUIDModel, TenantScopedModel):
    channel = models.ForeignKey(
        DataStreamChannel, on_delete=models.CASCADE, related_name="schema_versions"
    )
    version = models.CharField(max_length=80)
    schema = models.JSONField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["channel", "version"], name="unique_channel_schema_version"
            )
        ]


class MachineStreamBinding(UUIDModel, TenantScopedModel):
    machine = models.OneToOneField(
        "spatial.SpatialMachine", on_delete=models.CASCADE, related_name="stream_binding"
    )
    channel = models.OneToOneField(
        DataStreamChannel, on_delete=models.PROTECT, related_name="machine_binding"
    )
    cursor = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=30, choices=BindingStatus.choices, default=BindingStatus.ACTIVE
    )
    last_polled_at = models.DateTimeField(null=True, blank=True)
    last_received_at = models.DateTimeField(null=True, blank=True)
    next_poll_at = models.DateTimeField(null=True, blank=True)
    consecutive_failures = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "next_poll_at"])]


class MachineTelemetrySample(UUIDModel, TenantScopedModel):
    machine = models.ForeignKey(
        "spatial.SpatialMachine", on_delete=models.CASCADE, related_name="telemetry_samples"
    )
    stream = models.ForeignKey(
        DataInputStream, on_delete=models.SET_NULL, null=True, related_name="telemetry_samples"
    )
    channel_external_id = models.CharField(max_length=160)
    schema_version = models.CharField(max_length=80)
    event_id = models.UUIDField(unique=True)
    observed_at = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)
    sequence_no = models.PositiveBigIntegerField()
    run_id = models.CharField(max_length=100, blank=True)
    cycle_id = models.CharField(max_length=100, blank=True)
    cycle_number = models.PositiveBigIntegerField(null=True, blank=True)
    cycle_phase = models.CharField(max_length=40, blank=True)
    recipe_id = models.CharField(max_length=100, blank=True)
    values = models.JSONField()
    observation_processed = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["-observed_at"]
        indexes = [
            models.Index(fields=["tenant", "machine", "-observed_at"]),
            models.Index(fields=["machine", "cycle_id", "observed_at"]),
            models.Index(
                fields=[
                    "machine",
                    "stream",
                    "channel_external_id",
                    "run_id",
                    "-sequence_no",
                ],
                name="streams_tel_poll_seq_idx",
            ),
            models.Index(fields=["received_at"], name="streams_tel_received_idx"),
            models.Index(
                fields=["machine", "observed_at"], name="streams_tel_machine_obs_idx"
            ),
        ]


class SpliceResult(models.TextChoices):
    GOOD = "good", "Good"
    FAILURE = "failure", "Failure"


class MachineCycleOutcome(UUIDModel, TenantScopedModel):
    """Cycle-level ground truth, kept separate from inference input values."""

    machine = models.ForeignKey(
        "spatial.SpatialMachine", on_delete=models.CASCADE, related_name="cycle_outcomes"
    )
    stream = models.ForeignKey(
        DataInputStream, on_delete=models.SET_NULL, null=True, related_name="cycle_outcomes"
    )
    run_id = models.CharField(max_length=100)
    cycle_id = models.CharField(max_length=100)
    cycle_number = models.PositiveBigIntegerField(null=True, blank=True)
    source_label = models.CharField(max_length=20, choices=SpliceResult.choices)
    effective_label = models.CharField(max_length=20, choices=SpliceResult.choices)
    quality_score = models.FloatField(null=True, blank=True)
    failure_mode = models.CharField(max_length=100, blank=True)
    sensor_data_quality = models.CharField(max_length=30, blank=True)
    source_metadata = models.JSONField(default=dict, blank=True)
    overridden_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="machine_cycle_outcome_overrides",
    )
    overridden_at = models.DateTimeField(null=True, blank=True)
    override_note = models.TextField(blank=True)

    class Meta:
        ordering = ["-cycle_number", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["machine", "run_id", "cycle_id"],
                name="unique_machine_run_cycle_outcome",
            )
        ]
        indexes = [models.Index(fields=["tenant", "machine", "run_id", "cycle_id"])]


class DatasetLevel(models.TextChoices):
    MACHINE = "machine", "Machine"
    MACHINE_FAMILY = "machine-family", "Machine family"
    LINE = "line", "Production line"


class DatasetExportStatus(models.TextChoices):
    PENDING = "pending", "Generating"
    READY = "ready", "Ready"
    FAILED = "failed", "Failed"


class TrainingDatasetExport(UUIDModel, TenantScopedModel):
    """Auditable pointer to an immutable training dataset in blob storage."""

    factory = models.ForeignKey(
        "tenancy.Factory", on_delete=models.PROTECT, related_name="training_dataset_exports"
    )
    machine = models.ForeignKey(
        "spatial.SpatialMachine",
        on_delete=models.PROTECT,
        related_name="training_dataset_exports",
        help_text="The selected machine, family, or line used to define this dataset.",
    )
    level = models.CharField(max_length=20, choices=DatasetLevel.choices)
    version = models.CharField(
        max_length=80,
        validators=[
            RegexValidator(
                regex=r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$",
                message="Use semantic versioning, for example 1.0.0.",
            )
        ],
    )
    target_key = models.CharField(max_length=100)
    target_label = models.CharField(max_length=180)
    status = models.CharField(
        max_length=20, choices=DatasetExportStatus.choices, default=DatasetExportStatus.PENDING
    )
    row_count = models.PositiveBigIntegerField(default=0)
    features = models.JSONField(default=list, blank=True)
    data_key = models.CharField(max_length=500, blank=True)
    manifest_key = models.CharField(max_length=500, blank=True)
    checksum = models.CharField(max_length=64, blank=True)
    error = models.TextField(blank=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_training_datasets",
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "factory", "level", "target_key", "version"],
                name="unique_training_dataset_scope_version",
            )
        ]
        indexes = [models.Index(fields=["tenant", "factory", "status"])]
        verbose_name = "training dataset"
        verbose_name_plural = "training datasets"

    def __str__(self) -> str:
        return f"{self.target_label} · {self.level} · v{self.version}"
