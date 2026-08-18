from dataclasses import dataclass

from django.contrib.auth import get_user_model
from rest_framework.exceptions import PermissionDenied

from apps.tenancy.models import Company, Factory, Membership, Tenant


@dataclass(frozen=True)
class WorkspaceIdentity:
    tenant: Tenant
    company: Company
    user: object
    membership: Membership | None = None

    def factories(self):
        if self.membership is None:
            return self.tenant.factories.filter(is_active=True)
        from apps.common.permissions import factories_for_membership

        return factories_for_membership(self.membership)


def workspace_identity_for_request(request, factory: Factory | None = None) -> WorkspaceIdentity:
    """Build a request identity from its active membership, never from seed data."""
    from apps.common.permissions import factories_for_membership, membership_for_request

    membership = membership_for_request(request)
    if factory is not None:
        if not factories_for_membership(membership).filter(pk=factory.pk).exists():
            raise PermissionDenied("The factory is not available to this membership.")
        company = factory.company
    else:
        first_factory = factories_for_membership(membership).select_related("company").first()
        company = first_factory.company if first_factory else None
    if company is None:
        company = membership.tenant.companies.filter(is_active=True).order_by("created_at").first()
    if company is None:
        raise PermissionDenied("The active workspace does not have an available company.")
    return WorkspaceIdentity(
        tenant=membership.tenant,
        company=company,
        user=request.user,
        membership=membership,
    )


def get_workspace_identity() -> WorkspaceIdentity:
    """Return the seed identity used only by trusted management commands."""
    tenant, _ = Tenant.objects.get_or_create(
        slug="vulcan-workspace", defaults={"name": "Vulcan Workspace"}
    )
    # Company names are editable, so they cannot be used as identity keys.
    # Prefer the company already owning this workspace's factories; this keeps
    # the identity stable across profile renames and prevents orphan companies.
    company = (
        Company.objects.filter(tenant=tenant, factories__is_active=True)
        .distinct()
        .order_by("created_at")
        .first()
    )
    if company is None:
        company = Company.objects.filter(tenant=tenant).order_by("created_at").first()
    if company is None:
        company = Company.objects.create(
            tenant=tenant,
            name="My company",
            legal_name="",
        )
    user, _ = get_user_model().objects.get_or_create(
        username="vulcan-workspace",
        defaults={"first_name": "Vulcan", "last_name": "Team", "is_active": True},
    )
    return WorkspaceIdentity(tenant=tenant, company=company, user=user)


def get_or_create_default_factory(identity: WorkspaceIdentity) -> Factory:
    factory = Factory.objects.filter(tenant=identity.tenant, is_active=True).first()
    if factory:
        return factory
    return Factory.objects.create(
        tenant=identity.tenant,
        company=identity.company,
        name="My Factory",
        code="FACTORY-01",
        timezone="Asia/Kolkata",
        configuration={"currency": "INR", "industry": ""},
    )
