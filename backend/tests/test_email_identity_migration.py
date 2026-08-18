import importlib

import pytest
from apps.tenancy.models import EmailIdentity
from django.apps import apps as django_apps
from django.contrib.auth import get_user_model

pytestmark = pytest.mark.django_db


def run_identity_backfill():
    migration = importlib.import_module("apps.tenancy.migrations.0004_emailidentity")
    migration.backfill_unique_email_identities(django_apps, schema_editor=None)


@pytest.mark.parametrize("email", ["not-an-email", f"user@{'x' * 250}.example"])
def test_identity_backfill_fails_closed_for_invalid_legacy_email(email):
    get_user_model().objects.create_user(username="legacy-user", email=email)

    with pytest.raises(RuntimeError, match=r"1 invalid value\(s\)"):
        run_identity_backfill()

    assert not EmailIdentity.objects.exists()


def test_identity_backfill_fails_closed_for_normalized_duplicates():
    get_user_model().objects.create_user(username="legacy-one", email="User@Example.com")
    get_user_model().objects.create_user(username="legacy-two", email=" user@example.com ")

    with pytest.raises(RuntimeError, match=r"1 duplicate normalized value\(s\)"):
        run_identity_backfill()

    assert not EmailIdentity.objects.exists()
