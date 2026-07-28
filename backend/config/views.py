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
