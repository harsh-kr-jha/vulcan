import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("spatial", "0005_spatial_visualization")]

    operations = [
        migrations.AddField(
            model_name="spatialmachine",
            name="representation",
            field=models.CharField(
                choices=[("block", "Block"), ("glb", "GLB model")],
                default="block",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="spatialmachine",
            name="block_color",
            field=models.CharField(default="#DBEAFE", max_length=7),
        ),
        migrations.AddField(
            model_name="spatialmachine",
            name="model_transform",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.CreateModel(
            name="MachineModelAsset",
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
                (
                    "content_type",
                    models.CharField(default="model/gltf-binary", max_length=80),
                ),
                ("size_bytes", models.PositiveBigIntegerField()),
                ("checksum_sha256", models.CharField(max_length=64)),
                (
                    "machine",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="model_asset",
                        to="spatial.spatialmachine",
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
    ]
