"""Validated admin ingestion for externally trained prediction model packages."""

import hashlib
import json
import stat
import zipfile
from pathlib import PurePosixPath

from django.conf import settings
from django.utils.text import slugify

from apps.ml.models import PredictionModel
from apps.ml.registry import MODEL_NAME, SEMVER, repository, sync_models


def _model_artifact(upload):
    if not upload.name.lower().endswith(".zip"):
        raise ValueError("Upload a .zip package containing exactly one .joblib model.")
    if upload.size > settings.ML_MODEL_UPLOAD_MAX_BYTES:
        raise ValueError("The ZIP package exceeds this deployment's upload limit.")
    try:
        archive = zipfile.ZipFile(upload)
    except zipfile.BadZipFile as exc:
        raise ValueError("The uploaded file is not a valid ZIP package.") from exc
    with archive:
        candidates = []
        total_size = 0
        for member in archive.infolist():
            path = PurePosixPath(member.filename)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError("The ZIP package contains an unsafe path.")
            mode = member.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise ValueError("The ZIP package must not contain symbolic links.")
            if member.flag_bits & 0x1:
                raise ValueError("Encrypted ZIP entries are not supported.")
            if member.is_dir():
                continue
            total_size += member.file_size
            if total_size > settings.ML_MODEL_UPLOAD_MAX_BYTES:
                raise ValueError(
                    "The extracted ZIP package exceeds this deployment's upload limit."
                )
            if path.suffix.lower() == ".joblib":
                candidates.append(member)
        if len(candidates) != 1:
            raise ValueError("The ZIP package must contain exactly one .joblib model.")
        artifact = archive.read(candidates[0])
    if not artifact:
        raise ValueError("The model artifact is empty.")
    return artifact


def canonical_parent(profile, name, version):
    machine = profile.machine
    factory = machine.layout.factory
    values = [profile.tenant.slug, factory.code, machine.code, profile.sku.code]
    if any(not value or not slugify(value) for value in values):
        raise ValueError("Tenant, factory, machine and SKU must all have stable codes.")
    return "/".join([*(slugify(value) for value in values), name, f"v{version}"])


def install_uploaded_model(*, profile, name, version, stage, threshold, metrics, upload):
    name = str(name or "").strip()
    version = str(version or "").strip()
    if not MODEL_NAME.fullmatch(name):
        raise ValueError("Model name must be lowercase kebab-case.")
    if not SEMVER.fullmatch(version):
        raise ValueError("Model version must use semantic versioning, for example 1.2.0.")
    if stage not in {"available", "production"}:
        raise ValueError("Model stage must be available or production.")
    if not 0 <= threshold <= 1:
        raise ValueError("Threshold must be between 0 and 1.")
    if not isinstance(metrics, dict):
        raise ValueError("Metrics must be a JSON object.")

    artifact = _model_artifact(upload)
    checksum = hashlib.sha256(artifact).hexdigest()
    machine = profile.machine
    factory = machine.layout.factory
    manifest = {
        "schema_version": 1,
        "name": name,
        "version": version,
        "runtime": "sklearn-joblib",
        "stage": stage,
        "machine": {
            "tenant": profile.tenant.slug,
            "factory": factory.code,
            "code": machine.code,
        },
        "profile": {
            "sku": profile.sku.code,
            "version": profile.version,
            "contract": profile.contract,
            "checkpoint_phase": profile.checkpoint_phase,
            "checkpoint_second": profile.checkpoint_second,
        },
        "artifact": "model.joblib",
        "sha256": checksum,
        "threshold": float(threshold),
        "metrics": metrics,
    }
    parent = canonical_parent(profile, name, version)
    repo = repository()
    repo.put_package(
        parent,
        artifact,
        json.dumps(manifest, indent=2, sort_keys=True).encode(),
    )
    try:
        sync_models()
    except Exception:
        repo.delete_package(parent)
        raise
    return PredictionModel.objects.get(profile=profile, name=name, version=version)
