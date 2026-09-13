from decimal import Decimal

from django.db.models import Q

from .models import (
    ComponentType,
    DimensionRecord,
    LibraryNote,
    LibrarySection,
    Material,
    TechnicalFigure,
    TechnicalStandard,
)

MM_PER_INCH = Decimal("25.4")
PSI_PER_BAR = Decimal("14.5037738")
DIMENSION_LABELS = {
    "outsideDiameter": ("Outside diameter", "O"),
    "flangeThickness": ("Minimum flange thickness", "tf"),
    "hubDiameter": ("Hub diameter", "X"),
    "hubAtWeld": ("Hub diameter at weld", "Ah"),
    "lengthThroughHub": ("Length through hub", "Y"),
    "minimumThreadLength": ("Minimum thread length", "T"),
    "bore": ("Bore", "B"),
    "boltCircle": ("Bolt circle", "W"),
    "numberOfBoltHoles": ("Number of bolt holes", ""),
    "boltHoleDiameter": ("Bolt-hole diameter", ""),
    "boltDiameter": ("Bolt diameter", ""),
}


def published_standard(code):
    return TechnicalStandard.objects.filter(code=code, status="published").first()


def standard_catalog(standard):
    sections = list(
        standard.sections.values(
            "id", "code", "slug", "title", "summary", "category", "source_reference"
        )
    )
    components = list(
        standard.components.values(
            "id",
            "code",
            "name",
            "description",
            "applicable_classes",
            "facing_types",
            "source_reference",
        )
    )
    materials = [serialize_material(item) for item in standard.materials.all()]
    return {
        "standard": {
            "id": str(standard.id),
            "code": standard.code,
            "designation": standard.metadata.get("designation", standard.code),
            "title": standard.title,
            "edition": standard.edition,
            "publisher": standard.publisher,
            "scope": standard.scope,
            "metadata": standard.metadata,
        },
        "sections": [{**item, "id": str(item["id"])} for item in sections],
        "components": [{**item, "id": str(item["id"])} for item in components],
        "materials": materials,
        "counts": {
            "sections": len(sections),
            "components": len(components),
            "materials": len(materials),
            "ratings": standard.pressure_ratings.count(),
            "dimensions": standard.dimension_records.count(),
            "figures": standard.figures.count(),
        },
    }


def serialize_material(material):
    return {
        "id": str(material.id),
        "group": material.group,
        "designation": material.designation,
        "specification": material.specification,
        "grade": material.grade,
        "name": f"{material.specification} Gr. {material.grade}",
        "productForm": material.product_form,
        "ratingTable": material.rating_table,
        "restrictions": material.restrictions,
        "sourceReference": material.source_reference,
    }


def rating_options(standard, params):
    material_group = params.get("material_group", "")
    material_id = params.get("material", "")
    pressure_class = params.get("pressure_class", "")
    materials = standard.materials.all()
    if material_group:
        materials = materials.filter(group=material_group)
    if material_id:
        selected = materials.filter(id=material_id).first()
        if selected:
            material_group = selected.group
    ratings = standard.pressure_ratings.all()
    if material_group:
        ratings = ratings.filter(material_group=material_group)
    pressure_classes = sorted(set(ratings.values_list("pressure_class", flat=True)))
    if pressure_class:
        ratings = ratings.filter(pressure_class=pressure_class)
    temperatures = []
    for minimum, maximum in ratings.values_list(
        "temperature_min_c", "temperature_max_c"
    ).distinct():
        label = f"{minimum:g} to {maximum:g}" if minimum != maximum else f"{maximum:g}"
        temperatures.append({"value": float(maximum), "label": label})
    temperatures.sort(key=lambda item: item["value"])
    return {
        "materialGroups": list(
            standard.materials.order_by("group").values_list("group", flat=True).distinct()
        ),
        "materials": [serialize_material(item) for item in materials],
        "pressureClasses": pressure_classes,
        "temperaturesC": temperatures,
    }


def rating_result(standard, params):
    try:
        material = standard.materials.get(id=params.get("material"))
        pressure_class = int(params.get("pressure_class", ""))
        temperature = Decimal(params.get("temperature", ""))
    except (Material.DoesNotExist, TypeError, ValueError, ArithmeticError):
        return None
    rating = (
        standard.pressure_ratings.filter(
            material_group=material.group,
            pressure_class=pressure_class,
            temperature_min_c__lte=temperature,
            temperature_max_c__gte=temperature,
        )
        .order_by("temperature_max_c")
        .first()
    )
    if not rating:
        return None
    customary = params.get("units") == "us-customary"
    pressure = rating.pressure_bar * PSI_PER_BAR if customary else rating.pressure_bar
    temperature_value = temperature * Decimal("1.8") + 32 if customary else temperature
    linked_notes = LibraryNote.objects.filter(
        Q(materials=material) | Q(components__isnull=False), standard=standard
    ).distinct()
    return {
        "material": serialize_material(material),
        "pressureClass": pressure_class,
        "temperature": float(temperature_value),
        "temperatureUnit": "°F" if customary else "°C",
        "maximumAllowablePressure": float(pressure.quantize(Decimal("0.1"))),
        "pressureUnit": "psi" if customary else "bar",
        "notes": material.restrictions + rating.notes + [item.body for item in linked_notes],
        "source": {
            "standard": standard.metadata.get("designation", standard.code),
            "reference": rating.source_reference,
            "table": material.rating_table,
        },
    }


def dimension_options(standard, params):
    base_records = standard.dimension_records.select_related("component")
    component = params.get("component", "")
    pressure_class = params.get("pressure_class", "")
    nps = params.get("nps", "")
    components = ComponentType.objects.filter(
        id__in=base_records.values_list("component_id", flat=True), standard=standard
    )
    class_records = base_records
    if component:
        class_records = class_records.filter(component__code=component)
    pressure_classes = sorted(
        set(class_records.values_list("pressure_class", flat=True))
    )
    size_records = class_records
    if pressure_class:
        size_records = size_records.filter(pressure_class=pressure_class)
    sizes = list(size_records.values("nps", "nps_label").distinct())
    sizes.sort(key=lambda item: item["nps"])
    facing_records = size_records
    if nps:
        facing_records = facing_records.filter(nps=nps)
    return {
        "components": list(components.values("code", "name")),
        "pressureClasses": pressure_classes,
        "sizes": [
            {"value": float(item["nps"]), "label": item["nps_label"]} for item in sizes
        ],
        "facingTypes": sorted(set(facing_records.values_list("facing_type", flat=True))),
    }


def dimension_result(standard, params):
    try:
        record = standard.dimension_records.select_related("component").get(
            component__code=params.get("component"),
            pressure_class=int(params.get("pressure_class", "")),
            nps=Decimal(params.get("nps", "")),
            facing_type=params.get("facing", "raised-face"),
        )
    except (DimensionRecord.DoesNotExist, TypeError, ValueError, ArithmeticError):
        return None
    customary = params.get("units") == "us-customary"
    fields = []
    for key, raw_value in record.dimensions_mm.items():
        label, symbol = DIMENSION_LABELS.get(key, (key, ""))
        if key == "numberOfBoltHoles":
            value, unit = raw_value, "—"
        else:
            raw_decimal = Decimal(str(raw_value))
            converted = raw_decimal / MM_PER_INCH if customary else raw_decimal
            places = Decimal("0.001") if customary else Decimal("0.1")
            value, unit = float(converted.quantize(places)), "in" if customary else "mm"
        fields.append({"key": key, "label": label, "symbol": symbol, "value": value, "unit": unit})
    figure = TechnicalFigure.objects.filter(
        standard=standard, component=record.component
    ).first()
    notes = LibraryNote.objects.filter(standard=standard, components=record.component)
    return {
        "component": {
            "code": record.component.code,
            "name": record.component.name,
            "description": record.component.description,
        },
        "pressureClass": record.pressure_class,
        "nps": record.nps_label,
        "facingType": record.facing_type,
        "unitSystem": "us-customary" if customary else "metric",
        "fields": fields,
        "tolerances": record.tolerances,
        "notes": record.notes + [item.body for item in notes],
        "figure": serialize_figure(figure) if figure else None,
        "source": {
            "standard": standard.metadata.get("designation", standard.code),
            "reference": record.source_reference,
        },
    }


def serialize_figure(figure):
    return {
        "id": str(figure.id),
        "code": figure.code,
        "title": figure.title,
        "diagramKind": figure.diagram_kind,
        "dimensionLabels": figure.dimension_labels,
        "description": figure.description,
        "sourceReference": figure.source_reference,
    }


def search_library(standard, query):
    query = query.strip()[:120]
    if len(query) < 2:
        return []
    results = []
    for item in LibrarySection.objects.filter(standard=standard).filter(
        Q(code__icontains=query)
        | Q(title__icontains=query)
        | Q(summary__icontains=query)
    )[:8]:
        results.append(
            {
                "type": "section",
                "title": f"{item.code} · {item.title}",
                "subtitle": item.summary,
                "reference": item.source_reference,
                "target": {"section": item.slug},
            }
        )
    for item in Material.objects.filter(standard=standard).filter(
        Q(specification__icontains=query)
        | Q(grade__icontains=query)
        | Q(designation__icontains=query)
        | Q(group__icontains=query)
    )[:8]:
        results.append(
            {
                "type": "material",
                "title": f"{item.specification} Gr. {item.grade}",
                "subtitle": f"Group {item.group} · {item.designation} · {item.product_form}",
                "reference": item.source_reference,
                "target": {"material": str(item.id), "explorer": "ratings"},
            }
        )
    for item in ComponentType.objects.filter(standard=standard).filter(
        Q(name__icontains=query) | Q(description__icontains=query)
    )[:8]:
        results.append(
            {
                "type": "component",
                "title": item.name,
                "subtitle": item.description,
                "reference": item.source_reference,
                "target": {"component": item.code, "explorer": "dimensions"},
            }
        )
    if query.casefold().startswith(("class", "nps")):
        numeric = "".join(
            character for character in query if character.isdigit() or character == "."
        )
        if numeric:
            if "class" in query.casefold():
                rating_groups = (
                    standard.pressure_ratings.filter(pressure_class=numeric)
                    .values_list("material_group", flat=True)
                    .distinct()[:8]
                )
                for group in rating_groups:
                    results.append(
                        {
                            "type": "pressure rating",
                            "title": f"Group {group} pressure ratings · Class {numeric}",
                            "subtitle": "Select a linked material and temperature.",
                            "reference": f"ASME B16.5-2017, Table 2-{group}",
                            "target": {
                                "materialGroup": group,
                                "pressureClass": numeric,
                                "explorer": "ratings",
                            },
                        }
                    )
            dimension_query = (
                Q(pressure_class=numeric) if "class" in query.casefold() else Q(nps=numeric)
            )
            for item in DimensionRecord.objects.select_related("component").filter(
                dimension_query, standard=standard
            )[:8]:
                results.append(
                    {
                        "type": "dimension",
                        "title": (
                            f"{item.component.name} · Class {item.pressure_class} · "
                            f"NPS {item.nps_label}"
                        ),
                        "subtitle": item.facing_type.replace("-", " ").title(),
                        "reference": item.source_reference,
                        "target": {
                            "component": item.component.code,
                            "pressureClass": item.pressure_class,
                            "nps": float(item.nps),
                            "explorer": "dimensions",
                        },
                    }
                )
    for item in LibraryNote.objects.filter(standard=standard).filter(
        Q(title__icontains=query) | Q(body__icontains=query) | Q(code__icontains=query)
    )[:4]:
        results.append(
            {
                "type": "note",
                "title": item.title,
                "subtitle": item.body,
                "reference": item.source_reference,
                "target": {},
            }
        )
    for item in TechnicalFigure.objects.filter(standard=standard).filter(
        Q(title__icontains=query) | Q(code__icontains=query)
    )[:4]:
        results.append(
            {
                "type": "figure",
                "title": item.title,
                "subtitle": item.description,
                "reference": item.source_reference,
                "target": {
                    "component": item.component.code if item.component else "",
                    "explorer": "dimensions",
                },
            }
        )
    return results[:24]
