import pytest
from apps.tenancy.models import EmailIdentity, Membership, Role
from django.contrib.auth import authenticate, get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def automotive_showcase_settings(settings):
    settings.VULCAN_VARIANT = "automotive"
    settings.SINGLE_NODE = True


def run_create(monkeypatch, *, email="new.member@example.com", password=None, **options):
    password = password or "Quartz-River-Showcase-Member-2026"
    responses = iter([password, password])
    monkeypatch.setattr("getpass.getpass", lambda _prompt: next(responses))
    call_command(
        "create_showcase_user",
        email=email,
        name="New Member",
        verbosity=0,
        **options,
    )
    return password


def test_command_creates_email_login_and_read_only_membership(monkeypatch, tenant, factory):
    factory.code = "MYP-MYS"
    factory.save(update_fields=["code"])

    password = run_create(monkeypatch)

    identity = EmailIdentity.objects.select_related("user").get(
        email="new.member@example.com"
    )
    membership = Membership.objects.get(user=identity.user, tenant=tenant)
    assert membership.role == Role.EXECUTIVE
    assert membership.all_factories is True
    assert authenticate(email="NEW.MEMBER@example.com", password=password) == identity.user


def test_command_accepts_an_explicit_workspace_role(monkeypatch, tenant, factory):
    factory.code = "MYP-MYS"
    factory.save(update_fields=["code"])

    run_create(monkeypatch, role=Role.COMPANY_ADMIN)

    membership = Membership.objects.get(user__email="new.member@example.com")
    assert membership.role == Role.COMPANY_ADMIN


def test_command_rejects_duplicate_email_without_partial_user(monkeypatch, user, tenant, factory):
    factory.code = "MYP-MYS"
    factory.save(update_fields=["code"])
    original_count = get_user_model().objects.count()

    with pytest.raises(CommandError, match="already uses that email"):
        run_create(monkeypatch, email=" MANAGER@EXAMPLE.COM ")

    assert get_user_model().objects.count() == original_count


def test_command_requires_a_seeded_variant_tenant(monkeypatch):
    with pytest.raises(CommandError, match="Seed this variant"):
        run_create(monkeypatch)
