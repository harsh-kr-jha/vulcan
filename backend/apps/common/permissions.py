from django.db.models import QuerySet
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import BasePermission

from apps.tenancy.models import Factory, Membership, Role


def membership_for_request(request) -> Membership:
    """Resolve one active membership and fail closed if a selected membership was revoked."""
    cached = getattr(request, "_vulcan_membership", None)
    if cached is not None:
        return cached
    if not request.user or not request.user.is_authenticated or not request.user.is_active:
        raise NotAuthenticated("Authentication credentials were not provided.")

    memberships = Membership.objects.select_related("tenant").filter(
        user=request.user,
        is_active=True,
        tenant__is_active=True,
    )
    selected_id = request.session.get("active_membership_id")
    if selected_id:
        membership = memberships.filter(pk=selected_id).first()
        if membership is None:
            raise PermissionDenied("The active workspace membership is no longer available.")
    else:
        membership = memberships.order_by("created_at", "pk").first()
    if membership is None:
        raise PermissionDenied("The user does not have an active tenant membership.")
    request._vulcan_membership = membership
    return membership


def tenant_for_request(request):
    return membership_for_request(request).tenant


def factories_for_membership(membership: Membership) -> QuerySet[Factory]:
    base = Factory.objects.filter(
        tenant=membership.tenant,
        tenant__is_active=True,
        company__is_active=True,
        is_active=True,
    ).order_by("created_at", "pk")
    if membership.all_factories:
        return base
    return base.filter(memberships=membership)


def factories_for_request(request) -> QuerySet[Factory]:
    return factories_for_membership(membership_for_request(request))


class TenantRolePermission(BasePermission):
    allowed_roles: set[str] = set()
    message = "Your tenant role does not permit this action."

    def has_permission(self, request, view):
        return membership_for_request(request).role in self.allowed_roles


class CanManageFactory(TenantRolePermission):
    allowed_roles = {
        Role.PLATFORM_ADMIN,
        Role.COMPANY_ADMIN,
        Role.FACTORY_ADMIN,
    }


class CanCreateFactory(TenantRolePermission):
    """Only tenant-wide administrators may expand the set of factories."""

    allowed_roles = {
        Role.PLATFORM_ADMIN,
        Role.COMPANY_ADMIN,
    }


class CanManageCompany(TenantRolePermission):
    """Protect company-wide fields shared by multiple factory scopes."""

    allowed_roles = {
        Role.PLATFORM_ADMIN,
        Role.COMPANY_ADMIN,
    }
    message = "Your tenant role does not permit company-wide changes."


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
