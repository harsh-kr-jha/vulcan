from dataclasses import dataclass

from django.contrib.auth import get_user_model

from apps.tenancy.models import Company, Factory, Tenant


@dataclass(frozen=True)
class WorkspaceIdentity:
    tenant: Tenant
    company: Company
    user: object


def get_workspace_identity() -> WorkspaceIdentity:
    """Return the temporary single-workspace identity used while auth is disabled."""
    tenant, _ = Tenant.objects.get_or_create(
        slug="vulcan-workspace", defaults={"name": "Musroom Workspace"}
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
            name="My mushroom company",
            legal_name="",
        )
    user, _ = get_user_model().objects.get_or_create(
        username="vulcan-workspace",
        defaults={"first_name": "Farm", "last_name": "Team", "is_active": True},
    )
    return WorkspaceIdentity(tenant=tenant, company=company, user=user)


def get_or_create_default_factory(identity: WorkspaceIdentity) -> Factory:
    factory = Factory.objects.filter(tenant=identity.tenant, is_active=True).first()
    if factory:
        return factory
    return Factory.objects.create(
        tenant=identity.tenant,
        company=identity.company,
        name="My Mushroom Farm",
        code="MUSHROOM-01",
        timezone="Asia/Kolkata",
        configuration={"currency": "INR", "industry": "Mushroom cultivation"},
    )
