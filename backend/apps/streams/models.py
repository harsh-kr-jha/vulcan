from django.conf import settings
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

    class Meta:
        ordering = ["-observed_at"]
        indexes = [
            models.Index(fields=["tenant", "machine", "-observed_at"]),
            models.Index(fields=["machine", "cycle_id", "observed_at"]),
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
