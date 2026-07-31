from django.contrib import admin

from .models import ActionItem, Alert, AlertRule


@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "version", "metric", "severity", "tenant", "is_active")
    list_filter = ("is_active", "severity", "metric", "tenant")
    search_fields = ("name", "code", "metric", "recommendation_template")
    autocomplete_fields = ("tenant",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ("title", "severity", "status", "factory", "line", "machine", "generated_at")
    list_filter = ("severity", "status", "tenant", "factory", "rule")
    search_fields = ("title", "explanation", "recommendation", "rule__name")
    autocomplete_fields = ("tenant", "factory", "line", "machine", "rule")
    readonly_fields = ("id", "generated_at", "created_at", "updated_at")
    date_hierarchy = "generated_at"


@admin.register(ActionItem)
class ActionItemAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "factory", "due_date", "status", "created_at")
    list_filter = ("status", "due_date", "tenant", "factory")
    search_fields = ("title", "owner", "alert_key", "factory__name")
    autocomplete_fields = ("tenant", "factory")
    readonly_fields = ("id", "created_at", "updated_at")
    date_hierarchy = "due_date"
