import json
from pathlib import Path

from django.db import connection
from django.http import JsonResponse
from django.utils import timezone
from django.views import View

PLATFORM_CONFIG_PATH = Path(__file__).resolve().parents[2] / "platform.json"


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
    """Expose non-secret platform configuration.

    Operating template branches provide a platform.json at the repository root.
    Platform Core ships without one — this endpoint returns an empty config.
    """

    def get(self, request):
        if PLATFORM_CONFIG_PATH.is_file():
            config = json.loads(PLATFORM_CONFIG_PATH.read_text(encoding="utf-8"))
        else:
            config = {
                "id": "platform-core",
                "displayName": "Tamaso Platform",
                "descriptor": "Platform Core — not deployable without an operating template",
                "industry": "",
                "modules": [],
                "datasets": {},
                "navigation": {},
                "terminology": {},
                "features": {},
            }
        return JsonResponse(config)
