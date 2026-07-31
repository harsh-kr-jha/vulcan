from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = (
        "event_type",
        "entity_type",
        "entity_id",
        "actor",
        "tenant",
        "factory_id",
        "created_at",
    )
    list_filter = ("event_type", "entity_type", "tenant")
    search_fields = ("entity_id", "actor__username", "actor__email", "ip_address")
    autocomplete_fields = ("tenant", "actor")
    readonly_fields = (
        "id",
        "tenant",
        "actor",
        "event_type",
        "entity_type",
        "entity_id",
        "factory_id",
        "ip_address",
        "user_agent",
        "metadata",
        "created_at",
        "updated_at",
    )
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
