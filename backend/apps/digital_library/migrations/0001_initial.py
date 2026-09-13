import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="TechnicalStandard",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("code", models.CharField(max_length=80, unique=True)),
                ("title", models.CharField(max_length=240)),
                ("edition", models.CharField(max_length=40)),
                ("publisher", models.CharField(max_length=160)),
                ("scope", models.TextField()),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "Draft"), ("published", "Published")],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("metadata", models.JSONField(blank=True, default=dict)),
            ],
            options={"ordering": ["code"]},
        ),
        migrations.CreateModel(
            name="LibrarySection",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("code", models.CharField(max_length=40)),
                ("slug", models.SlugField(max_length=120)),
                ("title", models.CharField(max_length=240)),
                ("summary", models.TextField(blank=True)),
                ("category", models.CharField(default="section", max_length=40)),
                ("sequence", models.PositiveIntegerField(default=0)),
                ("source_reference", models.CharField(max_length=120)),
                (
                    "parent",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="children",
                        to="digital_library.librarysection",
                    ),
                ),
                (
                    "standard",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sections",
                        to="digital_library.technicalstandard",
                    ),
                ),
            ],
            options={"ordering": ["sequence", "code"]},
        ),
        migrations.CreateModel(
            name="ComponentType",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("code", models.SlugField(max_length=80)),
                ("name", models.CharField(max_length=160)),
                ("description", models.TextField(blank=True)),
                ("applicable_classes", models.JSONField(default=list)),
                ("facing_types", models.JSONField(default=list)),
                ("source_reference", models.CharField(max_length=120)),
                ("sequence", models.PositiveIntegerField(default=0)),
                (
                    "standard",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="components",
                        to="digital_library.technicalstandard",
                    ),
                ),
            ],
            options={"ordering": ["sequence", "name"]},
        ),
        migrations.CreateModel(
            name="Material",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("group", models.CharField(max_length=20)),
                ("designation", models.CharField(max_length=120)),
                ("specification", models.CharField(max_length=120)),
                ("grade", models.CharField(max_length=80)),
                ("product_form", models.CharField(max_length=40)),
                ("rating_table", models.CharField(max_length=40)),
                ("restrictions", models.JSONField(blank=True, default=list)),
                ("source_reference", models.CharField(max_length=120)),
                (
                    "standard",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="materials",
                        to="digital_library.technicalstandard",
                    ),
                ),
            ],
            options={"ordering": ["group", "specification", "grade"]},
        ),
        migrations.CreateModel(
            name="PressureRating",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("material_group", models.CharField(max_length=20)),
                ("pressure_class", models.PositiveIntegerField()),
                ("temperature_min_c", models.DecimalField(decimal_places=2, max_digits=7)),
                ("temperature_max_c", models.DecimalField(decimal_places=2, max_digits=7)),
                ("pressure_bar", models.DecimalField(decimal_places=3, max_digits=9)),
                ("notes", models.JSONField(blank=True, default=list)),
                ("source_reference", models.CharField(max_length=120)),
                (
                    "standard",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pressure_ratings",
                        to="digital_library.technicalstandard",
                    ),
                ),
            ],
            options={"ordering": ["material_group", "pressure_class", "temperature_max_c"]},
        ),
        migrations.CreateModel(
            name="DimensionRecord",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("pressure_class", models.PositiveIntegerField()),
                ("nps", models.DecimalField(decimal_places=2, max_digits=5)),
                ("nps_label", models.CharField(max_length=20)),
                ("facing_type", models.CharField(max_length=40)),
                ("dimensions_mm", models.JSONField(default=dict)),
                ("tolerances", models.JSONField(blank=True, default=dict)),
                ("notes", models.JSONField(blank=True, default=list)),
                ("source_reference", models.CharField(max_length=120)),
                (
                    "component",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="dimension_records",
                        to="digital_library.componenttype",
                    ),
                ),
                (
                    "standard",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="dimension_records",
                        to="digital_library.technicalstandard",
                    ),
                ),
            ],
            options={"ordering": ["component__sequence", "pressure_class", "nps"]},
        ),
        migrations.CreateModel(
            name="TechnicalFigure",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("code", models.CharField(max_length=40)),
                ("title", models.CharField(max_length=200)),
                ("diagram_kind", models.CharField(max_length=80)),
                ("dimension_labels", models.JSONField(default=list)),
                ("description", models.TextField(blank=True)),
                ("source_reference", models.CharField(max_length=120)),
                (
                    "component",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="figures",
                        to="digital_library.componenttype",
                    ),
                ),
                (
                    "standard",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="figures",
                        to="digital_library.technicalstandard",
                    ),
                ),
            ],
            options={"ordering": ["code"]},
        ),
        migrations.CreateModel(
            name="LibraryNote",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("code", models.CharField(max_length=60)),
                ("title", models.CharField(max_length=200)),
                ("body", models.TextField()),
                ("category", models.CharField(max_length=40)),
                ("source_reference", models.CharField(max_length=120)),
                (
                    "components",
                    models.ManyToManyField(
                        blank=True,
                        related_name="library_notes",
                        to="digital_library.componenttype",
                    ),
                ),
                (
                    "materials",
                    models.ManyToManyField(
                        blank=True,
                        related_name="library_notes",
                        to="digital_library.material",
                    ),
                ),
                (
                    "standard",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notes",
                        to="digital_library.technicalstandard",
                    ),
                ),
            ],
            options={"ordering": ["code"]},
        ),
        migrations.AddIndex(
            model_name="librarysection",
            index=models.Index(
                fields=["standard", "category", "sequence"],
                name="digital_lib_standar_93c10c_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="material",
            index=models.Index(
                fields=["standard", "group"], name="digital_lib_standar_c2f2bf_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="material",
            index=models.Index(
                fields=["standard", "grade"], name="digital_lib_standar_2ef53f_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="pressurerating",
            index=models.Index(
                fields=["standard", "material_group", "pressure_class", "temperature_max_c"],
                name="digital_lib_standar_498e99_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="dimensionrecord",
            index=models.Index(
                fields=["standard", "component", "pressure_class", "nps"],
                name="digital_lib_standar_78e78a_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="librarysection",
            constraint=models.UniqueConstraint(
                fields=("standard", "slug"), name="unique_library_section_slug"
            ),
        ),
        migrations.AddConstraint(
            model_name="componenttype",
            constraint=models.UniqueConstraint(
                fields=("standard", "code"), name="unique_library_component_code"
            ),
        ),
        migrations.AddConstraint(
            model_name="material",
            constraint=models.UniqueConstraint(
                fields=("standard", "specification", "grade", "product_form"),
                name="unique_library_material",
            ),
        ),
        migrations.AddConstraint(
            model_name="pressurerating",
            constraint=models.UniqueConstraint(
                fields=(
                    "standard",
                    "material_group",
                    "pressure_class",
                    "temperature_min_c",
                    "temperature_max_c",
                ),
                name="unique_library_pressure_rating",
            ),
        ),
        migrations.AddConstraint(
            model_name="dimensionrecord",
            constraint=models.UniqueConstraint(
                fields=("standard", "component", "pressure_class", "nps", "facing_type"),
                name="unique_library_dimension_record",
            ),
        ),
        migrations.AddConstraint(
            model_name="technicalfigure",
            constraint=models.UniqueConstraint(
                fields=("standard", "code"), name="unique_library_figure_code"
            ),
        ),
        migrations.AddConstraint(
            model_name="librarynote",
            constraint=models.UniqueConstraint(
                fields=("standard", "code"), name="unique_library_note_code"
            ),
        ),
    ]
