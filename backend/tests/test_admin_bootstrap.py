import pytest
from apps.tenancy.admin import (
    EmailIdentityInline,
    MembershipInline,
    VulcanUserAdmin,
    configure_vulcan_user_admin,
)
from apps.tenancy.models import EmailIdentity
from django.contrib import admin
from django.contrib.auth import authenticate, get_user_model
from django.core.management import call_command, get_commands
from django.core.management.base import CommandError

pytestmark = pytest.mark.django_db


def test_vulcan_user_admin_combines_login_identity_and_membership():
    configure_vulcan_user_admin()

    registered = admin.site._registry[get_user_model()]
    assert isinstance(registered, VulcanUserAdmin)
    assert registered.inlines == (EmailIdentityInline, MembershipInline)


def test_project_overrides_stock_createsuperuser_with_email_identity_command():
    assert get_commands()["createsuperuser"] == "apps.tenancy"


def test_noninteractive_createsuperuser_atomically_creates_email_login(monkeypatch):
    password = "Quartz-River-Administrator-2026"
    monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", " Root.Admin@Example.com ")
    monkeypatch.setenv("DJANGO_SUPERUSER_USERNAME", "root-admin")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", password)

    call_command("createsuperuser", interactive=False, verbosity=0)

    user = get_user_model().objects.get(username="root-admin")
    assert user.is_staff is True
    assert user.is_superuser is True
    assert EmailIdentity.objects.get(user=user).email == "root.admin@example.com"
    assert authenticate(email="ROOT.ADMIN@example.com", password=password) == user


def test_createsuperuser_rejects_weak_password_without_partial_user(monkeypatch):
    monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", "root@example.com")
    monkeypatch.setenv("DJANGO_SUPERUSER_USERNAME", "root-admin")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "short")

    with pytest.raises(CommandError):
        call_command("createsuperuser", interactive=False, verbosity=0)

    assert not get_user_model().objects.filter(username="root-admin").exists()
    assert not EmailIdentity.objects.filter(email="root@example.com").exists()


def test_createsuperuser_rejects_duplicate_normalized_email(monkeypatch, user):
    monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", " MANAGER@EXAMPLE.COM ")
    monkeypatch.setenv("DJANGO_SUPERUSER_USERNAME", "second-admin")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "Quartz-River-Administrator-2026")

    with pytest.raises(CommandError, match="already uses that email"):
        call_command("createsuperuser", interactive=False, verbosity=0)

    assert not get_user_model().objects.filter(username="second-admin").exists()
