from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics.services import factory_summary
from apps.common.permissions import factories_for_request


class PerformanceSummaryView(APIView):
    def get(self, request):
        factories = factories_for_request(request)
        factory_id = request.query_params.get("factory_id")
        factory = factories.filter(pk=factory_id).first() if factory_id else factories.first()
        if factory is None:
            return Response({"kpis": [], "trend": [], "losses": [], "inventoryRisks": []})
        return Response(factory_summary(factory))
