from django.db import models

from apps.common.models import TenantScopedModel, UUIDModel


class ProductionProfile(UUIDModel, TenantScopedModel):
    machine = models.ForeignKey("spatial.SpatialMachine", on_delete=models.CASCADE)
    sku = models.ForeignKey("tenancy.FactoryMaster", on_delete=models.PROTECT)
    version = models.PositiveIntegerField()
    ranges = models.JSONField(default=list)
    checkpoint_phase = models.CharField(max_length=40)
    checkpoint_second = models.PositiveIntegerField(default=1)
    fields = models.JSONField(default=list)
    contract = models.CharField(max_length=64)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["machine", "sku", "version"], name="ml_profile_version")
        ]


class ObservationConfig(UUIDModel, TenantScopedModel):
    machine = models.OneToOneField("spatial.SpatialMachine", on_delete=models.CASCADE)
    enabled = models.BooleanField(default=False)
    active_profile = models.ForeignKey(
        ProductionProfile, null=True, on_delete=models.PROTECT, related_name="active_configs"
    )
    pending_profile = models.ForeignKey(
        ProductionProfile, null=True, on_delete=models.PROTECT, related_name="pending_configs"
    )
    stale_reason = models.TextField(blank=True)


class MachineCycle(UUIDModel, TenantScopedModel):
    machine = models.ForeignKey("spatial.SpatialMachine", on_delete=models.CASCADE)
    run_id = models.CharField(max_length=100)
    cycle_id = models.CharField(max_length=100)
    profile = models.ForeignKey(ProductionProfile, null=True, on_delete=models.PROTECT)
    started_at = models.DateTimeField()
    completed = models.BooleanField(default=False)
    health = models.FloatField(null=True)
    passed_weight = models.FloatField(default=0)
    total_weight = models.FloatField(default=0)
    violations = models.JSONField(default=dict)
    accumulator = models.JSONField(default=dict)

    class Meta:
        indexes = [
            models.Index(fields=["machine", "completed", "started_at"], name="ml_cycle_state_idx")
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["machine", "run_id", "cycle_id"], name="ml_unique_cycle"
            )
        ]


class TrainingRun(UUIDModel, TenantScopedModel):
    profile = models.ForeignKey(ProductionProfile, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, default="queued")
    metrics = models.JSONField(default=dict)
    dataset = models.JSONField(default=list)
    artifact_key = models.TextField(blank=True)
    checksum = models.CharField(max_length=64, blank=True)
    threshold = models.FloatField(default=0.5)
    error = models.TextField(blank=True)
    active = models.BooleanField(default=False)
    approved_by = models.ForeignKey("auth.User", null=True, on_delete=models.PROTECT)

    class Meta:
        indexes = [models.Index(fields=["profile", "status", "active"], name="ml_run_state_idx")]


class FeatureSnapshot(UUIDModel, TenantScopedModel):
    cycle = models.ForeignKey(MachineCycle, on_delete=models.CASCADE, related_name="snapshots")
    event_id = models.UUIDField(unique=True)
    observed_at = models.DateTimeField()
    sequence_no = models.PositiveBigIntegerField()
    features = models.JSONField(default=dict)
    checkpoint = models.BooleanField(default=False)
    violations = models.JSONField(default=dict)
    model = models.ForeignKey(TrainingRun, null=True, on_delete=models.PROTECT)
    failure_probability = models.FloatField(null=True)
    predicted_label = models.CharField(max_length=20, blank=True)
    threshold = models.FloatField(null=True)

    class Meta:
        indexes = [
            models.Index(fields=["cycle", "checkpoint"], name="ml_snapshot_check_idx"),
            models.Index(fields=["created_at"], name="ml_snapshot_age_idx"),
        ]


class OutcomeBinding(UUIDModel, TenantScopedModel):
    machine = models.OneToOneField("spatial.SpatialMachine", on_delete=models.CASCADE)
    channel = models.OneToOneField("streams.DataStreamChannel", on_delete=models.PROTECT)
    cursor = models.CharField(max_length=255, blank=True)
    last_error = models.TextField(blank=True)


class OutcomeReceipt(UUIDModel, TenantScopedModel):
    binding = models.ForeignKey(OutcomeBinding, on_delete=models.CASCADE)
    event_id = models.UUIDField(unique=True)
    observed_at = models.DateTimeField()
