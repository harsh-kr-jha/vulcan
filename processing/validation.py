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
    issues.extend(_reconcile_supplier_delivery(record))
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


def _reconcile_supplier_delivery(record: Mapping[str, object]) -> list[ValidationIssue]:
    if "ordered_quantity" not in record:
        return []
    try:
        ordered = Decimal(str(record["ordered_quantity"]))
        received = Decimal(str(record["received_quantity"]))
        accepted = Decimal(str(record["accepted_quantity"]))
    except (KeyError, InvalidOperation):
        return []

    issues = []
    if accepted > received:
        issues.append(
            ValidationIssue(
                field="accepted_quantity",
                severity=Severity.REJECTION,
                rule_code="accepted_not_above_received",
                explanation="Accepted quantity cannot exceed received quantity.",
                entered_value=accepted,
            )
        )
    if received > ordered:
        issues.append(
            ValidationIssue(
                field="received_quantity",
                severity=Severity.WARNING,
                rule_code="received_above_ordered",
                explanation="Received quantity exceeds the purchase-order quantity.",
                entered_value=received,
                suggested_correction="Confirm whether the over-delivery was approved.",
            )
        )
    terms = str(record.get("terms_met", "")).strip().casefold()
    if terms not in {"1", "0", "true", "false", "yes", "no", "y", "n", "met", "fulfilled"}:
        issues.append(
            ValidationIssue(
                field="terms_met",
                severity=Severity.REJECTION,
                rule_code="valid_terms_status",
                explanation="Delivery terms must be recorded as yes or no.",
                entered_value=record.get("terms_met"),
                suggested_correction=(
                    "Use yes when all agreed terms were fulfilled; otherwise use no."
                ),
            )
        )
    return issues
