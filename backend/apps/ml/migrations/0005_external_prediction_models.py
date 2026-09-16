import uuid

import django.db.models.deletion
from django.db import migrations, models


def remove_legacy_model_references(apps, schema_editor):
    FeatureSnapshot = apps.get_model("ml", "FeatureSnapshot")
    FeatureSnapshot.objects.filter(model_id__isnull=False).update(model_id=None)


class Migration(migrations.Migration):
    dependencies = [("ml", "0004_featuresnapshot_ml_snapshot_check_idx_and_more")]

    operations = [
        migrations.CreateModel(
            name="PredictionModel",
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
                ("name", models.SlugField(max_length=80)),
                ("version", models.CharField(max_length=40)),
                ("runtime", models.CharField(default="sklearn-joblib", max_length=30)),
                ("metrics", models.JSONField(default=dict)),
                ("artifact_key", models.TextField(blank=True)),
                ("manifest_key", models.TextField(blank=True)),
                ("checksum", models.CharField(blank=True, max_length=64)),
                ("threshold", models.FloatField(default=0.5)),
                ("active", models.BooleanField(default=False)),
                (
                    "profile",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        to="ml.productionprofile",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        to="tenancy.tenant",
                    ),
                ),
            ],
        ),
        migrations.RunPython(remove_legacy_model_references, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="featuresnapshot",
            name="model",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                to="ml.predictionmodel",
            ),
        ),
        migrations.AddIndex(
            model_name="predictionmodel",
            index=models.Index(fields=["profile", "active"], name="ml_model_active_idx"),
        ),
        migrations.AddConstraint(
            model_name="predictionmodel",
            constraint=models.UniqueConstraint(
                fields=("profile", "name", "version"),
                name="ml_model_profile_version",
            ),
        ),
        migrations.DeleteModel(name="TrainingRun"),
    ]
