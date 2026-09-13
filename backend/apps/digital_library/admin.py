from django.contrib import admin

from .models import (
    ComponentType,
    DimensionRecord,
    LibraryNote,
    LibrarySection,
    Material,
    PressureRating,
    TechnicalFigure,
    TechnicalStandard,
)


@admin.register(TechnicalStandard)
class TechnicalStandardAdmin(admin.ModelAdmin):
    list_display = ("code", "edition", "publisher", "status", "updated_at")
    list_filter = ("status", "publisher")
    search_fields = ("code", "title", "scope")


@admin.register(LibrarySection)
class LibrarySectionAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "standard", "category", "sequence")
    list_filter = ("standard", "category")
    search_fields = ("code", "title", "summary", "source_reference")
    autocomplete_fields = ("standard", "parent")


@admin.register(ComponentType)
class ComponentTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "standard", "source_reference")
    list_filter = ("standard",)
    search_fields = ("name", "code", "description")
    autocomplete_fields = ("standard",)


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ("specification", "grade", "product_form", "group", "rating_table")
    list_filter = ("standard", "group", "product_form")
    search_fields = ("specification", "grade", "designation")
    autocomplete_fields = ("standard",)


@admin.register(PressureRating)
class PressureRatingAdmin(admin.ModelAdmin):
    list_display = (
        "material_group",
        "pressure_class",
        "temperature_max_c",
        "pressure_bar",
        "standard",
    )
    list_filter = ("standard", "material_group", "pressure_class")
    autocomplete_fields = ("standard",)


@admin.register(DimensionRecord)
class DimensionRecordAdmin(admin.ModelAdmin):
    list_display = ("component", "pressure_class", "nps_label", "facing_type", "standard")
    list_filter = ("standard", "component", "pressure_class", "facing_type")
    search_fields = ("component__name", "nps_label", "source_reference")
    autocomplete_fields = ("standard", "component")


@admin.register(TechnicalFigure)
class TechnicalFigureAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "component", "standard")
    list_filter = ("standard", "diagram_kind")
    search_fields = ("code", "title", "description")
    autocomplete_fields = ("standard", "component")


@admin.register(LibraryNote)
class LibraryNoteAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "category", "standard")
    list_filter = ("standard", "category")
    search_fields = ("code", "title", "body", "source_reference")
    autocomplete_fields = ("standard", "components", "materials")

