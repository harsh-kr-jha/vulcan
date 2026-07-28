from apps.audit.models import AuditEvent
from apps.common.permissions import tenant_for_request


def record_audit_event(
    request, event_type: str, entity, metadata: dict | None = None
) -> AuditEvent:
    tenant = tenant_for_request(request)
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip_address = (
        forwarded_for.split(",")[0].strip() if forwarded_for else request.META.get("REMOTE_ADDR")
    )
    return AuditEvent.objects.create(
        tenant=tenant,
        actor=request.user,
        event_type=event_type,
        entity_type=entity._meta.label_lower,
        entity_id=str(entity.pk),
        factory_id=getattr(entity, "factory_id", None),
        ip_address=ip_address or None,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:1000],
        metadata=metadata or {},
    )
