from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("operations", "0003_remove_upload_unique_upload_checksum_per_factory"),
    ]

    operations = [
        migrations.AddField(
            model_name="upload",
            name="import_context",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
