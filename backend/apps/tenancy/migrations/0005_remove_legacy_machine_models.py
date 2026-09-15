from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("tenancy", "0004_emailidentity"),
        ("analytics", "0002_canonical_machine_references"),
        ("alerts", "0003_canonical_machine_references"),
    ]
    operations = [
        migrations.DeleteModel(name="Machine"),
        migrations.DeleteModel(name="ProductionLine"),
    ]
