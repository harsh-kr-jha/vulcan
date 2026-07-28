import pytest
from apps.tenancy.models import Company, Factory, Membership, Role, Tenant
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture
def user():
    return get_user_model().objects.create_user(
        username="manager", email="manager@example.com", password="test-password"
    )


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
def membership(user, tenant):
    return Membership.objects.create(
        user=user,
        tenant=tenant,
        role=Role.FACTORY_MANAGER,
        all_factories=True,
    )


@pytest.fixture
def api_client(user, membership):
    client = APIClient()
    client.force_authenticate(user)
    return client
