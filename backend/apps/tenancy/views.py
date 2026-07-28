from django.contrib.auth import authenticate, login, logout
from rest_framework import viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import CanManageFactory, factories_for_request, tenant_for_request
from apps.tenancy.serializers import FactorySerializer


class SessionLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        user = authenticate(
            request=request,
            username=request.data.get("username", ""),
            password=request.data.get("password", ""),
        )
        if user is None:
            return Response({"detail": "Invalid username or password."}, status=400)
        login(request, user)
        return Response({"id": user.pk, "name": user.get_full_name() or user.get_username()})


class SessionLogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=204)


class MeView(APIView):
    def get(self, request):
        tenant = tenant_for_request(request)
        membership = request.user.memberships.get(tenant=tenant, is_active=True)
        return Response(
            {
                "id": request.user.pk,
                "email": request.user.email,
                "name": request.user.get_full_name() or request.user.get_username(),
                "tenant": {"id": tenant.id, "name": tenant.name},
                "role": membership.role,
                "factories": FactorySerializer(
                    factories_for_request(request), many=True, context={"tenant": tenant}
                ).data,
            }
        )


class FactoryViewSet(viewsets.ModelViewSet):
    serializer_class = FactorySerializer

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [CanManageFactory()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return factories_for_request(self.request).select_related("company")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["tenant"] = tenant_for_request(self.request)
        return context

    def perform_create(self, serializer):
        tenant = tenant_for_request(self.request)
        serializer.save(tenant=tenant)
