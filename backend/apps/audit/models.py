from django.conf import settings
from django.db import models

from apps.common.models import TenantScopedModel, UUIDModel


class AuditEvent(UUIDModel, TenantScopedModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    event_type = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=80)
    factory_id = models.UUIDField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "event_type", "-created_at"]),
            models.Index(fields=["tenant", "entity_type", "entity_id"]),
        ]
