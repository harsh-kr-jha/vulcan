"""Generate immutable, tenant-scoped Parquet datasets for external ML training."""

from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from datetime import UTC, datetime

from django.utils.text import slugify

from apps.spatial.models import SpatialMachine
from apps.streams.models import MachineCycleOutcome, MachineTelemetrySample
from apps.streams.pipeline import parquet_bytes
from apps.streams.storage import tenant_storage

SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$")
LEVELS = {"machine", "machine-family", "line"}


def dataset_target(machine: SpatialMachine, level: str) -> tuple[str, str]:
    """Return the stable identifier and human label for a dataset scope."""

    if level not in LEVELS:
        raise ValueError(f"Dataset level must be one of: {', '.join(sorted(LEVELS))}.")
    if level == "machine":
        return str(machine.id), machine.code or machine.name
    if level == "machine-family":
        family = str((machine.metadata or {}).get("family") or "unclassified")
        return slugify(family) or "unclassified", family
    line = machine.process.parent if machine.process_id and machine.process.parent_id else None
    if line:
        return str(line.id), line.code or line.name
    return "unassigned", "Unassigned line"


def generate_training_datasets(
    *, tenant, factory, level: str, version: str, target_machine: SpatialMachine | None = None
) -> list[dict]:
    if level not in LEVELS:
        raise ValueError(f"Dataset level must be one of: {', '.join(sorted(LEVELS))}.")
    if not SEMVER.fullmatch(version):
        raise ValueError("Dataset version must use semantic versioning, for example 1.0.0.")
    machines = list(
        SpatialMachine.objects.filter(tenant=tenant, layout__factory=factory, is_active=True)
        .select_related("process__parent")
        .order_by("id")
    )
    if target_machine is not None and (
        target_machine.tenant_id != tenant.id
        or target_machine.layout.factory_id != factory.id
    ):
        raise ValueError("The selected machine does not belong to this tenant and factory.")

    grouped = defaultdict(list)
    labels = {}
    for machine in machines:
        target_id, label = dataset_target(machine, level)
        grouped[target_id].append(machine)
        labels[target_id] = label

    selected_target_id = (
        dataset_target(target_machine, level)[0] if target_machine is not None else None
    )

    generated = []
    storage = tenant_storage(tenant.id)
    for target_id, members in grouped.items():
        if selected_target_id is not None and target_id != selected_target_id:
            continue
        machine_ids = [machine.id for machine in members]
        outcomes = {
            (str(row.machine_id), row.run_id, row.cycle_id): row
            for row in MachineCycleOutcome.objects.filter(machine_id__in=machine_ids)
        }
        rows = []
        features = set()
        samples = MachineTelemetrySample.objects.filter(machine_id__in=machine_ids).order_by(
            "observed_at", "event_id"
        )
        for sample in samples.iterator(chunk_size=2000):
            outcome = outcomes.get((str(sample.machine_id), sample.run_id, sample.cycle_id))
            row = {
                "tenant_id": str(tenant.id),
                "factory_id": str(factory.id),
                "dataset_level": level,
                "dataset_target_id": target_id,
                "machine_id": str(sample.machine_id),
                "event_id": str(sample.event_id),
                "observed_at": sample.observed_at.astimezone(UTC).isoformat(),
                "sequence_no": sample.sequence_no,
                "run_id": sample.run_id,
                "cycle_id": sample.cycle_id,
                "cycle_number": sample.cycle_number,
                "cycle_phase": sample.cycle_phase,
                "recipe_id": sample.recipe_id,
                "outcome_label": outcome.effective_label if outcome else None,
                "quality_score": outcome.quality_score if outcome else None,
            }
            for key, value in sorted(sample.values.items()):
                column = f"feature__{key}"
                features.add(column)
                row[column] = value
            rows.append(row)
        if not rows:
            continue
        for row in rows:
            for feature in features:
                row.setdefault(feature, None)
        data = parquet_bytes(rows)
        safe_target = slugify(labels[target_id]) or slugify(target_id) or "target"
        safe_factory = slugify(factory.code) or str(factory.id)
        root = f"datasets/{safe_factory}/{level}/{safe_target}/v{version}"
        data_key = f"{root}/data.parquet"
        manifest_key = f"{root}/manifest.json"
        checksum = hashlib.sha256(data).hexdigest()
        manifest = {
            "schema_version": 1,
            "version": version,
            "level": level,
            "tenant": tenant.slug,
            "factory": factory.code,
            "target_id": target_id,
            "target": labels[target_id],
            "machine_ids": [str(value) for value in machine_ids],
            "rows": len(rows),
            "features": sorted(features),
            "from": rows[0]["observed_at"],
            "to": rows[-1]["observed_at"],
            "parquet": "data.parquet",
            "sha256": checksum,
            "compression": "zstd",
            "created_at": datetime.now(UTC).isoformat(),
        }
        if storage.exists(manifest_key) or storage.exists(data_key):
            raise ValueError(
                f"Dataset {level}/{safe_target}/v{version} already exists; versions are immutable."
            )
        storage.put(data_key, data, content_type="application/vnd.apache.parquet")
        storage.put(
            manifest_key,
            json.dumps(manifest, indent=2, sort_keys=True).encode(),
            content_type="application/json",
        )
        generated.append({**manifest, "data_key": data_key, "manifest_key": manifest_key})
    return generated
