import json

import pytest
from apps.audit.models import AuditEvent
from apps.tenancy.models import EmailIdentity
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import PBKDF2PasswordHasher, identify_hasher
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import Client

pytestmark = pytest.mark.django_db

INVALID_CREDENTIALS = {"detail": "The email or password is incorrect."}


@pytest.fixture(autouse=True)
def clear_auth_throttles():
    cache.clear()
    yield
    cache.clear()


def csrf_token(client):
    response = client.get("/api/auth/csrf/")
    assert response.status_code == 200
    assert response["Cache-Control"] == "private, no-store"
    assert response.cookies["csrftoken"]["httponly"] is True
    return response.json()["csrfToken"]


def post_login(client, token, email="manager@example.com", password="test-password"):
    return client.post(
        "/api/auth/login/",
        data=json.dumps({"email": email, "password": password}),
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token,
    )


def test_email_login_creates_rotated_authenticated_session(user, membership):
    secure_client = Client(enforce_csrf_checks=True)
    anonymous_session = secure_client.session
    anonymous_session["pre_auth"] = "discard-me"
    anonymous_session.save()
    old_session_key = anonymous_session.session_key

    response = post_login(secure_client, csrf_token(secure_client))

    assert response.status_code == 200
    assert response.json()["email"] == "manager@example.com"
    assert secure_client.session.session_key != old_session_key
    assert secure_client.session["active_membership_id"] == str(membership.id)
    assert secure_client.get("/api/auth/me/").status_code == 200
    assert AuditEvent.objects.filter(actor=user, event_type="auth.login").exists()
    assert identify_hasher(user.password).algorithm == "argon2"


def test_login_requires_csrf_even_before_authentication(user, membership):
    secure_client = Client(enforce_csrf_checks=True)

    response = secure_client.post(
        "/api/auth/login/",
        data=json.dumps({"email": user.email, "password": "test-password"}),
        content_type="application/json",
    )

    assert response.status_code == 403
    assert "sessionid" not in response.cookies


def test_email_login_is_case_insensitive_and_trimmed(user, membership):
    secure_client = Client(enforce_csrf_checks=True)

    response = post_login(
        secure_client,
        csrf_token(secure_client),
        email="  MANAGER@EXAMPLE.COM  ",
    )

    assert response.status_code == 200


def test_successful_login_upgrades_a_legacy_password_hash(user, membership):
    user.password = PBKDF2PasswordHasher().encode("test-password", "legacy-salt")
    user.save(update_fields=["password"])
    assert identify_hasher(user.password).algorithm == "pbkdf2_sha256"
    secure_client = Client(enforce_csrf_checks=True)

    response = post_login(secure_client, csrf_token(secure_client))

    assert response.status_code == 200
    user.refresh_from_db()
    assert identify_hasher(user.password).algorithm == "argon2"


def test_unknown_email_and_wrong_password_have_identical_public_response(user, membership):
    first = Client(enforce_csrf_checks=True)
    second = Client(enforce_csrf_checks=True)

    unknown = post_login(first, csrf_token(first), email="unknown@example.com")
    incorrect = post_login(second, csrf_token(second), password="incorrect-password")

    assert unknown.status_code == incorrect.status_code == 401
    assert unknown.json() == incorrect.json() == INVALID_CREDENTIALS


@pytest.mark.parametrize("disabled_object", ["user", "membership", "tenant"])
def test_inactive_accounts_have_the_generic_login_response(
    disabled_object, user, membership, tenant
):
    instance = {"user": user, "membership": membership, "tenant": tenant}[disabled_object]
    instance.is_active = False
    instance.save(update_fields=["is_active"])
    secure_client = Client(enforce_csrf_checks=True)

    response = post_login(secure_client, csrf_token(secure_client))

    assert response.status_code == 401
    assert response.json() == INVALID_CREDENTIALS


def test_malformed_or_oversized_credentials_are_rejected_generically(user, membership):
    secure_client = Client(enforce_csrf_checks=True)
    token = csrf_token(secure_client)
    response = post_login(
        secure_client,
        token,
        email="not-an-email",
        password="x" * 1025,
    )
    non_object = secure_client.post(
        "/api/auth/login/",
        data=json.dumps([]),
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token,
    )

    assert response.status_code == 401
    assert response.json() == INVALID_CREDENTIALS
    assert non_object.status_code == 401
    assert non_object.json() == INVALID_CREDENTIALS


def test_unique_identity_prevents_ambiguous_legacy_email_login(user, membership):
    other = get_user_model().objects.create_user(
        username="other-manager",
        email="MANAGER@example.com",
        password="another-secure-password",
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        EmailIdentity.objects.create(user=other, email=other.email)


def test_login_is_throttled_by_normalized_account(user, membership):
    secure_client = Client(enforce_csrf_checks=True, REMOTE_ADDR="203.0.113.10")
    token = csrf_token(secure_client)

    responses = [
        post_login(
            secure_client,
            token,
            email="UNKNOWN@example.com",
            password=f"incorrect-{attempt}",
        )
        for attempt in range(6)
    ]

    assert [response.status_code for response in responses[:5]] == [401] * 5
    assert responses[5].status_code == 429


def test_successful_login_clears_only_the_account_throttle_window(user, membership):
    secure_client = Client(enforce_csrf_checks=True, REMOTE_ADDR="203.0.113.20")
    token = csrf_token(secure_client)
    for _ in range(4):
        assert post_login(secure_client, token, password="incorrect").status_code == 401

    assert post_login(secure_client, token).status_code == 200
    refreshed_token = csrf_token(secure_client)
    assert post_login(secure_client, refreshed_token, password="incorrect").status_code == 401


def test_successful_login_does_not_reset_the_ip_spray_limit(user, membership):
    secure_client = Client(enforce_csrf_checks=True, REMOTE_ADDR="203.0.113.21")
    token = csrf_token(secure_client)
    for attempt in range(5):
        assert (
            post_login(
                secure_client,
                token,
                email=f"unknown-before-{attempt}@example.com",
                password="incorrect",
            ).status_code
            == 401
        )

    assert post_login(secure_client, token).status_code == 200
    refreshed_token = csrf_token(secure_client)
    for attempt in range(4):
        assert (
            post_login(
                secure_client,
                refreshed_token,
                email=f"unknown-after-{attempt}@example.com",
                password="incorrect",
            ).status_code
            == 401
        )

    blocked = post_login(
        secure_client,
        refreshed_token,
        email="unknown-blocked@example.com",
        password="incorrect",
    )
    assert blocked.status_code == 429


def test_logout_requires_csrf_and_invalidates_the_server_session(user, membership):
    secure_client = Client(enforce_csrf_checks=True)
    assert post_login(secure_client, csrf_token(secure_client)).status_code == 200

    rejected = secure_client.post("/api/auth/logout/")
    assert rejected.status_code == 403
    assert secure_client.get("/api/auth/me/").status_code == 200

    logged_out = secure_client.post(
        "/api/auth/logout/",
        HTTP_X_CSRFTOKEN=csrf_token(secure_client),
    )

    assert logged_out.status_code == 204
    assert secure_client.get("/api/auth/me/").status_code == 200
    assert AuditEvent.objects.filter(actor=user, event_type="auth.logout").exists()


def test_logout_flushes_the_session_after_membership_revocation(user, membership):
    secure_client = Client(enforce_csrf_checks=True)
    assert post_login(secure_client, csrf_token(secure_client)).status_code == 200
    membership.is_active = False
    membership.save(update_fields=["is_active"])

    response = secure_client.post(
        "/api/auth/logout/",
        HTTP_X_CSRFTOKEN=csrf_token(secure_client),
    )

    assert response.status_code == 204
    assert secure_client.get("/api/auth/me/").status_code == 200


def test_anonymous_me_returns_default_workspace_identity():
    response = Client().get("/api/auth/me/")

    assert response.status_code == 200
    assert response.json()["role"] == "platform_admin"
