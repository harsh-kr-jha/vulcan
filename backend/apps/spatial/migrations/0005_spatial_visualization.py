import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("spatial", "0004_canonical_machine_current_state"),
        ("tenancy", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="factorylayout",
            name="model_transform",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="spatialmachine",
            name="visual_height",
            field=models.DecimalField(decimal_places=2, default=1, max_digits=6),
        ),
        migrations.AddField(
            model_name="spatialmachine",
            name="rotation_degrees",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.CreateModel(
            name="FactoryZone",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=80)),
                ("zone_type", models.CharField(default="operational", max_length=40)),
                ("color", models.CharField(default="#DBEAFE", max_length=9)),
                ("position_x", models.DecimalField(decimal_places=1, max_digits=7)),
                ("position_y", models.DecimalField(decimal_places=1, max_digits=7)),
                ("width", models.DecimalField(decimal_places=1, max_digits=7)),
                ("height", models.DecimalField(decimal_places=1, max_digits=7)),
                ("display_order", models.PositiveIntegerField(default=0)),
                (
                    "layout",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="zones",
                        to="spatial.factorylayout",
                    ),
                ),
                (
                    "line",
                    models.ForeignKey(
                        blank=True,
                        limit_choices_to={"kind": "lines"},
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="factory_zones",
                        to="tenancy.factorymaster",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT, to="tenancy.tenant"
                    ),
                ),
            ],
            options={"ordering": ["display_order", "name"]},
        ),
        migrations.CreateModel(
            name="FactoryModelAsset",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("filename", models.CharField(max_length=240)),
                ("storage_key", models.CharField(max_length=600)),
                ("content_type", models.CharField(default="model/gltf-binary", max_length=80)),
                ("size_bytes", models.PositiveBigIntegerField()),
                ("checksum_sha256", models.CharField(max_length=64)),
                (
                    "layout",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="model_asset",
                        to="spatial.factorylayout",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT, to="tenancy.tenant"
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="factoryzone",
            index=models.Index(fields=["tenant", "layout"], name="spatial_fac_tenant__c8dd10_idx"),
        ),
    ]
