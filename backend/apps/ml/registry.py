"""Trusted, read-only model registry used by the prediction runtime.

Models are trained outside Vulcan. This module only discovers manifests, verifies
their artifacts, records versions and loads the selected production model.
"""

import hashlib
import io
import json
import re
import shutil
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path, PurePosixPath

import boto3
import joblib
from botocore.exceptions import ClientError
from django.conf import settings
from django.db import transaction
from django.utils.text import slugify

from apps.ml.models import PredictionModel, ProductionProfile

SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
MODEL_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


@dataclass(frozen=True)
class RegistryObject:
    key: str
    data: bytes


class LocalModelRepository:
    scheme = "local"

    def __init__(self):
        self.root = Path(settings.ML_MODEL_DIR).resolve()

    def manifests(self):
        if not self.root.exists():
            return []
        return [
            RegistryObject(path.relative_to(self.root).as_posix(), path.read_bytes())
            for path in sorted(self.root.rglob("manifest.json"))
            if path.is_file()
        ]

    def read(self, key):
        relative = _safe_relative_key(key)
        path = self.root.joinpath(*relative.parts).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Model artifact escapes ML_MODEL_DIR.")
        return path.read_bytes()

    def put_package(self, parent_key, artifact_data, manifest_data):
        relative = _safe_relative_key(parent_key)
        target = self.root.joinpath(*relative.parts).resolve()
        if not target.is_relative_to(self.root):
            raise ValueError("Model package escapes ML_MODEL_DIR.")
        if target.exists():
            raise ValueError("That immutable model version already exists.")
        try:
            target.mkdir(mode=0o700, parents=True)
            artifact = target / "model.joblib"
            artifact_tmp = target / ".model.joblib.tmp"
            manifest = target / "manifest.json"
            manifest_tmp = target / ".manifest.json.tmp"
            artifact_tmp.write_bytes(artifact_data)
            artifact_tmp.chmod(0o400)
            artifact_tmp.replace(artifact)
            manifest_tmp.write_bytes(manifest_data)
            manifest_tmp.chmod(0o400)
            # Publish the manifest last so registry scans never see a partial package.
            manifest_tmp.replace(manifest)
        except Exception:
            if target.exists():
                shutil.rmtree(target)
            raise
        return relative.joinpath("manifest.json").as_posix()

    def delete_package(self, parent_key):
        relative = _safe_relative_key(parent_key)
        target = self.root.joinpath(*relative.parts).resolve()
        if not target.is_relative_to(self.root):
            raise ValueError("Model package escapes ML_MODEL_DIR.")
        if target.exists():
            shutil.rmtree(target)


class S3ModelRepository:
    scheme = "s3"

    def __init__(self):
        if not settings.ML_MODEL_BUCKET:
            raise ValueError("ML_MODEL_BUCKET is required when ML_MODEL_SOURCE=s3.")
        self.bucket = settings.ML_MODEL_BUCKET
        self.prefix = settings.ML_MODEL_PREFIX.strip("/")
        self.client = boto3.client(
            "s3", region_name=settings.AWS_REGION, endpoint_url=settings.ML_MODEL_ENDPOINT_URL
        )

    def manifests(self):
        prefix = f"{self.prefix}/" if self.prefix else ""
        paginator = self.client.get_paginator("list_objects_v2")
        result = []
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                key = item["Key"]
                if key.endswith("/manifest.json"):
                    result.append(RegistryObject(key, self.read(key)))
        return sorted(result, key=lambda item: item.key)

    def read(self, key):
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def _upload_key(self, key):
        relative = _safe_relative_key(key).as_posix()
        return f"{self.prefix}/{relative}" if self.prefix else relative

    def put_package(self, parent_key, artifact_data, manifest_data):
        artifact_key = self._upload_key(f"{parent_key}/model.joblib")
        manifest_key = self._upload_key(f"{parent_key}/manifest.json")
        for key in (artifact_key, manifest_key):
            try:
                self.client.head_object(Bucket=self.bucket, Key=key)
            except ClientError as exc:
                if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 404:
                    raise
            else:
                raise ValueError("That immutable model version already exists.")
        written = []
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=artifact_key,
                Body=artifact_data,
                ContentType="application/octet-stream",
            )
            written.append(artifact_key)
            # Publish the manifest last so registry scans never see a partial package.
            self.client.put_object(
                Bucket=self.bucket,
                Key=manifest_key,
                Body=manifest_data,
                ContentType="application/json",
            )
            written.append(manifest_key)
        except Exception:
            if written:
                self.client.delete_objects(
                    Bucket=self.bucket,
                    Delete={"Objects": [{"Key": key} for key in written]},
                )
            raise
        return manifest_key

    def delete_package(self, parent_key):
        keys = [
            self._upload_key(f"{parent_key}/model.joblib"),
            self._upload_key(f"{parent_key}/manifest.json"),
        ]
        self.client.delete_objects(
            Bucket=self.bucket,
            Delete={"Objects": [{"Key": key} for key in keys]},
        )


def repository():
    if settings.ML_MODEL_SOURCE == "local":
        return LocalModelRepository()
    if settings.ML_MODEL_SOURCE == "s3":
        return S3ModelRepository()
    raise ValueError("ML_MODEL_SOURCE must be 'local' or 's3'.")


def _safe_relative_key(key):
    relative = PurePosixPath(key)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Invalid model registry key.")
    return relative


def _required_string(value, field):
    if not isinstance(value, str) or not value:
        raise ValueError(f"Manifest field '{field}' must be a non-empty string.")
    return value


def _profile_for_manifest(data, manifest_key):
    machine_data = data.get("machine")
    profile_data = data.get("profile")
    if not isinstance(machine_data, dict) or not isinstance(profile_data, dict):
        raise ValueError("Manifest requires machine and profile objects.")
    tenant_slug = _required_string(machine_data.get("tenant"), "machine.tenant")
    factory_code = _required_string(machine_data.get("factory"), "machine.factory")
    machine_code = _required_string(machine_data.get("code"), "machine.code")
    sku_code = _required_string(profile_data.get("sku"), "profile.sku")
    profile_version = profile_data.get("version")
    if isinstance(profile_version, bool) or not isinstance(profile_version, int):
        raise ValueError("Manifest field 'profile.version' must be an integer.")
    profile = (
        ProductionProfile.objects.select_related("machine__layout__factory", "sku")
        .filter(
            tenant__slug=tenant_slug,
            machine__layout__factory__code=factory_code,
            machine__code=machine_code,
            sku__code=sku_code,
            version=profile_version,
        )
        .first()
    )
    if profile is None:
        raise ValueError(
            f"No profile matches {tenant_slug}/{factory_code}/{machine_code}/"
            f"{sku_code}/v{profile_version}."
        )
    expected_contract = _required_string(profile_data.get("contract"), "profile.contract")
    if expected_contract != profile.contract:
        raise ValueError("Manifest feature contract does not match the production profile.")
    if profile_data.get("checkpoint_phase") != profile.checkpoint_phase:
        raise ValueError("Manifest checkpoint phase does not match the production profile.")
    if profile_data.get("checkpoint_second") != profile.checkpoint_second:
        raise ValueError("Manifest checkpoint second does not match the production profile.")

    expected_parent = "/".join(
        [
            slugify(tenant_slug),
            slugify(factory_code),
            slugify(machine_code),
            slugify(sku_code),
            data["name"],
            f"v{data['version']}",
        ]
    )
    path = PurePosixPath(manifest_key)
    # S3 may have an arbitrary configured prefix before the canonical model path.
    if "/".join(path.parts[-7:-1]) != expected_parent:
        raise ValueError(
            "Manifest must use '<tenant>/<factory>/<machine>/<sku>/<name>/v<version>'."
        )
    return profile


def _validate_manifest(raw, manifest_key):
    try:
        data = json.loads(raw)
    except (TypeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"Invalid JSON in {manifest_key}.") from exc
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise ValueError("Only model manifest schema_version 1 is supported.")
    name = _required_string(data.get("name"), "name")
    version = _required_string(data.get("version"), "version")
    if not MODEL_NAME.fullmatch(name):
        raise ValueError("Model name must be lowercase kebab-case.")
    if not SEMVER.fullmatch(version):
        raise ValueError("Model version must use semantic versioning (for example 1.2.0).")
    runtime = data.get("runtime", "sklearn-joblib")
    if runtime != "sklearn-joblib":
        raise ValueError("Only the sklearn-joblib prediction runtime is supported.")
    checksum = _required_string(data.get("sha256"), "sha256").lower()
    if not SHA256.fullmatch(checksum):
        raise ValueError("Manifest sha256 must contain 64 lowercase hexadecimal characters.")
    artifact = _safe_relative_key(_required_string(data.get("artifact"), "artifact"))
    if len(artifact.parts) != 1:
        raise ValueError("Manifest artifact must be a filename beside manifest.json.")
    threshold = data.get("threshold", 0.5)
    if (
        isinstance(threshold, bool)
        or not isinstance(threshold, (int, float))
        or not 0 <= threshold <= 1
    ):
        raise ValueError("Manifest threshold must be a number from 0 to 1.")
    stage = data.get("stage", "available")
    if stage not in {"available", "production"}:
        raise ValueError("Manifest stage must be 'available' or 'production'.")
    if not isinstance(data.get("metrics", {}), dict):
        raise ValueError("Manifest metrics must be an object.")
    data.update(
        name=name,
        version=version,
        runtime=runtime,
        sha256=checksum,
        artifact=artifact.name,
        threshold=float(threshold),
        stage=stage,
    )
    return data


def _artifact_key(repo, manifest_key, filename):
    parent = PurePosixPath(manifest_key).parent
    return f"{repo.scheme}:{parent.joinpath(filename).as_posix()}"


def semantic_version_key(version):
    core, _, suffix = version.partition("-")
    prerelease = (
        tuple((0, int(part)) if part.isdigit() else (1, part) for part in suffix.split("."))
        if suffix
        else ((2, ""),)
    )
    return (*map(int, core.split(".")), prerelease)


@transaction.atomic
def sync_models():
    """Synchronise the database with the configured read-only model source."""
    repo = repository()
    discovered = []
    for item in repo.manifests():
        data = _validate_manifest(item.data, item.key)
        profile = _profile_for_manifest(data, item.key)
        artifact_ref = _artifact_key(repo, item.key, data["artifact"])
        artifact_data = read_artifact(artifact_ref)
        if hashlib.sha256(artifact_data).hexdigest() != data["sha256"]:
            raise ValueError(f"Checksum mismatch for {artifact_ref}.")
        model, _ = PredictionModel.objects.update_or_create(
            profile=profile,
            name=data["name"],
            version=data["version"],
            defaults={
                "tenant": profile.tenant,
                "runtime": data["runtime"],
                "metrics": data.get("metrics", {}),
                "artifact_key": artifact_ref,
                "manifest_key": f"{repo.scheme}:{item.key}",
                "checksum": data["sha256"],
                "threshold": data["threshold"],
                "active": False,
            },
        )
        discovered.append((model, data["stage"]))

    PredictionModel.objects.filter(active=True).update(active=False)
    production = {}
    for model, stage in discovered:
        if stage != "production":
            continue
        profile = model.profile
        key = (
            profile.machine_id,
            profile.sku_id,
            profile.contract,
            profile.checkpoint_phase,
            profile.checkpoint_second,
        )
        current = production.get(key)
        if current is None or semantic_version_key(model.version) > semantic_version_key(
            current.version
        ):
            production[key] = model
    PredictionModel.objects.filter(pk__in=[model.pk for model in production.values()]).update(
        active=True
    )
    _load.cache_clear()
    return {"discovered": len(discovered), "active": len(production)}


def read_artifact(reference):
    scheme, separator, key = reference.partition(":")
    if not separator:
        raise ValueError("Model artifact reference has no source scheme.")
    repo = repository()
    if repo.scheme != scheme:
        raise ValueError(f"Model source is '{repo.scheme}', but artifact uses '{scheme}'.")
    return repo.read(key)


@lru_cache(maxsize=32)
def _load(key, checksum):
    data = read_artifact(key)
    if hashlib.sha256(data).hexdigest() != checksum:
        raise ValueError("Model checksum mismatch.")
    # Joblib is pickle-based. Registry storage must remain private and trusted.
    return joblib.load(io.BytesIO(data))


def load_model(model):
    return _load(model.artifact_key, model.checksum)
