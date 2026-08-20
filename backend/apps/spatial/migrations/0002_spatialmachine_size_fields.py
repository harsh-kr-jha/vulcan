# Generated migration for adding size_width and size_height to SpatialMachine

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("spatial", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="spatialmachine",
            name="size_width",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="spatialmachine",
            name="size_height",
            field=models.PositiveIntegerField(default=1),
        ),
    ]
