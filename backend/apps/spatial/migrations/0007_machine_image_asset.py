import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("spatial", "0006_machine_visual_models")]

    operations = [
        migrations.CreateModel(
            name="MachineImageAsset",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("filename", models.CharField(max_length=240)),
                ("storage_key", models.CharField(max_length=600)),
                ("content_type", models.CharField(max_length=40)),
                ("size_bytes", models.PositiveBigIntegerField()),
                ("checksum_sha256", models.CharField(max_length=64)),
                ("machine", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="image_asset", to="spatial.spatialmachine")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="tenancy.tenant")),
            ],
        ),
    ]
