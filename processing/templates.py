"""
Dataset field templates for the Tamaso platform.

Platform Core contains the structural framework: TemplateField, field helpers,
and the TEMPLATES dictionary with dataset type keys. Each operating template
branch (e.g. MFG.DA.AUTO.ALL, MFG.PMC.AGRI.ALL) populates TEMPLATES with its
own industry-specific field definitions, labels, and aliases.

Operating template branches should directly edit the TEMPLATES dict below with
their industry-specific fields. Platform Core intentionally ships empty field
lists — it is not deployable on its own.
"""

from processing.mapping import TemplateField
from processing.validation import FieldRule


def field(key, label, data_type="string", required=False, aliases=()):
    """Create a TemplateField with sensible defaults."""
    return TemplateField(key, label, data_type, required, tuple(aliases))


# ---------------------------------------------------------------------------
# Dataset templates.
#
# Each operating template branch fills these lists with industry-specific field
# definitions. Platform Core ships empty lists as the structural skeleton.
# ---------------------------------------------------------------------------

TEMPLATES: dict[str, list[TemplateField]] = {
    "projects": [],
    "project_stages": [],
    "process": [],
    "production": [],
    "downtime": [],
    "quality": [],
    "inventory": [],
    "supplier": [],
    "orders": [],
    "utilities": [],
}


def get_templates() -> dict[str, list[TemplateField]]:
    """Return the active template definitions for this branch."""
    return TEMPLATES


def field_rules(dataset_type):
    """Return validation rules for the given dataset type."""
    return [
        FieldRule(
            item.key, item.required, item.data_type, 0 if item.data_type == "decimal" else None
        )
        for item in TEMPLATES[dataset_type]
    ]


def serialize_fields(dataset_type):
    """Serialize template fields for API responses."""
    return [
        {
            "key": item.key,
            "label": item.display_name,
            "type": "number" if item.data_type == "decimal" else item.data_type,
            "required": item.required,
            "aliases": list(item.aliases),
        }
        for item in TEMPLATES[dataset_type]
    ]
