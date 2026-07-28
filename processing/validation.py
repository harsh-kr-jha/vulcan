from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import StrEnum


class Severity(StrEnum):
    WARNING = "warning"
    REJECTION = "rejection"


@dataclass(frozen=True)
class ValidationIssue:
    field: str
    severity: Severity
    rule_code: str
    explanation: str
    entered_value: object = None
    suggested_correction: str = ""


@dataclass(frozen=True)
class FieldRule:
    key: str
    required: bool = False
    data_type: str = "string"
    minimum: Decimal | None = None


def validate_record(
    record: Mapping[str, object],
    rules: list[FieldRule],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for rule in rules:
        value = record.get(rule.key)
        if value is None or (isinstance(value, str) and not value.strip()):
            if rule.required:
                issues.append(
                    ValidationIssue(
                        field=rule.key,
                        severity=Severity.REJECTION,
                        rule_code="required_value",
                        explanation=f"{rule.key} is required.",
                        entered_value=value,
                    )
                )
            continue

        if rule.data_type == "decimal":
            try:
                numeric = Decimal(str(value).replace(",", ""))
            except InvalidOperation:
                issues.append(
                    ValidationIssue(
                        field=rule.key,
                        severity=Severity.REJECTION,
                        rule_code="valid_number",
                        explanation=f"{rule.key} must contain a valid number.",
                        entered_value=value,
                        suggested_correction="Remove non-numeric characters.",
                    )
                )
                continue
            if rule.minimum is not None and numeric < rule.minimum:
                issues.append(
                    ValidationIssue(
                        field=rule.key,
                        severity=Severity.REJECTION,
                        rule_code="minimum_value",
                        explanation=f"{rule.key} must be at least {rule.minimum}.",
                        entered_value=value,
                    )
                )
    issues.extend(_reconcile_quantities(record))
    return issues


def _reconcile_quantities(record: Mapping[str, object]) -> list[ValidationIssue]:
    try:
        actual = Decimal(str(record["actual_quantity"]))
        good = Decimal(str(record["good_quantity"]))
        rejected = Decimal(str(record.get("rejected_quantity", 0)))
        reworked = Decimal(str(record.get("reworked_quantity", 0)))
    except (KeyError, InvalidOperation):
        return []

    issues = []
    if good > actual:
        issues.append(
            ValidationIssue(
                field="good_quantity",
                severity=Severity.REJECTION,
                rule_code="good_not_above_actual",
                explanation="Good quantity cannot exceed actual quantity.",
                entered_value=good,
            )
        )
    if good + rejected + reworked != actual:
        issues.append(
            ValidationIssue(
                field="actual_quantity",
                severity=Severity.WARNING,
                rule_code="production_quantity_reconciliation",
                explanation=(
                    "Good, rejected and reworked quantities do not reconcile to actual quantity."
                ),
                entered_value=actual,
                suggested_correction=(
                    "Review quantity classification or approve with an explanation."
                ),
            )
        )
    return issues
