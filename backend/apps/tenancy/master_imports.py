"""Validated, idempotent CSV imports for factory-owned master data."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

from django.db import transaction

from apps.tenancy.models import Factory, FactoryMaster, Tenant

MAX_MASTER_IMPORT_BYTES = 2 * 1024 * 1024
MAX_MASTER_IMPORT_ROWS = 2_000
REQUIRED_HEADERS = (
    "entity_type",
    "code",
    "name",
    "parent_code",
    "uom",
    "metadata_json",
    "notes",
)
CONTEXT_TYPES = {"company", "factory"}
IMPORT_KINDS = {
    "line": FactoryMaster.Kind.LINE,
    "process": FactoryMaster.Kind.PROCESS,
    "machine": FactoryMaster.Kind.MACHINE,
    "sku": FactoryMaster.Kind.SKU,
    "material": FactoryMaster.Kind.MATERIAL,
    "supplier": FactoryMaster.Kind.SUPPLIER,
    "shift": FactoryMaster.Kind.SHIFT,
    "reason_code": FactoryMaster.Kind.REASON_CODE,
}
KIND_ORDER = {
    FactoryMaster.Kind.LINE: 0,
    FactoryMaster.Kind.PROCESS: 1,
    FactoryMaster.Kind.MACHINE: 2,
    FactoryMaster.Kind.SKU: 3,
    FactoryMaster.Kind.MATERIAL: 4,
    FactoryMaster.Kind.SUPPLIER: 5,
    FactoryMaster.Kind.SHIFT: 6,
    FactoryMaster.Kind.REASON_CODE: 7,
}
CODE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


class MasterImportError(ValueError):
    pass


@dataclass
class ParsedMasterRow:
    source_row: int
    entity_type: str
    kind: str
    code: str
    name: str
    parent_code: str
    metadata: dict[str, Any]
    uom: str
    notes: str
    existing: FactoryMaster | None = None
    action: str = "create"

    def public(self):
        return {
            "sourceRow": self.source_row,
            "entityType": self.entity_type,
            "kind": self.kind,
            "code": self.code,
            "name": self.name,
            "parentCode": self.parent_code,
            "action": self.action,
        }


def read_master_csv(uploaded_file) -> tuple[bytes, list[dict[str, str]], list[str]]:
    if not uploaded_file:
        raise MasterImportError("Choose a factory master CSV file.")
    filename = str(getattr(uploaded_file, "name", "") or "")
    if not filename.casefold().endswith(".csv"):
        raise MasterImportError("Factory master setup accepts CSV files only.")
    if getattr(uploaded_file, "size", 0) > MAX_MASTER_IMPORT_BYTES:
        raise MasterImportError("Factory master CSV files must be 2 MB or smaller.")

    content = uploaded_file.read()
    if len(content) > MAX_MASTER_IMPORT_BYTES:
        raise MasterImportError("Factory master CSV files must be 2 MB or smaller.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise MasterImportError(
            "Save the factory master CSV as UTF-8 and upload it again."
        ) from exc

    reader = csv.DictReader(io.StringIO(text, newline=""))
    raw_headers = reader.fieldnames or []
    headers = [str(value or "").strip() for value in raw_headers]
    duplicate_headers = sorted(
        header for header, count in Counter(headers).items() if header and count > 1
    )
    if duplicate_headers:
        raise MasterImportError(f"Duplicate CSV header(s): {', '.join(duplicate_headers)}.")
    missing = [header for header in REQUIRED_HEADERS if header not in headers]
    if missing:
        raise MasterImportError(f"Missing required CSV header(s): {', '.join(missing)}.")

    rows = []
    for index, raw in enumerate(reader, start=2):
        if index > MAX_MASTER_IMPORT_ROWS + 1:
            raise MasterImportError(
                f"Factory master CSV files can contain at most {MAX_MASTER_IMPORT_ROWS} data rows."
            )
        normalized = {
            str(key or "").strip(): str(value or "").strip() for key, value in raw.items()
        }
        if any(normalized.values()):
            rows.append(normalized)
    if not rows:
        raise MasterImportError("The selected CSV has no factory master rows.")
    return content, rows, headers


def issue(row, field, severity, message):
    return {"row": row, "field": field, "severity": severity, "message": message}


def parse_metadata(raw: str, source_row: int, issues: list[dict[str, Any]]):
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        issues.append(
            issue(
                source_row,
                "metadata_json",
                "error",
                f"Metadata must be valid JSON ({exc.msg}).",
            )
        )
        return {}
    if not isinstance(value, dict):
        issues.append(
            issue(source_row, "metadata_json", "error", "Metadata JSON must be an object.")
        )
        return {}
    return value


def enriched_metadata(metadata, uom, notes):
    result = dict(metadata)
    if uom:
        result.setdefault("unit", uom)
    if notes:
        result.setdefault("description", notes)
    result["source"] = "factory-master-csv"
    return result


def inspect_master_import(factory: Factory, uploaded_file) -> dict[str, Any]:
    content, raw_rows, headers = read_master_csv(uploaded_file)
    issues: list[dict[str, Any]] = []
    parsed: list[ParsedMasterRow] = []
    context_rows = []

    for source_row, raw in enumerate(raw_rows, start=2):
        entity_type = raw.get("entity_type", "").casefold().replace(" ", "_")
        code = raw.get("code", "")
        name = raw.get("name", "")
        if entity_type in CONTEXT_TYPES:
            context_rows.append(
                {
                    "sourceRow": source_row,
                    "entityType": entity_type,
                    "code": code,
                    "name": name,
                }
            )
            if entity_type == "factory" and code and code.casefold() != factory.code.casefold():
                issues.append(
                    issue(
                        source_row,
                        "code",
                        "warning",
                        f"The CSV declares factory {code}; masters will be applied to "
                        f"the selected factory {factory.code}.",
                    )
                )
            continue
        kind = IMPORT_KINDS.get(entity_type)
        if not kind:
            issues.append(
                issue(
                    source_row,
                    "entity_type",
                    "error",
                    f"Unsupported entity type “{raw.get('entity_type', '')}”.",
                )
            )
            continue
        if not code:
            issues.append(issue(source_row, "code", "error", "Code is required."))
        elif len(code) > 60:
            issues.append(
                issue(source_row, "code", "error", "Code must be 60 characters or fewer.")
            )
        elif not CODE_PATTERN.fullmatch(code):
            issues.append(
                issue(
                    source_row,
                    "code",
                    "error",
                    "Code may contain letters, numbers, dots, underscores, slashes and hyphens.",
                )
            )
        if not name:
            issues.append(issue(source_row, "name", "error", "Name is required."))
        elif len(name) > 160:
            issues.append(
                issue(source_row, "name", "error", "Name must be 160 characters or fewer.")
            )
        metadata = parse_metadata(raw.get("metadata_json", ""), source_row, issues)
        parsed.append(
            ParsedMasterRow(
                source_row=source_row,
                entity_type=entity_type,
                kind=kind,
                code=code,
                name=name,
                parent_code=raw.get("parent_code", ""),
                metadata=enriched_metadata(metadata, raw.get("uom", ""), raw.get("notes", "")),
                uom=raw.get("uom", ""),
                notes=raw.get("notes", ""),
            )
        )

    duplicate_keys = defaultdict(list)
    for row in parsed:
        duplicate_keys[(row.kind, row.code.casefold())].append(row.source_row)
    for (_, code), source_rows in duplicate_keys.items():
        if code and len(source_rows) > 1:
            for source_row in source_rows:
                issues.append(
                    issue(
                        source_row,
                        "code",
                        "error",
                        "This kind/code occurs more than once in the CSV "
                        f"(rows {', '.join(map(str, source_rows))}).",
                    )
                )

    existing_by_key: dict[tuple[str, str], list[FactoryMaster]] = defaultdict(list)
    for item in FactoryMaster.objects.filter(factory=factory).select_related("parent"):
        existing_by_key[(item.kind, item.code.casefold())].append(item)
    for (kind, code), matches in existing_by_key.items():
        if len(matches) > 1:
            issues.append(
                issue(
                    0,
                    "code",
                    "error",
                    "The selected factory already contains case-insensitive duplicate "
                    f"{kind} code “{code}”. Resolve it before importing.",
                )
            )

    uploaded_lines = {
        row.code.casefold(): row
        for row in parsed
        if row.kind == FactoryMaster.Kind.LINE and row.code
    }
    existing_lines = {
        item.code.casefold(): item
        for item in FactoryMaster.objects.filter(
            factory=factory, kind=FactoryMaster.Kind.LINE, is_active=True
        )
    }
    available_line_codes = set(existing_lines) | set(uploaded_lines)

    for row in parsed:
        matches = existing_by_key.get((row.kind, row.code.casefold()), [])
        row.existing = matches[0] if len(matches) == 1 else None
        if row.kind in {FactoryMaster.Kind.PROCESS, FactoryMaster.Kind.MACHINE}:
            if not row.parent_code:
                issues.append(
                    issue(
                        row.source_row,
                        "parent_code",
                        "error",
                        "Processes and machines must reference a production-line code.",
                    )
                )
            elif row.parent_code.casefold() not in available_line_codes:
                issues.append(
                    issue(
                        row.source_row,
                        "parent_code",
                        "error",
                        f"Production line “{row.parent_code}” is neither active nor "
                        "included in this CSV.",
                    )
                )
        if row.kind == FactoryMaster.Kind.PROCESS:
            validate_process_metadata(row, issues)

    validate_process_sequences(factory, parsed, issues)
    validate_machine_processes(factory, parsed, issues)

    for row in parsed:
        parent_code = (
            row.parent_code.casefold()
            if row.kind in {FactoryMaster.Kind.PROCESS, FactoryMaster.Kind.MACHINE}
            else ""
        )
        existing_parent_code = (
            row.existing.parent.code.casefold() if row.existing and row.existing.parent_id else ""
        )
        same_parent = existing_parent_code == parent_code
        same_values = bool(
            row.existing
            and row.existing.name == row.name
            and row.existing.metadata == row.metadata
            and same_parent
        )
        if (
            row.kind == FactoryMaster.Kind.MACHINE
            and row.existing
            and (row.existing.metadata or {}).get("canonicalMachineId")
        ):
            from apps.spatial.models import SpatialMachine

            canonical = SpatialMachine.objects.filter(
                id=row.existing.metadata["canonicalMachineId"],
                layout__factory=factory,
            ).first()
            process_code = canonical.process.code if canonical and canonical.process_id else ""
            same_values = bool(
                canonical
                and canonical.is_active
                and canonical.name == row.name[:50]
                and canonical.code.casefold() == row.code.casefold()
                and process_code.casefold()
                == str(row.metadata.get("processCode", "")).casefold()
            )
            row.action = "unchanged" if same_values else "update"
            continue
        if not row.existing:
            row.action = "create"
        elif not row.existing.is_active:
            row.action = "reactivate"
        elif same_values:
            row.action = "unchanged"
        else:
            row.action = "update"

    errors = [item for item in issues if item["severity"] == "error"]
    action_counts = Counter(row.action for row in parsed)
    kind_counts = Counter(row.kind for row in parsed)
    return {
        "filename": str(getattr(uploaded_file, "name", "factory_master_reference.csv")),
        "checksum": hashlib.sha256(content).hexdigest(),
        "factory": {"id": str(factory.id), "name": factory.name, "code": factory.code},
        "headers": headers,
        "totalRows": len(raw_rows),
        "importableRows": len(parsed),
        "contextRows": context_rows,
        "counts": dict(sorted(kind_counts.items())),
        "actions": {
            key: action_counts.get(key, 0)
            for key in ("create", "update", "reactivate", "unchanged")
        },
        "rows": [row.public() for row in sorted(parsed, key=lambda item: item.source_row)],
        "issues": issues,
        "canApply": bool(parsed) and not errors,
        "_parsed": parsed,
    }


def validate_process_metadata(row, issues):
    metadata = row.metadata
    raw_sequence = metadata.get("sequence")
    try:
        sequence = int(raw_sequence)
    except (TypeError, ValueError):
        sequence = 0
    if isinstance(raw_sequence, bool) or sequence < 1 or str(raw_sequence).strip() != str(sequence):
        issues.append(
            issue(
                row.source_row,
                "metadata_json",
                "error",
                "Every process requires a positive whole-number sequence.",
            )
        )
    else:
        metadata["sequence"] = sequence
    for key, label in (("inputUnit", "input"), ("outputUnit", "output")):
        if not str(metadata.get(key, "")).strip():
            issues.append(
                issue(
                    row.source_row,
                    "metadata_json",
                    "error",
                    f"Every process requires an {label} unit.",
                )
            )
    for key in ("targetCycleMinutes", "targetPressureBar", "capacityPerHour"):
        value = metadata.get(key)
        if value in {None, ""}:
            continue
        try:
            if float(value) < 0:
                raise ValueError
        except (TypeError, ValueError):
            issues.append(
                issue(
                    row.source_row,
                    "metadata_json",
                    "error",
                    f"{key} must be zero or a positive number.",
                )
            )


def validate_process_sequences(factory, parsed, issues):
    uploaded_keys = {
        (row.kind, row.code.casefold()) for row in parsed if row.kind == FactoryMaster.Kind.PROCESS
    }
    final_processes = []
    for item in FactoryMaster.objects.filter(
        factory=factory, kind=FactoryMaster.Kind.PROCESS, is_active=True
    ).select_related("parent"):
        if (item.kind, item.code.casefold()) not in uploaded_keys:
            final_processes.append(
                (
                    item.parent.code.casefold() if item.parent else "",
                    item.metadata.get("sequence"),
                    0,
                )
            )
    final_processes.extend(
        (row.parent_code.casefold(), row.metadata.get("sequence"), row.source_row)
        for row in parsed
        if row.kind == FactoryMaster.Kind.PROCESS
    )
    sequences = defaultdict(list)
    for parent_code, sequence, source_row in final_processes:
        try:
            sequence = int(sequence)
        except (TypeError, ValueError):
            continue
        sequences[(parent_code, sequence)].append(source_row)
    for (parent_code, sequence), source_rows in sequences.items():
        if len(source_rows) <= 1:
            continue
        label = ", ".join("existing master" if row == 0 else f"row {row}" for row in source_rows)
        for source_row in (row for row in source_rows if row):
            issues.append(
                issue(
                    source_row,
                    "metadata_json",
                    "error",
                    f"Process sequence {sequence} is duplicated within line "
                    f"{parent_code} ({label}).",
                )
            )


def validate_machine_processes(factory, parsed, issues):
    uploaded_processes = {
        row.code.casefold(): row for row in parsed if row.kind == FactoryMaster.Kind.PROCESS
    }
    existing_processes = {
        item.code.casefold(): item
        for item in FactoryMaster.objects.filter(
            factory=factory, kind=FactoryMaster.Kind.PROCESS, is_active=True
        ).select_related("parent")
    }
    for row in parsed:
        if row.kind != FactoryMaster.Kind.MACHINE:
            continue
        process_code = str(row.metadata.get("processCode", "")).strip()
        if not process_code:
            continue
        process = uploaded_processes.get(process_code.casefold()) or existing_processes.get(
            process_code.casefold()
        )
        if not process:
            issues.append(
                issue(
                    row.source_row,
                    "metadata_json",
                    "error",
                    f"Assigned process “{process_code}” is neither active nor "
                    "included in this CSV.",
                )
            )
            continue
        process_parent = (
            process.parent_code
            if isinstance(process, ParsedMasterRow)
            else process.parent.code
            if process.parent
            else ""
        )
        if process_parent.casefold() != row.parent_code.casefold():
            issues.append(
                issue(
                    row.source_row,
                    "metadata_json",
                    "error",
                    f"Assigned process “{process_code}” does not belong to line {row.parent_code}.",
                )
            )


@transaction.atomic
def apply_master_import(
    tenant: Tenant,
    factory: Factory,
    uploaded_file,
    expected_checksum: str,
) -> dict[str, Any]:
    if not expected_checksum:
        raise MasterImportError("Inspect the CSV before applying factory masters.")
    list(
        FactoryMaster.objects.select_for_update()
        .filter(factory=factory)
        .values_list("pk", flat=True)
    )
    result = inspect_master_import(factory, uploaded_file)
    if result["checksum"] != expected_checksum:
        raise MasterImportError(
            "The selected file changed after preview. Inspect it again before applying changes."
        )
    if not result["canApply"]:
        raise MasterImportError("Resolve every CSV error before applying factory masters.")

    parsed = result.pop("_parsed")
    saved: dict[tuple[str, str], FactoryMaster] = {}
    counts = Counter()
    for row in sorted(parsed, key=lambda item: (KIND_ORDER[item.kind], item.source_row)):
        parent = None
        if row.kind in {FactoryMaster.Kind.PROCESS, FactoryMaster.Kind.MACHINE}:
            parent = saved.get((FactoryMaster.Kind.LINE, row.parent_code.casefold()))
            if parent is None:
                parent = FactoryMaster.objects.get(
                    factory=factory,
                    kind=FactoryMaster.Kind.LINE,
                    code__iexact=row.parent_code,
                    is_active=True,
                )

        if row.kind == FactoryMaster.Kind.MACHINE:
            from apps.spatial.models import FactoryLayout, SpatialMachine

            layout, _ = FactoryLayout.objects.get_or_create(
                factory=factory,
                defaults={"tenant": tenant, "floor_width": 100, "floor_height": 100},
            )
            process_code = str(row.metadata.get("processCode", "")).strip()
            process = FactoryMaster.objects.filter(
                factory=factory,
                kind=FactoryMaster.Kind.PROCESS,
                code__iexact=process_code,
                is_active=True,
            ).first() if process_code else None
            machine = SpatialMachine.objects.filter(layout=layout, code__iexact=row.code).first()
            if machine is None:
                name_matches = SpatialMachine.objects.filter(layout=layout, name__iexact=row.name)
                machine = name_matches.first() if name_matches.count() == 1 else None
            if machine is None:
                machine = SpatialMachine(tenant=tenant, layout=layout)
            machine.code = row.code
            machine.name = row.name[:50]
            machine.process = process
            machine.metadata = row.metadata
            machine.is_active = True
            machine.full_clean()
            machine.save()

            item = FactoryMaster.objects.filter(
                factory=factory, kind=row.kind, code__iexact=row.code
            ).first() or FactoryMaster(factory=factory, kind=row.kind, code=row.code)
            item.tenant = tenant
            item.name = row.name
            item.code = row.code
            item.parent = parent
            item.metadata = {
                **row.metadata,
                "canonicalMachineId": str(machine.id),
                "migrationOutcome": "imported_to_lexicon",
            }
            item.is_active = False
            item.save()
            counts[row.action] += 1
            continue

        item = FactoryMaster.objects.filter(
            factory=factory, kind=row.kind, code__iexact=row.code
        ).first()
        if item is None:
            item = FactoryMaster(factory=factory, kind=row.kind, code=row.code)
        item.tenant = tenant
        item.name = row.name
        item.code = row.code
        item.parent = parent
        item.metadata = row.metadata
        item.is_active = True
        item.full_clean()
        item.save()
        saved[(row.kind, row.code.casefold())] = item
        counts[row.action] += 1

    result["applied"] = {
        key: counts.get(key, 0) for key in ("create", "update", "reactivate", "unchanged")
    }
    result["appliedTotal"] = len(parsed)
    return result
