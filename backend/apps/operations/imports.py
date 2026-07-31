import hashlib
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction

from apps.operations.models import MappingProfile, StandardRecord, ValidationIssue
from apps.tenancy.models import FactoryMaster
from processing.mapping import header_signature, suggest_mappings
from processing.templates import TEMPLATES, field_rules, serialize_fields
from processing.validation import Severity, validate_record


def inspection_payload(upload):
    fields = TEMPLATES[upload.dataset_type]
    signature = header_signature({"data": upload.headers})
    saved = MappingProfile.objects.filter(
        factory=upload.factory,
        template_code=upload.dataset_type,
        header_signature=signature,
        is_active=True,
    ).first()
    suggestions = suggest_mappings(upload.headers, fields, saved.mappings if saved else None)
    return {
        "upload": serialize_upload(upload),
        "headers": upload.headers,
        "samples": upload.raw_rows[:3],
        "fields": serialize_fields(upload.dataset_type),
        "mapping": {item.source_header: item.target_key or "" for item in suggestions},
        "suggestions": [
            {
                "source": item.source_header,
                "target": item.target_key or "",
                "confidence": item.confidence,
                "reason": item.reason,
            }
            for item in suggestions
        ],
    }


def validate_mapping(upload, mapping):
    fields = {item.key: item for item in TEMPLATES[upload.dataset_type]}
    selected = [target for target in mapping.values() if target]
    issues = []
    directions = []

    for key, definition in fields.items():
        if definition.required and key not in selected:
            issues.append(
                issue(
                    0,
                    key,
                    Severity.REJECTION,
                    "required_mapping",
                    f"{definition.display_name} is required but has no source column.",
                    f"Map the source column containing {definition.display_name.lower()}, "
                    "or stop this import.",
                )
            )
    duplicates = sorted({target for target in selected if selected.count(target) > 1})
    for target in duplicates:
        issues.append(
            issue(
                0,
                target,
                Severity.REJECTION,
                "duplicate_mapping",
                f"More than one source column maps to {fields[target].display_name}.",
                "Keep the best source column and set the other column to Do not import.",
            )
        )

    mapped_rows = [map_row(row, mapping) for row in upload.raw_rows]
    if not any(item["severity"] == Severity.REJECTION and item["row"] == 0 for item in issues):
        references = master_references(upload)
        for index, row in enumerate(mapped_rows, start=2):
            for record_issue in validate_record(row, field_rules(upload.dataset_type)):
                issues.append(
                    issue(
                        index,
                        record_issue.field,
                        record_issue.severity,
                        record_issue.rule_code,
                        record_issue.explanation,
                        record_issue.suggested_correction or correction_for(record_issue.rule_code),
                        record_issue.entered_value,
                    )
                )
            issues.extend(validate_dates(row, fields, index))
            issues.extend(validate_references(row, references, index))

    rejected_rows = {
        item["row"] for item in issues if item["severity"] == Severity.REJECTION and item["row"]
    }
    warning_rows = {
        item["row"] for item in issues if item["severity"] == Severity.WARNING and item["row"]
    }
    global_rejection = any(
        item["severity"] == Severity.REJECTION and item["row"] == 0 for item in issues
    )
    accepted = 0 if global_rejection else max(len(mapped_rows) - len(rejected_rows), 0)
    quality = (
        max(0, (len(mapped_rows) - len(rejected_rows) - len(warning_rows) * 0.25))
        / max(len(mapped_rows), 1)
        * 100
    )
    if rejected_rows:
        directions.append(
            f"{len(rejected_rows)} row(s) will be left out. Correct the source values "
            "and upload again if they must be included."
        )
    if warning_rows:
        directions.append(
            f"{len(warning_rows)} row(s) have warnings. They can be imported; "
            "review the suggested corrections first."
        )
    if not issues:
        directions.append("All mapped rows are valid and ready to import.")

    with transaction.atomic():
        upload.validation_issues.all().delete()
        ValidationIssue.objects.bulk_create(
            [
                ValidationIssue(
                    tenant=upload.tenant,
                    upload=upload,
                    source_row=item["row"] or None,
                    standard_field=item["field"],
                    entered_value=str(item.get("enteredValue", "") or ""),
                    severity=item["severity"],
                    rule_code=item["ruleCode"],
                    explanation=item["explanation"],
                    suggested_correction=item["suggestedCorrection"],
                    validation_version="1.0",
                )
                for item in issues
            ]
        )
        upload.mapping = mapping
        upload.omitted_fields = [header for header in upload.headers if not mapping.get(header)]
        upload.accepted_rows = accepted
        upload.rejected_rows = len(rejected_rows) if not global_rejection else len(mapped_rows)
        upload.warning_rows = len(warning_rows)
        upload.data_quality_score = Decimal(str(round(quality, 2)))
        upload.status = "VALIDATION_REVIEW"
        upload.save(
            update_fields=[
                "mapping",
                "omitted_fields",
                "accepted_rows",
                "rejected_rows",
                "warning_rows",
                "data_quality_score",
                "status",
                "updated_at",
            ]
        )
    return {
        "upload": serialize_upload(upload),
        "issues": issues,
        "directions": directions,
        "canImport": not global_rejection and accepted > 0,
    }


@transaction.atomic
def import_valid_rows(upload, user):
    if upload.status != "VALIDATION_REVIEW":
        raise ValueError("Run validation before importing this dataset.")
    rejected = set(
        upload.validation_issues.filter(
            severity=Severity.REJECTION, source_row__isnull=False
        ).values_list("source_row", flat=True)
    )
    if upload.validation_issues.filter(
        severity=Severity.REJECTION, source_row__isnull=True
    ).exists():
        raise ValueError("Resolve mapping errors before importing.")

    records = []
    for source_row, raw in enumerate(upload.raw_rows, start=2):
        if source_row in rejected:
            continue
        values = normalize_values(map_row(raw, upload.mapping), upload.dataset_type)
        records.append(
            StandardRecord(
                tenant=upload.tenant,
                upload=upload,
                factory=upload.factory,
                dataset_type=upload.dataset_type,
                source_row=source_row,
                operational_date=record_date(values),
                line=str(values.get("line", "") or ""),
                machine=str(values.get("machine", "") or ""),
                sku=str(values.get("sku", "") or ""),
                shift=str(values.get("shift", "") or ""),
                values=values,
            )
        )
    upload.standard_records.all().delete()
    StandardRecord.objects.bulk_create(records, batch_size=500)
    signature = header_signature({"data": upload.headers})
    MappingProfile.objects.update_or_create(
        factory=upload.factory,
        template_code=upload.dataset_type,
        template_version="1",
        header_signature=signature,
        defaults={
            "tenant": upload.tenant,
            "mappings": upload.mapping,
            "approved_by": user,
            "is_active": True,
        },
    )
    upload.status = "COMPLETED"
    upload.accepted_rows = len(records)
    upload.save(update_fields=["status", "accepted_rows", "updated_at"])
    return serialize_upload(upload)


def serialize_upload(upload):
    return {
        "id": str(upload.id),
        "factoryId": str(upload.factory_id),
        "filename": upload.original_filename,
        "datasetType": upload.dataset_type or upload.template_code,
        "source": upload.source_type,
        "importedAt": upload.created_at.isoformat(),
        "status": upload.status,
        "acceptedRows": upload.accepted_rows,
        "warningRows": upload.warning_rows,
        "rejectedRows": upload.rejected_rows,
        "dataQualityScore": float(upload.data_quality_score),
        "omittedFields": upload.omitted_fields,
    }


def map_row(raw, mapping):
    return {target: raw.get(source) for source, target in mapping.items() if target}


def normalize_values(values, dataset_type):
    definitions = {item.key: item for item in TEMPLATES[dataset_type]}
    normalized = {}
    for key, value in values.items():
        if value is None:
            normalized[key] = ""
        elif definitions[key].data_type == "decimal":
            try:
                normalized[key] = float(Decimal(str(value).replace(",", "")))
            except InvalidOperation:
                normalized[key] = 0
        elif definitions[key].data_type == "date":
            normalized[key] = normalize_date(value)
        else:
            normalized[key] = str(value).strip()
    return normalized


def normalize_date(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        if raw.replace(".", "", 1).isdigit() and float(raw) > 20_000:
            return (date(1899, 12, 30) + timedelta(days=int(float(raw)))).isoformat()
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        for pattern in ("%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(raw, pattern).date().isoformat()
            except ValueError:
                continue
    return raw


def record_date(values):
    raw = (
        values.get("date")
        or values.get("actual_delivery_date")
        or values.get("promised_date")
        or values.get("due_date")
    )
    try:
        return date.fromisoformat(str(raw)) if raw else None
    except ValueError:
        return None


def validate_dates(row, fields, row_number):
    issues = []
    for key, definition in fields.items():
        value = row.get(key)
        if definition.data_type != "date" or not value:
            continue
        normalized = normalize_date(value)
        try:
            date.fromisoformat(normalized)
        except ValueError:
            issues.append(
                issue(
                    row_number,
                    key,
                    Severity.REJECTION,
                    "valid_date",
                    f"{definition.display_name} is not a recognized date.",
                    "Use YYYY-MM-DD, for example 2026-07-31.",
                    value,
                )
            )
    return issues


def master_references(upload):
    result = {}
    for item in FactoryMaster.objects.filter(factory=upload.factory, is_active=True):
        result.setdefault(item.kind, set()).update({item.name.casefold(), item.code.casefold()})
    return result


def validate_references(row, references, row_number):
    links = {
        "line": "lines",
        "machine": "machines",
        "sku": "skus",
        "shift": "shifts",
        "material": "materials",
        "supplier": "suppliers",
        "reason": "reasonCodes",
    }
    issues = []
    for field_name, kind in links.items():
        value = str(row.get(field_name, "") or "").strip()
        known = references.get(kind)
        if value and known and value.casefold() not in known:
            issues.append(
                issue(
                    row_number,
                    field_name,
                    Severity.WARNING,
                    "unknown_master_value",
                    f"“{value}” is not in this factory’s {kind} master data.",
                    f"Add “{value}” in Factory setup, correct the source, or import it "
                    "as an unrecognized value.",
                    value,
                )
            )
    return issues


def correction_for(rule_code):
    return {
        "required_value": "Provide a value in the source file or omit the entire row.",
        "valid_number": "Use digits only; remove units, commas used as text, and other characters.",
        "minimum_value": "Use zero or a positive quantity.",
    }.get(rule_code, "Correct the source value and validate again.")


def issue(row, field, severity, code, explanation, correction, entered_value=""):
    return {
        "row": row,
        "field": field,
        "severity": str(severity),
        "ruleCode": code,
        "explanation": explanation,
        "suggestedCorrection": correction,
        "enteredValue": str(entered_value or ""),
    }


def checksum(content):
    return hashlib.sha256(content).hexdigest()
