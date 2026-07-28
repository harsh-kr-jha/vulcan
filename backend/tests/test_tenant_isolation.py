import pytest
from apps.operations.models import Upload
from apps.tenancy.models import Company, Factory, Role, Tenant
from django.contrib.auth import get_user_model

pytestmark = pytest.mark.django_db


def create_upload(tenant, factory, user, name):
    return Upload.objects.create(
        tenant=tenant,
        factory=factory,
        original_filename=name,
        file_type="csv",
        file_size=512,
        template_code="production",
        template_version="3",
        uploaded_by=user,
    )


def test_upload_list_is_scoped_to_membership(api_client, user, tenant, factory):
    own = create_upload(tenant, factory, user, "own.csv")

    other_tenant = Tenant.objects.create(name="Other", slug="other")
    other_company = Company.objects.create(tenant=other_tenant, name="Other Co")
    other_factory = Factory.objects.create(
        tenant=other_tenant,
        company=other_company,
        name="Other Plant",
        code="OTHER-01",
    )
    other_user = get_user_model().objects.create_user("other")
    create_upload(other_tenant, other_factory, other_user, "private.csv")

    response = api_client.get("/api/uploads/")

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == str(own.id)


def test_upload_create_rejects_factory_from_another_tenant(api_client, tenant):
    other_tenant = Tenant.objects.create(name="Other", slug="other")
    other_company = Company.objects.create(tenant=other_tenant, name="Other Co")
    other_factory = Factory.objects.create(
        tenant=other_tenant,
        company=other_company,
        name="Other Plant",
        code="OTHER-01",
    )

    response = api_client.post(
        "/api/uploads/",
        {
            "filename": "production.csv",
            "factory": str(other_factory.id),
            "template_code": "production",
            "template_version": "3",
            "size": 100,
            "file_type": "csv",
        },
        format="json",
    )

    assert response.status_code == 400


def test_read_only_executive_cannot_create_upload(api_client, membership, factory):
    membership.role = Role.EXECUTIVE
    membership.save(update_fields=["role"])

    response = api_client.post(
        "/api/uploads/",
        {
            "filename": "production.csv",
            "factory": str(factory.id),
            "template_code": "production",
            "template_version": "3",
            "size": 100,
            "file_type": "csv",
        },
        format="json",
    )

    assert response.status_code == 403
