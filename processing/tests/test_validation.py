from decimal import Decimal

from processing.validation import FieldRule, Severity, validate_record


def test_record_validation_combines_schema_and_reconciliation_issues():
    issues = validate_record(
        {"actual_quantity": "100", "good_quantity": "95", "rejected_quantity": "2"},
        [
            FieldRule("actual_quantity", required=True, data_type="decimal", minimum=Decimal("0")),
            FieldRule("good_quantity", required=True, data_type="decimal", minimum=Decimal("0")),
            FieldRule("shift", required=True),
        ],
    )

    assert {issue.rule_code for issue in issues} == {
        "required_value",
        "production_quantity_reconciliation",
    }
    assert {issue.severity for issue in issues} == {Severity.WARNING, Severity.REJECTION}
