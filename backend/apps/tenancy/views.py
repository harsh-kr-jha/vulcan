from django.contrib.auth import authenticate, login, logout
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import factories_for_request, tenant_for_request
from apps.tenancy.models import Factory, FactoryMaster
from apps.tenancy.serializers import (
    FactoryMasterSerializer,
    FactorySerializer,
    WorkspaceFactorySerializer,
)
from apps.tenancy.services import get_or_create_default_factory, get_workspace_identity


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
    serializer_class = WorkspaceFactorySerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_permissions(self):
        return [AllowAny()]

    def get_queryset(self):
        identity = get_workspace_identity()
        return Factory.objects.filter(tenant=identity.tenant, is_active=True).select_related(
            "company"
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["tenant"] = get_workspace_identity().tenant
        return context

    def perform_create(self, serializer):
        identity = get_workspace_identity()
        configuration = {
            "currency": self.request.data.get("currency", "INR"),
            "factoryDetails": self.request.data.get("details", {}),
        }
        serializer.save(
            tenant=identity.tenant, company=identity.company, configuration=configuration
        )


class FactoryMasterViewSet(viewsets.ModelViewSet):
    serializer_class = FactoryMasterSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_factory(self):
        identity = get_workspace_identity()
        factory_id = self.request.query_params.get("factory") or self.request.data.get("factory")
        if factory_id:
            return Factory.objects.get(id=factory_id, tenant=identity.tenant, is_active=True)
        return get_or_create_default_factory(identity)

    def get_queryset(self):
        queryset = FactoryMaster.objects.filter(
            tenant=get_workspace_identity().tenant,
            factory=self.get_factory(),
        ).select_related("parent")
        if kind := self.request.query_params.get("kind"):
            queryset = queryset.filter(kind=kind)
        return queryset.order_by("kind", "name")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "factory": self.get_factory()}

    def perform_create(self, serializer):
        identity = get_workspace_identity()
        serializer.save(tenant=identity.tenant, factory=self.get_factory())

    def destroy(self, request, *args, **kwargs):
        item = self.get_object()
        item.is_active = False
        item.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
