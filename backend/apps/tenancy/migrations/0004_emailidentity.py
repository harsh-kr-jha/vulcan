import collections
import unicodedata
import uuid

import django.db.models.deletion
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import migrations, models


def backfill_unique_email_identities(apps, schema_editor):
    user_model = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    email_identity = apps.get_model("tenancy", "EmailIdentity")
    candidates = []
    invalid_count = 0
    for user_id, raw_email in user_model.objects.exclude(email="").values_list("pk", "email"):
        normalized = unicodedata.normalize("NFKC", str(raw_email)).strip().casefold()
        if not normalized:
            continue
        try:
            if len(normalized) > 254:
                raise ValidationError("Email address exceeds the login identity limit.")
            validate_email(normalized)
        except ValidationError:
            invalid_count += 1
            continue
        candidates.append((user_id, normalized))

    counts = collections.Counter(email for _, email in candidates)
    duplicate_count = sum(1 for count in counts.values() if count > 1)
    if invalid_count or duplicate_count:
        problems = []
        if invalid_count:
            problems.append(f"{invalid_count} invalid value(s)")
        if duplicate_count:
            problems.append(f"{duplicate_count} duplicate normalized value(s)")
        raise RuntimeError(
            "Email identity migration blocked: resolve legacy user email data before retrying "
            f"({'; '.join(problems)})."
        )
    email_identity.objects.bulk_create(
        [
            email_identity(user_id=user_id, email=email)
            for user_id, email in candidates
        ]
    )


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("tenancy", "0003_alter_factorymaster_kind"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmailIdentity",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("email", models.CharField(max_length=254, unique=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="email_identity",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"verbose_name_plural": "email identities"},
        ),
        migrations.RunPython(backfill_unique_email_identities, migrations.RunPython.noop),
    ]
