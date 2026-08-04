import hashlib
import re
from collections.abc import Iterable
from dataclasses import dataclass
from difflib import SequenceMatcher
from enum import StrEnum


class Confidence(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNMAPPED = "unmapped"


@dataclass(frozen=True)
class TemplateField:
    key: str
    display_name: str
    data_type: str
    required: bool = False
    aliases: tuple[str, ...] = ()


@dataclass(frozen=True)
class MappingSuggestion:
    source_header: str
    target_key: str | None
    confidence: Confidence
    score: float
    reason: str


def normalize_header(value: str) -> str:
    """Create a stable comparison value without losing token boundaries."""
    value = value.strip().casefold()
    value = re.sub(r"([a-z])([A-Z])", r"\1 \2", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def header_signature(sheets: dict[str, Iterable[str]]) -> str:
    """Hash normalized sheet/header structure for mapping profile reuse."""
    canonical = []
    for sheet_name in sorted(sheets, key=normalize_header):
        headers = "|".join(normalize_header(header) for header in sheets[sheet_name])
        canonical.append(f"{normalize_header(sheet_name)}:{headers}")
    return hashlib.sha256("\n".join(canonical).encode()).hexdigest()


def suggest_mappings(
    source_headers: Iterable[str],
    fields: Iterable[TemplateField],
    approved_mapping: dict[str, str] | None = None,
) -> list[MappingSuggestion]:
    source_headers = tuple(source_headers)
    fields = tuple(fields)
    approved = {normalize_header(key): value for key, value in (approved_mapping or {}).items()}
    suggestions: dict[str, MappingSuggestion] = {}
    assigned: set[str] = set()

    # Profiles and exact aliases are resolved before fuzzy matching. This keeps
    # early generic columns such as "Sr No" from consuming a later exact "PO No".
    for source in source_headers:
        normalized_source = normalize_header(source)
        approved_target = approved.get(normalized_source)
        if approved_target and approved_target not in assigned:
            suggestions[source] = MappingSuggestion(
                source, approved_target, Confidence.HIGH, 1.0, "approved profile"
            )
            assigned.add(approved_target)
    for source in source_headers:
        if source in suggestions:
            continue
        normalized_source = normalize_header(source)
        for field in fields:
            aliases = (field.key, field.display_name, *field.aliases)
            if normalized_source not in {normalize_header(alias) for alias in aliases}:
                continue
            if field.key in assigned:
                break
            suggestions[source] = MappingSuggestion(
                source, field.key, Confidence.HIGH, 1.0, "exact or alias match"
            )
            assigned.add(field.key)
            break

    candidates = []
    best_source_scores = {}
    for source in source_headers:
        if source in suggestions:
            continue
        normalized_source = normalize_header(source)
        for field in fields:
            aliases = (field.key, field.display_name, *field.aliases)
            score = max(
                SequenceMatcher(None, normalized_source, normalize_header(alias)).ratio()
                for alias in aliases
            )
            best_source_scores[source] = max(best_source_scores.get(source, 0), score)
            if score >= 0.6:
                candidates.append((score, source, field))
    candidates.sort(key=lambda item: item[0], reverse=True)
    for score, source, best in candidates:
        if source in suggestions or best.key in assigned:
            continue
        confidence = (
            Confidence.HIGH
            if score >= 0.9
            else Confidence.MEDIUM
            if score >= 0.7
            else Confidence.LOW
        )
        suggestions[source] = MappingSuggestion(
            source, best.key, confidence, round(score, 3), "header token similarity"
        )
        assigned.add(best.key)

    return [
        suggestions.get(
            source,
            MappingSuggestion(
                source,
                None,
                Confidence.UNMAPPED,
                round(best_source_scores.get(source, 0), 3),
                "no unique match",
            ),
        )
        for source in source_headers
    ]
