from django.db import models

from apps.common.models import TenantScopedModel, UUIDModel
from apps.tenancy.models import Factory, Machine, ProductionLine


class AlertRule(UUIDModel, TenantScopedModel):
    name = models.CharField(max_length=180)
    code = models.SlugField(max_length=80)
    version = models.CharField(max_length=30)
    metric = models.CharField(max_length=80)
    operator = models.CharField(max_length=30)
    threshold = models.DecimalField(max_digits=20, decimal_places=6)
    time_window = models.CharField(max_length=80)
    grouping_dimension = models.CharField(max_length=80)
    minimum_occurrences = models.PositiveIntegerField(default=1)
    severity = models.CharField(max_length=20)
    recommendation_template = models.TextField()
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "code", "version"], name="unique_alert_rule_version"
            )
        ]


class AlertStatus(models.TextChoices):
    NEW = "new", "New"
    ACKNOWLEDGED = "acknowledged", "Acknowledged"
    RESOLVED = "resolved", "Resolved"
    DISMISSED = "dismissed", "Dismissed"


class Alert(UUIDModel, TenantScopedModel):
    factory = models.ForeignKey(Factory, on_delete=models.PROTECT, related_name="alerts")
    line = models.ForeignKey(ProductionLine, on_delete=models.PROTECT, null=True, blank=True)
    machine = models.ForeignKey(Machine, on_delete=models.PROTECT, null=True, blank=True)
    rule = models.ForeignKey(AlertRule, on_delete=models.PROTECT, related_name="alerts")
    title = models.CharField(max_length=220)
    explanation = models.TextField()
    recommendation = models.TextField()
    severity = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=AlertStatus.choices, default=AlertStatus.NEW)
    observed_value = models.CharField(max_length=120)
    threshold_display = models.CharField(max_length=120)
    evaluation_start = models.DateTimeField()
    evaluation_end = models.DateTimeField()
    input_records = models.JSONField(default=list)
    kpi_result_id = models.UUIDField(null=True, blank=True)
    generated_at = models.DateTimeField(auto_now_add=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-generated_at"]
        indexes = [
            models.Index(fields=["tenant", "factory", "status", "-generated_at"]),
            models.Index(fields=["tenant", "severity", "status"]),
        ]


class ActionItem(UUIDModel, TenantScopedModel):
    factory = models.ForeignKey(Factory, on_delete=models.CASCADE, related_name="action_items")
    alert_key = models.CharField(max_length=220)
    title = models.CharField(max_length=240)
    owner = models.CharField(max_length=160, default="Factory team")
    due_date = models.DateField()
    status = models.CharField(
        max_length=20, choices=[("open", "Open"), ("done", "Done")], default="open"
    )

    class Meta:
        ordering = ["status", "due_date", "-created_at"]
        indexes = [models.Index(fields=["tenant", "factory", "status"])]
