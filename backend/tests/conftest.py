import pytest
from apps.tenancy.models import Company, EmailIdentity, Factory, Membership, Role, Tenant
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture
def user():
    user = get_user_model().objects.create_user(
        username="manager", email="manager@example.com", password="test-password"
    )
    EmailIdentity.objects.create(user=user, email=user.email)
    return user


@pytest.fixture
def tenant():
    return Tenant.objects.create(name="Vulcan Manufacturing", slug="vulcan")


@pytest.fixture
def factory(tenant):
    company = Company.objects.create(tenant=tenant, name="Vulcan India")
    return Factory.objects.create(
        tenant=tenant,
        company=company,
        name="Pune Plant 01",
        code="PNQ-01",
    )


@pytest.fixture
def membership(user, tenant, factory):
    return Membership.objects.create(
        user=user,
        tenant=tenant,
        role=Role.COMPANY_ADMIN,
        all_factories=True,
    )


@pytest.fixture
def api_client(user, membership):
    client = APIClient()
    client.force_authenticate(user)
    return client
