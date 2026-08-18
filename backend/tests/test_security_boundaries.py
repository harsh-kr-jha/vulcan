import json
import uuid

import pytest
from apps.audit.models import AuditEvent
from apps.operations.models import Upload
from apps.tenancy.models import Factory, Role
from django.test import Client

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/factories/"),
        ("post", "/api/factories/"),
        ("get", "/api/factory-masters/"),
        ("post", "/api/factory-masters/"),
        ("get", "/api/workspace/"),
        ("patch", "/api/workspace/configuration/"),
        ("post", "/api/workspace/actions/"),
        ("post", "/api/workspace/ask/"),
        ("get", "/api/imports/template/production/"),
        ("post", "/api/imports/inspect/"),
        ("post", f"/api/imports/{uuid.uuid4()}/validate/"),
        ("get", f"/api/imports/{uuid.uuid4()}/preview/"),
        ("get", f"/api/imports/{uuid.uuid4()}/edit/"),
        ("delete", f"/api/imports/{uuid.uuid4()}/delete/"),
        ("post", f"/api/imports/{uuid.uuid4()}/commit/"),
        ("post", f"/api/imports/{uuid.uuid4()}/cancel/"),
    ],
)
def test_formerly_public_workspace_endpoints_deny_anonymous_requests(method, path):
    response = getattr(Client(), method)(path, content_type="application/json")

    assert response.status_code == 401
    assert response["Cache-Control"] == "private, no-store"


def test_membership_factory_scope_applies_to_every_object_lookup(
    api_client, user, tenant, factory, membership
):
    membership.all_factories = False
    membership.save(update_fields=["all_factories"])
    membership.factories.add(factory)
    hidden_factory = Factory.objects.create(
        tenant=tenant,
        company=factory.company,
        name="Hidden plant",
        code="HIDDEN-01",
    )
    hidden_upload = Upload.objects.create(
        tenant=tenant,
        factory=hidden_factory,
        original_filename="hidden.csv",
        file_type="csv",
        uploaded_by=user,
        template_code="production",
        template_version="1",
    )

    listed = api_client.get("/api/factories/")

    assert listed.status_code == 200
    assert [result["id"] for result in listed.data["results"]] == [str(factory.id)]
    assert api_client.get(f"/api/factories/{hidden_factory.id}/").status_code == 404
    assert api_client.get(f"/api/workspace/?factory={hidden_factory.id}").status_code == 404
    assert (
        api_client.get(f"/api/factory-masters/?factory={hidden_factory.id}").status_code == 404
    )
    assert api_client.get(f"/api/imports/{hidden_upload.id}/preview/").status_code == 404


def test_read_only_role_can_read_but_cannot_mutate_workspace(api_client, factory, membership):
    membership.role = Role.EXECUTIVE
    membership.save(update_fields=["role"])

    assert api_client.get(f"/api/workspace/?factory={factory.id}").status_code == 200
    assert (
        api_client.patch(
            f"/api/workspace/configuration/?factory={factory.id}",
            {"industry": "Forbidden change"},
            format="json",
        ).status_code
        == 403
    )
    assert (
        api_client.post(
            "/api/factories/",
            {"name": "Forbidden", "code": "NOPE"},
            format="json",
        ).status_code
        == 403
    )
    assert (
        api_client.post(
            "/api/workspace/actions/",
            {"factory": factory.id, "title": "Forbidden"},
            format="json",
        ).status_code
        == 403
    )
    assert api_client.post("/api/imports/inspect/", {}, format="multipart").status_code == 403


def test_factory_admin_cannot_expand_its_own_factory_scope(
    api_client, factory, membership
):
    membership.role = Role.FACTORY_ADMIN
    membership.all_factories = False
    membership.save(update_fields=["role", "all_factories"])
    membership.factories.add(factory)

    response = api_client.post(
        "/api/factories/",
        {"name": "Unauthorized expansion", "code": "ESCALATE-01"},
        format="json",
    )

    assert response.status_code == 403
    assert not Factory.objects.filter(code="ESCALATE-01").exists()


def test_factory_admin_cannot_rename_the_shared_company(api_client, factory, membership):
    membership.role = Role.FACTORY_ADMIN
    membership.all_factories = False
    membership.save(update_fields=["role", "all_factories"])
    membership.factories.add(factory)
    original_name = factory.company.name

    response = api_client.patch(
        f"/api/workspace/configuration/?factory={factory.id}",
        {"name": "Unauthorized company rename"},
        format="json",
    )

    factory.company.refresh_from_db()
    assert response.status_code == 403
    assert factory.company.name == original_name


def test_authenticated_mutations_still_require_csrf(user, membership, factory):
    secure_client = Client(enforce_csrf_checks=True)
    token = secure_client.get("/api/auth/csrf/").json()["csrfToken"]
    logged_in = secure_client.post(
        "/api/auth/login/",
        data=json.dumps({"email": user.email, "password": "test-password"}),
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert logged_in.status_code == 200

    response = secure_client.patch(
        f"/api/workspace/configuration/?factory={factory.id}",
        data=json.dumps({"industry": "Should not save"}),
        content_type="application/json",
    )

    assert response.status_code == 403


def test_forwarded_ip_is_ignored_until_proxy_trust_is_configured(user, membership):
    secure_client = Client(
        enforce_csrf_checks=True,
        REMOTE_ADDR="198.51.100.8",
        HTTP_X_FORWARDED_FOR="203.0.113.99",
    )
    token = secure_client.get("/api/auth/csrf/").json()["csrfToken"]

    response = secure_client.post(
        "/api/auth/login/",
        data=json.dumps({"email": user.email, "password": "test-password"}),
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token,
    )

    assert response.status_code == 200
    assert AuditEvent.objects.get(event_type="auth.login").ip_address == "198.51.100.8"
