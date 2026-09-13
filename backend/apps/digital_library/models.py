from django.db import models

from apps.common.models import TimestampedModel, UUIDModel


class TechnicalStandard(UUIDModel, TimestampedModel):
    code = models.CharField(max_length=80, unique=True)
    title = models.CharField(max_length=240)
    edition = models.CharField(max_length=40)
    publisher = models.CharField(max_length=160)
    scope = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=[("draft", "Draft"), ("published", "Published")],
        default="draft",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code}-{self.edition}"


class LibrarySection(UUIDModel, TimestampedModel):
    standard = models.ForeignKey(
        TechnicalStandard, on_delete=models.CASCADE, related_name="sections"
    )
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, related_name="children", null=True, blank=True
    )
    code = models.CharField(max_length=40)
    slug = models.SlugField(max_length=120)
    title = models.CharField(max_length=240)
    summary = models.TextField(blank=True)
    category = models.CharField(max_length=40, default="section")
    sequence = models.PositiveIntegerField(default=0)
    source_reference = models.CharField(max_length=120)

    class Meta:
        ordering = ["sequence", "code"]
        constraints = [
            models.UniqueConstraint(
                fields=["standard", "slug"], name="unique_library_section_slug"
            )
        ]
        indexes = [models.Index(fields=["standard", "category", "sequence"])]

    def __str__(self):
        return f"{self.code} {self.title}"


class ComponentType(UUIDModel, TimestampedModel):
    standard = models.ForeignKey(
        TechnicalStandard, on_delete=models.CASCADE, related_name="components"
    )
    code = models.SlugField(max_length=80)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    applicable_classes = models.JSONField(default=list)
    facing_types = models.JSONField(default=list)
    source_reference = models.CharField(max_length=120)
    sequence = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sequence", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["standard", "code"], name="unique_library_component_code"
            )
        ]

    def __str__(self):
        return self.name


class Material(UUIDModel, TimestampedModel):
    standard = models.ForeignKey(
        TechnicalStandard, on_delete=models.CASCADE, related_name="materials"
    )
    group = models.CharField(max_length=20)
    designation = models.CharField(max_length=120)
    specification = models.CharField(max_length=120)
    grade = models.CharField(max_length=80)
    product_form = models.CharField(max_length=40)
    rating_table = models.CharField(max_length=40)
    restrictions = models.JSONField(default=list, blank=True)
    source_reference = models.CharField(max_length=120)

    class Meta:
        ordering = ["group", "specification", "grade"]
        constraints = [
            models.UniqueConstraint(
                fields=["standard", "specification", "grade", "product_form"],
                name="unique_library_material",
            )
        ]
        indexes = [
            models.Index(fields=["standard", "group"]),
            models.Index(fields=["standard", "grade"]),
        ]

    def __str__(self):
        return f"{self.specification} Gr. {self.grade}"


class PressureRating(UUIDModel, TimestampedModel):
    standard = models.ForeignKey(
        TechnicalStandard, on_delete=models.CASCADE, related_name="pressure_ratings"
    )
    material_group = models.CharField(max_length=20)
    pressure_class = models.PositiveIntegerField()
    temperature_min_c = models.DecimalField(max_digits=7, decimal_places=2)
    temperature_max_c = models.DecimalField(max_digits=7, decimal_places=2)
    pressure_bar = models.DecimalField(max_digits=9, decimal_places=3)
    notes = models.JSONField(default=list, blank=True)
    source_reference = models.CharField(max_length=120)

    class Meta:
        ordering = ["material_group", "pressure_class", "temperature_max_c"]
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "standard",
                    "material_group",
                    "pressure_class",
                    "temperature_min_c",
                    "temperature_max_c",
                ],
                name="unique_library_pressure_rating",
            )
        ]
        indexes = [
            models.Index(
                fields=["standard", "material_group", "pressure_class", "temperature_max_c"]
            )
        ]


class DimensionRecord(UUIDModel, TimestampedModel):
    standard = models.ForeignKey(
        TechnicalStandard, on_delete=models.CASCADE, related_name="dimension_records"
    )
    component = models.ForeignKey(
        ComponentType, on_delete=models.CASCADE, related_name="dimension_records"
    )
    pressure_class = models.PositiveIntegerField()
    nps = models.DecimalField(max_digits=5, decimal_places=2)
    nps_label = models.CharField(max_length=20)
    facing_type = models.CharField(max_length=40)
    dimensions_mm = models.JSONField(default=dict)
    tolerances = models.JSONField(default=dict, blank=True)
    notes = models.JSONField(default=list, blank=True)
    source_reference = models.CharField(max_length=120)

    class Meta:
        ordering = ["component__sequence", "pressure_class", "nps"]
        constraints = [
            models.UniqueConstraint(
                fields=["standard", "component", "pressure_class", "nps", "facing_type"],
                name="unique_library_dimension_record",
            )
        ]
        indexes = [
            models.Index(fields=["standard", "component", "pressure_class", "nps"])
        ]


class TechnicalFigure(UUIDModel, TimestampedModel):
    standard = models.ForeignKey(
        TechnicalStandard, on_delete=models.CASCADE, related_name="figures"
    )
    component = models.ForeignKey(
        ComponentType,
        on_delete=models.SET_NULL,
        related_name="figures",
        null=True,
        blank=True,
    )
    code = models.CharField(max_length=40)
    title = models.CharField(max_length=200)
    diagram_kind = models.CharField(max_length=80)
    dimension_labels = models.JSONField(default=list)
    description = models.TextField(blank=True)
    source_reference = models.CharField(max_length=120)

    class Meta:
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(
                fields=["standard", "code"], name="unique_library_figure_code"
            )
        ]


class LibraryNote(UUIDModel, TimestampedModel):
    standard = models.ForeignKey(
        TechnicalStandard, on_delete=models.CASCADE, related_name="notes"
    )
    components = models.ManyToManyField(ComponentType, related_name="library_notes", blank=True)
    materials = models.ManyToManyField(Material, related_name="library_notes", blank=True)
    code = models.CharField(max_length=60)
    title = models.CharField(max_length=200)
    body = models.TextField()
    category = models.CharField(max_length=40)
    source_reference = models.CharField(max_length=120)

    class Meta:
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(
                fields=["standard", "code"], name="unique_library_note_code"
            )
        ]

