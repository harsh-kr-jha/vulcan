import json
from functools import lru_cache
from pathlib import Path
from types import MappingProxyType
from typing import Any

from django.core.exceptions import ImproperlyConfigured

VARIANTS_ROOT = Path(__file__).resolve().parents[2] / "variants"
MANIFESTS = {
    "automotive": VARIANTS_ROOT / "automotive.json",
    "mushroom": VARIANTS_ROOT / "mushroom.json",
}
REQUIRED_DATASETS = {
    "process",
    "production",
    "downtime",
    "quality",
    "inventory",
    "supplier",
    "orders",
    "projects",
    "project_stages",
    "utilities",
}
KNOWN_MODULES = {
    "dashboard",
    "projects",
    "digital-twin",
    "uploads",
    "performance",
    "alerts",
    "settings",
    "rules",
    "methodology",
}
REQUIRED_FEATURES = {"asyncUploads", "mushroomAnalytics"}


def _require_string(manifest: dict[str, Any], key: str) -> str:
    value = manifest.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ImproperlyConfigured(f"Variant manifest field {key!r} must be a non-empty string.")
    return value


@lru_cache(maxsize=len(MANIFESTS))
def load_variant_manifest(variant: str) -> MappingProxyType:
    """Load one allowlisted deployment variant without accepting user-controlled paths."""

    manifest_path = MANIFESTS.get(variant)
    if manifest_path is None:
        supported = ", ".join(sorted(MANIFESTS))
        raise ImproperlyConfigured(
            f"VULCAN_VARIANT must be one of: {supported}; received {variant!r}."
        )
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ImproperlyConfigured(
            f"The {variant!r} variant manifest could not be loaded."
        ) from exc
    if not isinstance(manifest, dict):
        raise ImproperlyConfigured("Variant manifest root must be an object.")

    for key in ("id", "displayName", "descriptor", "industry"):
        _require_string(manifest, key)
    if manifest["id"] != variant:
        raise ImproperlyConfigured("Variant manifest id must match VULCAN_VARIANT.")

    modules = manifest.get("modules")
    if not isinstance(modules, list) or not modules or any(
        not isinstance(item, str) for item in modules
    ):
        raise ImproperlyConfigured("Variant modules must be a non-empty string list.")
    unknown_modules = set(modules) - KNOWN_MODULES
    if unknown_modules:
        raise ImproperlyConfigured(
            f"Variant contains unknown modules: {', '.join(sorted(unknown_modules))}."
        )

    datasets = manifest.get("datasets")
    if not isinstance(datasets, dict) or set(datasets) != REQUIRED_DATASETS or any(
        not isinstance(label, str) or not label.strip() for label in datasets.values()
    ):
        raise ImproperlyConfigured(
            "Variant datasets must contain every supported dataset with a non-empty label."
        )

    navigation = manifest.get("navigation")
    terminology = manifest.get("terminology")
    if not isinstance(navigation, dict) or any(
        not isinstance(value, str) or not value.strip() for value in navigation.values()
    ):
        raise ImproperlyConfigured("Variant navigation labels must be non-empty strings.")
    if not isinstance(terminology, dict) or any(
        not isinstance(value, str) or not value.strip() for value in terminology.values()
    ):
        raise ImproperlyConfigured("Variant terminology must contain non-empty strings.")

    features = manifest.get("features")
    if not isinstance(features, dict) or set(features) != REQUIRED_FEATURES or any(
        not isinstance(value, bool) for value in features.values()
    ):
        raise ImproperlyConfigured(
            "Variant features must contain the complete supported boolean feature set."
        )
    if features["mushroomAnalytics"] != (variant == "mushroom"):
        raise ImproperlyConfigured("mushroomAnalytics may only be enabled for mushroom.")

    return MappingProxyType(manifest)
