from django.db import models

from apps.common.models import TenantScopedModel, UUIDModel
from apps.tenancy.models import Factory, Machine, ProductionLine


class KPIDefinition(UUIDModel, TenantScopedModel):
    code = models.SlugField(max_length=80)
    name = models.CharField(max_length=160)
    version = models.CharField(max_length=30)
    formula = models.TextField()
    unit = models.CharField(max_length=30)
    configuration = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "code", "version"], name="unique_kpi_definition_version"
            )
        ]


class DailyMetric(UUIDModel, TenantScopedModel):
    factory = models.ForeignKey(Factory, on_delete=models.PROTECT, related_name="daily_metrics")
    line = models.ForeignKey(
        ProductionLine,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="daily_metrics",
    )
    machine = models.ForeignKey(
        Machine, on_delete=models.PROTECT, null=True, blank=True, related_name="daily_metrics"
    )
    operational_date = models.DateField()
    kpi_code = models.CharField(max_length=80)
    definition_version = models.CharField(max_length=30)
    numerator = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    denominator = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    value = models.DecimalField(max_digits=24, decimal_places=6)
    unit = models.CharField(max_length=30)
    inputs = models.JSONField(default=dict)
    source_upload_ids = models.JSONField(default=list)
    calculation_status = models.CharField(max_length=30, default="completed")
    calculated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "tenant",
                    "factory",
                    "line",
                    "machine",
                    "operational_date",
                    "kpi_code",
                    "definition_version",
                ],
                name="unique_daily_metric_grain",
            )
        ]
        indexes = [
            models.Index(fields=["tenant", "factory", "operational_date", "kpi_code"]),
            models.Index(fields=["tenant", "factory", "line", "operational_date"]),
        ]


class LossEvent(UUIDModel, TenantScopedModel):
    factory = models.ForeignKey(Factory, on_delete=models.PROTECT, related_name="loss_events")
    line = models.ForeignKey(ProductionLine, on_delete=models.PROTECT, null=True, blank=True)
    machine = models.ForeignKey(Machine, on_delete=models.PROTECT, null=True, blank=True)
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    category = models.CharField(max_length=80)
    quantity_lost = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    minutes_lost = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    percentage_of_plan = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    reason = models.CharField(max_length=180, blank=True)
    supporting_records = models.JSONField(default=list)
    calculation_method = models.CharField(max_length=80)
    confidence = models.CharField(max_length=20)

    class Meta:
        indexes = [models.Index(fields=["tenant", "factory", "period_start", "category"])]
