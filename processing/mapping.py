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
    fields = tuple(fields)
    approved = {normalize_header(key): value for key, value in (approved_mapping or {}).items()}
    suggestions = []
    assigned: set[str] = set()

    for source in source_headers:
        normalized_source = normalize_header(source)
        approved_target = approved.get(normalized_source)
        if approved_target and approved_target not in assigned:
            suggestions.append(
                MappingSuggestion(source, approved_target, Confidence.HIGH, 1.0, "approved profile")
            )
            assigned.add(approved_target)
            continue

        candidates = []
        for field in fields:
            aliases = (field.key, field.display_name, *field.aliases)
            score = max(
                SequenceMatcher(None, normalized_source, normalize_header(alias)).ratio()
                for alias in aliases
            )
            if normalized_source in {normalize_header(alias) for alias in aliases}:
                score = 1.0
            candidates.append((score, field))
        candidates.sort(key=lambda item: item[0], reverse=True)
        score, best = candidates[0] if candidates else (0.0, None)

        if best is None or score < 0.48 or best.key in assigned:
            suggestions.append(
                MappingSuggestion(source, None, Confidence.UNMAPPED, score, "no unique match")
            )
            continue
        confidence = (
            Confidence.HIGH
            if score >= 0.9
            else Confidence.MEDIUM
            if score >= 0.7
            else Confidence.LOW
        )
        reason = "exact or alias match" if score == 1 else "header token similarity"
        suggestions.append(MappingSuggestion(source, best.key, confidence, round(score, 3), reason))
        assigned.add(best.key)

    return suggestions
