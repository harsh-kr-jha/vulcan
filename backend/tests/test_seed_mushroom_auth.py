import pytest
from apps.tenancy.management.commands.seed_mushroom import Command
from apps.tenancy.models import EmailIdentity, Membership, Role
from apps.tenancy.services import WorkspaceIdentity
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError

pytestmark = pytest.mark.django_db


def test_seed_mushroom_without_credentials_does_not_create_a_login(
    monkeypatch, capsys, settings
):
    settings.DEBUG = True
    monkeypatch.delenv("MUSHROOM_DEMO_EMAIL", raising=False)
    monkeypatch.delenv("MUSHROOM_DEMO_PASSWORD", raising=False)

    call_command("seed_mushroom", verbosity=0)

    assert not get_user_model().objects.filter(username="mushroom-demo-login").exists()
    assert "No demo login provisioned" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("email", "password"),
    [
        ("operator@example.com", ""),
        ("", "Saffron-Meteor-Factory-2026"),
        ("not-an-email", "Saffron-Meteor-Factory-2026"),
        ("operator@example.com", "too-short"),
    ],
)
def test_seed_mushroom_rejects_partial_or_invalid_credentials(monkeypatch, email, password):
    monkeypatch.setenv("MUSHROOM_DEMO_EMAIL", email)
    monkeypatch.setenv("MUSHROOM_DEMO_PASSWORD", password)

    with pytest.raises(CommandError):
        Command().demo_credentials()


def test_seed_mushroom_provisions_and_rotates_one_least_privilege_login(
    monkeypatch, user, tenant, factory
):
    command = Command()
    workspace_identity = WorkspaceIdentity(
        tenant=tenant,
        company=factory.company,
        user=user,
    )
    first_password = "Saffron-Meteor-Factory-2026"
    monkeypatch.setenv("MUSHROOM_DEMO_EMAIL", " Demo.Operator@Example.com ")
    monkeypatch.setenv("MUSHROOM_DEMO_PASSWORD", first_password)
    command.provision_demo_login(workspace_identity, *command.demo_credentials())

    demo_user = get_user_model().objects.get(username="mushroom-demo-login")
    identity = EmailIdentity.objects.get(user=demo_user)
    membership = Membership.objects.get(user=demo_user, tenant=tenant)
    assert identity.email == "demo.operator@example.com"
    assert demo_user.check_password(first_password)
    assert demo_user.is_active is True
    assert demo_user.is_staff is False
    assert demo_user.is_superuser is False
    assert membership.role == Role.COMPANY_ADMIN
    assert membership.all_factories is True
    assert membership.is_active is True

    rotated_password = "Juniper-Comet-Rotation-2026"
    monkeypatch.setenv("MUSHROOM_DEMO_EMAIL", "rotated.operator@example.com")
    monkeypatch.setenv("MUSHROOM_DEMO_PASSWORD", rotated_password)
    command.provision_demo_login(workspace_identity, *command.demo_credentials())

    demo_user.refresh_from_db()
    identity.refresh_from_db()
    assert get_user_model().objects.filter(username="mushroom-demo-login").count() == 1
    assert identity.email == "rotated.operator@example.com"
    assert demo_user.check_password(rotated_password)
    assert not demo_user.check_password(first_password)
