import logging
from collections.abc import Mapping

from django.contrib.auth import authenticate, login, logout
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import status, viewsets
from rest_framework.exceptions import APIException, NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import BaseThrottle
from rest_framework.views import APIView

from apps.audit.services import record_audit_event
from apps.common.permissions import (
    CanCreateFactory,
    CanManageFactory,
    factories_for_request,
    membership_for_request,
    tenant_for_request,
)
from apps.tenancy.models import (
    EmailIdentity,
    FactoryMaster,
    Membership,
    normalize_login_email,
)
from apps.tenancy.serializers import (
    FactoryMasterSerializer,
    FactorySerializer,
    WorkspaceFactorySerializer,
)
from apps.tenancy.services import workspace_identity_for_request
from apps.tenancy.throttling import (
    LoginAccountThrottle,
    LoginIPThrottle,
    clear_login_account_throttle,
)

INVALID_CREDENTIALS = "The email or password is incorrect."
INVALID_ACCOUNT_FINGERPRINT = "invalid"
security_logger = logging.getLogger("vulcan.security.authentication")


def _account_fingerprint(raw_email: object) -> str:
    if not isinstance(raw_email, str) or len(raw_email) > 254:
        return INVALID_ACCOUNT_FINGERPRINT
    normalized_email = normalize_login_email(raw_email)
    try:
        validate_email(normalized_email)
    except ValidationError:
        return INVALID_ACCOUNT_FINGERPRINT
    return salted_hmac(
        "auth.login.failure",
        normalized_email,
        algorithm="sha256",
    ).hexdigest()[:24]


class CsrfTokenView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class SessionLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginIPThrottle, LoginAccountThrottle]

    def post(self, request):
        if not isinstance(request.data, Mapping):
            return self.invalid_credentials(request)
        raw_email = request.data.get("email", "")
        raw_password = request.data.get("password", "")
        if (
            not isinstance(raw_email, str)
            or len(raw_email) > 254
            or not isinstance(raw_password, str)
            or len(raw_password) > 1024
        ):
            return self.invalid_credentials(request, raw_email)

        user = authenticate(
            request=request,
            email=raw_email,
            password=raw_password,
        )
        membership = None
        if user is not None:
            membership = (
                Membership.objects.select_related("tenant")
                .filter(user=user, is_active=True, tenant__is_active=True)
                .order_by("created_at", "pk")
                .first()
            )
        if user is None or membership is None:
            return self.invalid_credentials(request, raw_email)

        login(request, user)
        request.session["active_membership_id"] = str(membership.id)
        request.session["authenticated_at"] = timezone.now().isoformat()
        request.session.set_expiry(None)
        clear_login_account_throttle(request, raw_email)
        identity = EmailIdentity.objects.get(user=user)
        record_audit_event(request, "auth.login", membership)
        return Response(
            {
                "id": user.pk,
                "email": identity.email,
                "name": user.get_full_name() or identity.email,
                "tenant": {"id": membership.tenant_id, "name": membership.tenant.name},
                "role": membership.role,
            }
        )

    @staticmethod
    def invalid_credentials(request, raw_email: object = None):
        account_fingerprint = _account_fingerprint(raw_email)
        client_ip = BaseThrottle().get_ident(request) or "unknown"
        security_logger.warning(
            "event=auth.login.failed account_fingerprint=%s client_ip=%s",
            account_fingerprint,
            client_ip,
            extra={
                "event": "auth.login.failed",
                "account_fingerprint": account_fingerprint,
                "client_ip": client_ip,
            },
        )
        return Response({"detail": INVALID_CREDENTIALS}, status=status.HTTP_401_UNAUTHORIZED)


class SessionLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            try:
                membership = membership_for_request(request)
            except APIException:
                # Revocation must never strand an authenticated browser with a
                # session it can no longer clear.
                membership = None
            if membership is not None:
                try:
                    record_audit_event(request, "auth.logout", membership)
                except Exception:
                    # Audit availability is monitored, but it is not allowed to
                    # block the security-sensitive session invalidation path.
                    security_logger.exception(
                        "event=auth.logout.audit_failed",
                        extra={"event": "auth.logout.audit_failed"},
                    )
        finally:
            logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        membership = membership_for_request(request)
        identity = EmailIdentity.objects.filter(user=request.user).first()
        return Response(
            {
                "id": request.user.pk,
                "email": identity.email if identity else request.user.email,
                "name": request.user.get_full_name() or request.user.get_username(),
                "tenant": {"id": membership.tenant_id, "name": membership.tenant.name},
                "role": membership.role,
                "factories": FactorySerializer(
                    factories_for_request(request),
                    many=True,
                    context={"tenant": membership.tenant},
                ).data,
            }
        )


class FactoryViewSet(viewsets.ModelViewSet):
    serializer_class = WorkspaceFactorySerializer

    def get_permissions(self):
        if self.action == "create":
            return [CanCreateFactory()]
        if self.action in {"update", "partial_update", "destroy"}:
            return [CanManageFactory()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return factories_for_request(self.request).select_related("company")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["tenant"] = tenant_for_request(self.request)
        return context

    def perform_create(self, serializer):
        identity = workspace_identity_for_request(self.request)
        configuration = {
            "currency": self.request.data.get("currency", "INR"),
            "factoryDetails": self.request.data.get("details", {}),
        }
        factory = serializer.save(
            tenant=identity.tenant,
            company=identity.company,
            configuration=configuration,
        )
        if identity.membership and not identity.membership.all_factories:
            identity.membership.factories.add(factory)


class FactoryMasterViewSet(viewsets.ModelViewSet):
    serializer_class = FactoryMasterSerializer

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [CanManageFactory()]
        return [IsAuthenticated()]

    def get_factory(self):
        if hasattr(self, "_factory"):
            return self._factory
        factory_id = self.request.query_params.get("factory") or self.request.data.get("factory")
        factories = factories_for_request(self.request)
        if factory_id:
            self._factory = get_object_or_404(factories, id=factory_id)
        else:
            self._factory = factories.first()
            if self._factory is None:
                raise NotFound("No factory is available to this membership.")
        return self._factory

    def get_queryset(self):
        queryset = FactoryMaster.objects.filter(
            tenant=tenant_for_request(self.request),
            factory=self.get_factory(),
        ).select_related("parent")
        if kind := self.request.query_params.get("kind"):
            queryset = queryset.filter(kind=kind)
        return queryset.order_by("kind", "name")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "factory": self.get_factory()}

    def perform_create(self, serializer):
        serializer.save(tenant=tenant_for_request(self.request), factory=self.get_factory())

    def destroy(self, request, *args, **kwargs):
        item = self.get_object()
        item.is_active = False
        item.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
