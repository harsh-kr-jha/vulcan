from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from apps.tenancy.models import Membership, Role


def tenant_for_request(request):
    membership = (
        Membership.objects.select_related("tenant")
        .filter(user=request.user, is_active=True)
        .order_by("created_at")
        .first()
    )
    if membership is None:
        raise PermissionDenied("The user does not have an active tenant membership.")
    return membership.tenant


def factories_for_request(request):
    membership = (
        Membership.objects.filter(user=request.user, is_active=True).order_by("created_at").first()
    )
    if membership is None:
        return []
    if membership.all_factories:
        return membership.tenant.factories.filter(is_active=True)
    return membership.factories.filter(is_active=True)


class TenantRolePermission(BasePermission):
    allowed_roles: set[str] = set()
    message = "Your tenant role does not permit this action."

    def has_permission(self, request, view):
        return Membership.objects.filter(
            user=request.user,
            is_active=True,
            role__in=self.allowed_roles,
        ).exists()


class CanManageFactory(TenantRolePermission):
    allowed_roles = {
        Role.PLATFORM_ADMIN,
        Role.COMPANY_ADMIN,
        Role.FACTORY_ADMIN,
    }


class CanOperateUploads(TenantRolePermission):
    allowed_roles = {
        Role.PLATFORM_ADMIN,
        Role.OPERATIONS_REVIEWER,
        Role.COMPANY_ADMIN,
        Role.FACTORY_ADMIN,
        Role.FACTORY_MANAGER,
        Role.PRODUCTION_SUPERVISOR,
        Role.QUALITY_REVIEWER,
        Role.INVENTORY_REVIEWER,
    }


class CanApproveUploads(TenantRolePermission):
    allowed_roles = {
        Role.PLATFORM_ADMIN,
        Role.OPERATIONS_REVIEWER,
        Role.COMPANY_ADMIN,
        Role.FACTORY_ADMIN,
        Role.FACTORY_MANAGER,
        Role.QUALITY_REVIEWER,
    }


class CanManageAlerts(TenantRolePermission):
    allowed_roles = {
        Role.PLATFORM_ADMIN,
        Role.OPERATIONS_REVIEWER,
        Role.COMPANY_ADMIN,
        Role.FACTORY_ADMIN,
        Role.FACTORY_MANAGER,
        Role.PRODUCTION_SUPERVISOR,
        Role.QUALITY_REVIEWER,
        Role.INVENTORY_REVIEWER,
    }
