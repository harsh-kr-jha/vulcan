from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.utils import timezone
from django.views import View


class HealthView(View):
    def get(self, request):
        connection.ensure_connection()
        return JsonResponse(
            {
                "status": "ok",
                "database": "connected",
                "timestamp": timezone.now().isoformat(),
            }
        )


class PlatformConfigView(View):
    """Expose only non-secret, deployment-fixed product configuration."""

    def get(self, request):
        variant = settings.VULCAN_VARIANT_CONFIG
        return JsonResponse(
            {
                "id": variant["id"],
                "displayName": variant["displayName"],
                "descriptor": variant["descriptor"],
                "industry": variant["industry"],
                "modules": variant["modules"],
                "datasets": variant["datasets"],
                "navigation": variant["navigation"],
                "terminology": variant["terminology"],
                "features": variant["features"],
            }
        )
