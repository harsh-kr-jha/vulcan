from django.contrib import admin

from .models import DailyMetric, KPIDefinition, LossEvent


@admin.register(KPIDefinition)
class KPIDefinitionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "version", "unit", "tenant", "is_active")
    list_filter = ("is_active", "unit", "tenant")
    search_fields = ("name", "code", "formula")
    autocomplete_fields = ("tenant",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(DailyMetric)
class DailyMetricAdmin(admin.ModelAdmin):
    list_display = (
        "operational_date",
        "kpi_code",
        "value",
        "unit",
        "factory",
        "line",
        "machine",
        "calculation_status",
    )
    list_filter = ("kpi_code", "calculation_status", "unit", "tenant", "factory")
    search_fields = ("kpi_code", "factory__name", "line__name", "machine__name")
    autocomplete_fields = ("tenant", "factory", "line", "machine")
    readonly_fields = ("id", "calculated_at", "created_at", "updated_at")
    date_hierarchy = "operational_date"


@admin.register(LossEvent)
class LossEventAdmin(admin.ModelAdmin):
    list_display = (
        "period_start",
        "category",
        "factory",
        "line",
        "machine",
        "minutes_lost",
        "quantity_lost",
        "confidence",
    )
    list_filter = ("category", "confidence", "tenant", "factory")
    search_fields = ("category", "reason", "factory__name", "line__name", "machine__name")
    autocomplete_fields = ("tenant", "factory", "line", "machine")
    readonly_fields = ("id", "created_at", "updated_at")
    date_hierarchy = "period_start"
