from django.core.cache import cache


def invalidate_workspace(factory_id):
    """Advance the snapshot generation without making writes depend on cache health."""
    key = f"workspace:version:{factory_id}"
    try:
        cache.add(key, 1, timeout=None)
        cache.incr(key)
    except Exception:
        # A cache outage must never prevent durable application writes.
        pass
