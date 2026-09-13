# ruff: noqa: E501
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.digital_library.models import (
    ComponentType,
    DimensionRecord,
    LibraryNote,
    LibrarySection,
    Material,
    PressureRating,
    TechnicalFigure,
    TechnicalStandard,
)

STANDARD_CODE = "ASME-B16-5"
PRESSURE_CLASSES = [150, 300, 400, 600, 900, 1500, 2500]

SECTIONS = [
    ("1", "scope", "Scope", "section", "Defines coverage, conventions, and user responsibility."),
    (
        "2",
        "pressure-temperature-ratings",
        "Pressure–Temperature Ratings",
        "section",
        "Defines rating methods, joint limitations, hydrostatic testing, and flange-specific bases.",
    ),
    (
        "3",
        "component-size",
        "Component Size",
        "section",
        "Defines nominal pipe size and designation of reducing fittings and flanges.",
    ),
    ("4", "marking", "Marking", "section", "Identification and conformance markings."),
    (
        "5",
        "materials",
        "Materials",
        "section",
        "Permitted flange, fitting, bolting, and gasket material requirements.",
    ),
    (
        "6",
        "dimensions",
        "Dimensions",
        "section",
        "Dimensional requirements for flanges, fittings, facings, drilling, hubs, and ends.",
    ),
    ("7", "tolerances", "Tolerances", "section", "Manufacturing dimensional tolerances."),
    ("8", "pressure-testing", "Pressure Testing", "section", "Shell pressure-test rules."),
    (
        "I",
        "appendix-i-threading",
        "Threading of Pipe for American National Standard Threaded Flanges",
        "mandatory-appendix",
        "Mandatory threading requirements.",
    ),
    (
        "II",
        "appendix-ii-us-customary",
        "U.S. Customary Ratings and Dimensional Data",
        "mandatory-appendix",
        "U.S. customary pressure ratings and dimensions for covered classes.",
    ),
    ("III", "appendix-iii-references", "References", "mandatory-appendix", "Normative references."),
    (
        "A",
        "appendix-a-rating-method",
        "Method Used for Establishing Pressure–Temperature Ratings",
        "nonmandatory-appendix",
        "Background calculation method for tabulated ratings.",
    ),
    (
        "B",
        "appendix-b-gaskets",
        "Limiting Dimensions of Gaskets Other Than Ring Joint Gaskets",
        "nonmandatory-appendix",
        "Guidance for gasket limiting dimensions.",
    ),
    (
        "C",
        "appendix-c-bolt-lengths",
        "Method for Calculating Bolt Lengths",
        "nonmandatory-appendix",
        "Machine-bolt and stud-bolt length calculation guidance.",
    ),
    (
        "D",
        "appendix-d-quality",
        "Quality System Program",
        "nonmandatory-appendix",
        "Quality system program guidance.",
    ),
    (
        "E",
        "appendix-e-flanged-fittings",
        "High-Class Flanged Fittings in U.S. Customary Units",
        "nonmandatory-appendix",
        "Classes 400 through 2500 flanged-fitting dimensions.",
    ),
]

COMPONENTS = [
    ("welding-neck", "Welding Neck", "Tapered hub flange intended for butt welding."),
    ("slip-on", "Slip-On", "Flange that slips over pipe and is attached by fillet welds."),
    ("blind", "Blind", "Solid closure flange, supplied with or without a hub."),
    ("threaded", "Threaded", "Internally threaded flange for compatible taper pipe thread."),
    ("socket-welding", "Socket Welding", "Flange with an internal socket for the pipe end."),
    ("lapped", "Lapped", "Loose backing flange used with a lap-joint stub end."),
    ("reducing", "Reducing", "Flange connecting a smaller nominal opening."),
    ("straight-hub", "Straight Hub Welding", "Welding flange with a uniform-thickness hub."),
]

MATERIALS = [
    ("18Cr–8Ni", "ASTM A182", "F304L", "forging", ["Do not use over 425°C."]),
    ("16Cr–12Ni–2Mo", "ASTM A182", "F316L", "forging", []),
    ("18Cr–13Ni–3Mo", "ASTM A182", "F317L", "forging", []),
    ("18Cr–8Ni", "ASTM A240", "304L", "plate", ["Do not use over 425°C."]),
    ("16Cr–12Ni–2Mo", "ASTM A240", "316L", "plate", []),
]

# Temperature band followed by pressure in bar for Classes 150 through 2500.
GROUP_23_RATINGS = [
    (-29, 38, [15.9, 41.4, 55.2, 82.7, 124.1, 206.8, 344.7]),
    (50, 50, [15.3, 40.0, 53.4, 80.0, 120.1, 200.1, 333.5]),
    (100, 100, [13.3, 34.8, 46.4, 69.6, 104.4, 173.9, 289.9]),
    (150, 150, [12.0, 31.4, 41.9, 62.8, 94.2, 157.0, 261.6]),
    (200, 200, [11.2, 29.2, 38.9, 58.3, 87.5, 145.8, 243.0]),
    (250, 250, [10.5, 27.5, 36.6, 54.9, 82.4, 137.3, 228.9]),
    (300, 300, [10.0, 26.1, 34.8, 52.1, 78.2, 130.3, 217.2]),
    (325, 325, [9.3, 25.5, 34.0, 51.0, 76.4, 127.4, 212.3]),
    (350, 350, [8.4, 25.1, 33.4, 50.1, 75.2, 125.4, 208.9]),
    (375, 375, [7.4, 24.8, 33.0, 49.5, 74.3, 123.8, 206.3]),
    (400, 400, [6.5, 24.3, 32.4, 48.6, 72.9, 121.5, 202.5]),
    (425, 425, [5.5, 23.9, 31.8, 47.7, 71.6, 119.3, 198.8]),
    (450, 450, [4.6, 23.4, 31.2, 46.8, 70.2, 117.1, 195.1]),
]

# NPS, O, tf, lap tf, X, Ah, Y threaded/slip/socket, Y lapped, Y welding neck,
# thread length, B slip/socket, B lapped, B welding neck, bolt circle, holes,
# bolt-hole diameter, bolt diameter. All dimensional values are millimetres.
CLASS_150_DIMENSIONS = [
    (0.5, "½", 90, 9.6, 11.2, 30, 21.3, 14, 16, 46, 16, 22.2, 22.9, 15.8, 60.3, 4, 15.875, 12.7),
    (0.75, "¾", 100, 11.2, 12.7, 38, 26.7, 14, 16, 51, 16, 27.7, 28.2, 20.9, 69.9, 4, 15.875, 12.7),
    (1, "1", 110, 12.7, 14.3, 49, 33.4, 16, 17, 54, 17, 34.5, 34.9, 26.6, 79.4, 4, 15.875, 12.7),
    (1.25, "1¼", 115, 14.3, 15.9, 59, 42.2, 19, 21, 56, 21, 43.2, 43.7, 35.1, 88.9, 4, 15.875, 12.7),
    (1.5, "1½", 125, 15.9, 17.5, 65, 48.3, 21, 22, 60, 22, 49.5, 50.0, 40.9, 98.4, 4, 15.875, 12.7),
    (2, "2", 150, 17.5, 19.1, 78, 60.3, 24, 25, 62, 25, 61.9, 62.5, 52.5, 120.7, 4, 19.05, 15.875),
    (2.5, "2½", 180, 20.7, 22.3, 90, 73.0, 27, 29, 68, 29, 74.6, 75.4, 62.7, 139.7, 4, 19.05, 15.875),
    (3, "3", 190, 22.3, 23.9, 108, 88.9, 29, 30, 68, 30, 90.7, 91.4, 77.9, 152.4, 4, 19.05, 15.875),
    (3.5, "3½", 215, 22.3, 23.9, 122, 101.6, 30, 32, 70, 32, 103.4, 104.1, None, 177.8, 8, 19.05, 15.875),
    (4, "4", 230, 22.3, 23.9, 135, 114.3, 32, 33, 75, 33, 116.1, 116.8, 102.3, 190.5, 8, 19.05, 15.875),
    (5, "5", 255, 22.3, 23.9, 164, 141.3, 35, 36, 87, 36, 143.8, 144.4, 128.2, 215.9, 8, 22.225, 19.05),
    (6, "6", 280, 23.9, 25.4, 192, 168.3, 38, 40, 87, 40, 170.7, 171.4, 154.1, 241.3, 8, 22.225, 19.05),
    (8, "8", 345, 27.0, 28.6, 246, 219.1, 43, 44, 100, 44, 221.5, 222.2, 202.7, 298.5, 8, 22.225, 19.05),
    (10, "10", 405, 28.6, 30.2, 305, 273.0, 48, 49, 100, 49, 276.2, 277.4, 254.6, 362.0, 12, 25.4, 22.225),
    (12, "12", 485, 30.2, 31.8, 365, 323.8, 54, 56, 113, 56, 327.0, 328.2, 304.8, 431.8, 12, 25.4, 22.225),
]


class Command(BaseCommand):
    help = "Create or update the built-in Regina technical library."

    @transaction.atomic
    def handle(self, *args, **options):
        standard, _ = TechnicalStandard.objects.update_or_create(
            code=STANDARD_CODE,
            defaults={
                "title": "Pipe Flanges and Flanged Fittings",
                "edition": "2017",
                "publisher": "ASME",
                "scope": "NPS ½ through NPS 24 metric/inch flange and flanged-fitting reference.",
                "status": "published",
                "metadata": {
                    "designation": "ASME B16.5-2017",
                    "unitSystems": ["metric", "us-customary"],
                    "pressureClasses": PRESSURE_CLASSES,
                    "runtimeSource": "structured-database",
                },
            },
        )
        self.seed_sections(standard)
        components = self.seed_components(standard)
        materials = self.seed_materials(standard)
        self.seed_ratings(standard)
        self.seed_dimensions(standard, components)
        self.seed_figures(standard, components)
        self.seed_notes(standard, components, materials)
        self.stdout.write(
            self.style.SUCCESS(
                "Regina library ready: "
                f"{standard.sections.count()} sections, {standard.materials.count()} materials, "
                f"{standard.pressure_ratings.count()} ratings, and "
                f"{standard.dimension_records.count()} dimension records."
            )
        )

    @staticmethod
    def seed_sections(standard):
        for sequence, (code, slug, title, category, summary) in enumerate(SECTIONS, start=1):
            LibrarySection.objects.update_or_create(
                standard=standard,
                slug=slug,
                defaults={
                    "code": code,
                    "title": title,
                    "summary": summary,
                    "category": category,
                    "sequence": sequence,
                    "source_reference": f"ASME B16.5-2017, {category.replace('-', ' ').title()} {code}",
                },
            )

    @staticmethod
    def seed_components(standard):
        result = {}
        for sequence, (code, name, description) in enumerate(COMPONENTS, start=1):
            component, _ = ComponentType.objects.update_or_create(
                standard=standard,
                code=code,
                defaults={
                    "name": name,
                    "description": description,
                    "applicable_classes": PRESSURE_CLASSES,
                    "facing_types": ["raised-face", "flat-face", "ring-joint"],
                    "source_reference": "ASME B16.5-2017, Sections 2 and 6",
                    "sequence": sequence,
                },
            )
            result[code] = component
        return result

    @staticmethod
    def seed_materials(standard):
        result = []
        for designation, specification, grade, product_form, restrictions in MATERIALS:
            material, _ = Material.objects.update_or_create(
                standard=standard,
                specification=specification,
                grade=grade,
                product_form=product_form,
                defaults={
                    "group": "2.3",
                    "designation": designation,
                    "rating_table": "2-2.3",
                    "restrictions": restrictions,
                    "source_reference": "ASME B16.5-2017, Table 1A and Table 2-2.3",
                },
            )
            result.append(material)
        return result

    @staticmethod
    def seed_ratings(standard):
        for temperature_min, temperature_max, pressures in GROUP_23_RATINGS:
            for pressure_class, pressure in zip(PRESSURE_CLASSES, pressures, strict=True):
                PressureRating.objects.update_or_create(
                    standard=standard,
                    material_group="2.3",
                    pressure_class=pressure_class,
                    temperature_min_c=Decimal(str(temperature_min)),
                    temperature_max_c=Decimal(str(temperature_max)),
                    defaults={
                        "pressure_bar": Decimal(str(pressure)),
                        "notes": [],
                        "source_reference": "ASME B16.5-2017, Table 2-2.3",
                    },
                )

    def seed_dimensions(self, standard, components):
        supported = {
            "welding-neck",
            "slip-on",
            "blind",
            "threaded",
            "socket-welding",
            "lapped",
        }
        for row in CLASS_150_DIMENSIONS:
            base = self.dimension_fields(row)
            for code in supported:
                dimensions = self.fields_for_component(code, base)
                DimensionRecord.objects.update_or_create(
                    standard=standard,
                    component=components[code],
                    pressure_class=150,
                    nps=Decimal(str(row[0])),
                    facing_type="raised-face",
                    defaults={
                        "nps_label": row[1],
                        "dimensions_mm": dimensions,
                        "tolerances": {"reference": "Section 7"},
                        "notes": [
                            "Dimension values are selected according to component geometry."
                        ],
                        "source_reference": "ASME B16.5-2017, Tables 7 and 8",
                    },
                )

    @staticmethod
    def dimension_fields(row):
        keys = [
            "nps",
            "npsLabel",
            "outsideDiameter",
            "flangeThickness",
            "lapJointThickness",
            "hubDiameter",
            "hubAtWeld",
            "lengthThroughHub",
            "lappedLengthThroughHub",
            "weldingNeckLengthThroughHub",
            "minimumThreadLength",
            "slipSocketBore",
            "lappedBore",
            "weldingNeckBore",
            "boltCircle",
            "numberOfBoltHoles",
            "boltHoleDiameter",
            "boltDiameter",
        ]
        return dict(zip(keys, row, strict=True))

    @staticmethod
    def fields_for_component(code, base):
        common = {
            "outsideDiameter": base["outsideDiameter"],
            "flangeThickness": base["flangeThickness"],
            "boltCircle": base["boltCircle"],
            "numberOfBoltHoles": base["numberOfBoltHoles"],
            "boltHoleDiameter": base["boltHoleDiameter"],
            "boltDiameter": base["boltDiameter"],
        }
        if code == "blind":
            return common
        if code == "welding-neck":
            common.update(
                hubDiameter=base["hubDiameter"],
                hubAtWeld=base["hubAtWeld"],
                lengthThroughHub=base["weldingNeckLengthThroughHub"],
                bore=base["weldingNeckBore"],
            )
        elif code == "lapped":
            common.update(
                flangeThickness=base["lapJointThickness"],
                hubDiameter=base["hubDiameter"],
                lengthThroughHub=base["lappedLengthThroughHub"],
                bore=base["lappedBore"],
            )
        else:
            common.update(
                hubDiameter=base["hubDiameter"],
                lengthThroughHub=base["lengthThroughHub"],
                bore=base["slipSocketBore"],
            )
            if code == "threaded":
                common["minimumThreadLength"] = base["minimumThreadLength"]
        return {key: value for key, value in common.items() if value is not None}

    @staticmethod
    def seed_figures(standard, components):
        figure_specs = [
            ("LIB-WN", "Welding neck flange schematic", "welding-neck", "hub-profile", ["O", "tf", "X", "Ah", "Y", "B", "W"]),
            ("LIB-SO", "Slip-on flange schematic", "slip-on", "slip-profile", ["O", "tf", "X", "Y", "B", "W"]),
            ("LIB-BL", "Blind flange schematic", "blind", "blind-profile", ["O", "tf", "W"]),
            ("LIB-TH", "Threaded flange schematic", "threaded", "threaded-profile", ["O", "tf", "X", "T", "W"]),
            ("LIB-SW", "Socket-welding flange schematic", "socket-welding", "socket-profile", ["O", "tf", "X", "Y", "B", "W"]),
            ("LIB-LJ", "Lapped flange schematic", "lapped", "lapped-profile", ["O", "tf", "X", "Y", "B", "W"]),
        ]
        for code, title, component_code, diagram_kind, labels in figure_specs:
            TechnicalFigure.objects.update_or_create(
                standard=standard,
                code=code,
                defaults={
                    "component": components[component_code],
                    "title": title,
                    "diagram_kind": diagram_kind,
                    "dimension_labels": labels,
                    "description": "Interactive schematic linked to the selected dimension record.",
                    "source_reference": "ASME B16.5-2017, dimensional table relationships",
                },
            )

    @staticmethod
    def seed_notes(standard, components, materials):
        note, _ = LibraryNote.objects.update_or_create(
            standard=standard,
            code="USER-MATERIAL-SELECTION",
            defaults={
                "title": "Material selection responsibility",
                "body": (
                    "The application code, service conditions, low-temperature toughness, "
                    "corrosion, and material deterioration remain engineering inputs outside "
                    "a tabulated flange rating lookup."
                ),
                "category": "restriction",
                "source_reference": "ASME B16.5-2017, Sections 1.4 and 5.1",
            },
        )
        note.materials.set(materials)
        note, _ = LibraryNote.objects.update_or_create(
            standard=standard,
            code="JOINT-RATING-LIMIT",
            defaults={
                "title": "Flanged joint rating limit",
                "body": (
                    "A retrieved flange value is not, by itself, the rating of the assembled "
                    "joint. Bolting, gasket, alignment, attachment, and applicable-code limits "
                    "must also be satisfied."
                ),
                "category": "safety",
                "source_reference": "ASME B16.5-2017, Section 2.3",
            },
        )
        note.components.set(components.values())
