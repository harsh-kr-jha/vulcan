import hashlib
import io
import os
import random
from functools import lru_cache
from pathlib import Path, PurePosixPath

import joblib
import numpy as np
from django.conf import settings
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.metrics import balanced_accuracy_score, confusion_matrix
from sklearn.pipeline import make_pipeline

from apps.ml.models import MachineCycle, TrainingRun
from apps.operations.services import ObjectStorage
from apps.streams.models import MachineCycleOutcome


def _local_artifact_path(key):
    relative = PurePosixPath(key.removeprefix("local:"))
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Invalid local model artifact key.")
    return Path(settings.ML_ARTIFACT_DIR).joinpath(*relative.parts)


def _store_artifact(key, data):
    storage = ObjectStorage()
    if storage.client:
        storage.client.put_object(Bucket=storage.bucket, Key=key, Body=data)
        return key
    if not settings.ML_ARTIFACT_DIR:
        raise ValueError("Configure private S3/MinIO storage before training models.")
    key = f"local:{key}"
    path = _local_artifact_path(key)
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    path.write_bytes(data)
    os.chmod(path, 0o600)
    return key


def _read_artifact(key):
    if key.startswith("local:"):
        return _local_artifact_path(key).read_bytes()
    storage = ObjectStorage()
    return storage.client.get_object(Bucket=storage.bucket, Key=key)["Body"].read()


def labeled_cycles(profile):
    outcomes = {
        (o.run_id, o.cycle_id): o
        for o in MachineCycleOutcome.objects.filter(machine=profile.machine)
    }
    result = []
    for cycle in (
        MachineCycle.objects.filter(
            profile__machine=profile.machine,
            profile__sku=profile.sku,
            profile__contract=profile.contract,
            profile__checkpoint_phase=profile.checkpoint_phase,
            profile__checkpoint_second=profile.checkpoint_second,
            completed=True,
        )
        .order_by("started_at")
        .prefetch_related("snapshots")
    ):
        outcome = outcomes.get((cycle.run_id, cycle.cycle_id))
        snapshots = list(cycle.snapshots.order_by("sequence_no"))
        if outcome and snapshots and any(s.checkpoint for s in snapshots):
            result.append((cycle, outcome, snapshots))
    return result


def eligibility(profile):
    pairs = set(
        MachineCycle.objects.filter(
            profile__machine=profile.machine,
            profile__sku=profile.sku,
            profile__contract=profile.contract,
            profile__checkpoint_phase=profile.checkpoint_phase,
            profile__checkpoint_second=profile.checkpoint_second,
            completed=True,
            snapshots__checkpoint=True,
        )
        .values_list("run_id", "cycle_id")
        .distinct()
    )
    labels = [
        o.effective_label
        for o in MachineCycleOutcome.objects.filter(machine=profile.machine)
        if (o.run_id, o.cycle_id) in pairs
    ]
    failures = labels.count("failure")
    return {
        "cycles": len(labels),
        "good": len(labels) - failures,
        "failure": failures,
        "eligible": len(labels) >= 200 and failures >= 20 and len(labels) - failures >= 20,
    }


def rows_eligibility(rows):
    labels = [outcome.effective_label for _, outcome, _ in rows]
    failures = labels.count("failure")
    return len(labels) >= 200 and failures >= 20 and len(labels) - failures >= 20


def _partition_has_classes(rows, minimum=5):
    labels = [outcome.effective_label for _, outcome, _ in rows]
    return labels.count("good") >= minimum and labels.count("failure") >= minimum


def _stratified_cycle_split(rows):
    """Deterministic fallback when whole runs cannot form valid partitions.

    Keeping run IDs isolated is preferable, but a few uneven runs can otherwise
    put every failure into one partition. Shuffle within each outcome so every
    partition receives enough examples without making training non-repeatable.
    """
    by_label = {
        label: [row for row in rows if row[1].effective_label == label]
        for label in ("good", "failure")
    }
    partitions = [[], [], []]
    for offset, label in enumerate(("good", "failure")):
        labeled = by_label[label]
        random.Random(42 + offset).shuffle(labeled)
        validation_size = max(5, round(len(labeled) * 0.2))
        test_size = max(5, round(len(labeled) * 0.2))
        train_end = len(labeled) - validation_size - test_size
        if train_end < 5:
            raise ValueError(
                "Training, validation and test partitions each require five cycles of both classes."
            )
        partitions[0].extend(labeled[:train_end])
        partitions[1].extend(labeled[train_end : train_end + validation_size])
        partitions[2].extend(labeled[train_end + validation_size :])
    for index, partition in enumerate(partitions):
        random.Random(44 + index).shuffle(partition)
    return partitions


def split_cycles(rows):
    runs = list(dict.fromkeys(c.run_id for c, _, _ in rows))
    if len(runs) >= 3:
        a, b = max(1, int(len(runs) * 0.6)), max(2, int(len(runs) * 0.8))
        groups = [set(runs[:a]), set(runs[a:b]), set(runs[b:])]
        partitions = [[row for row in rows if row[0].run_id in group] for group in groups]
        if all(_partition_has_classes(partition) for partition in partitions):
            return partitions
    return _stratified_cycle_split(rows)


def _evaluation(pipeline, rows):
    features, labels = [], []
    for _, outcome, snapshots in rows:
        checkpoint = next(s for s in snapshots if s.checkpoint)
        features.append(checkpoint.features)
        labels.append(int(outcome.effective_label == "failure"))
    if not features or min(labels.count(0), labels.count(1)) < 5:
        raise ValueError("Validation and test partitions each require five cycles of both classes.")
    return np.array(labels), pipeline.predict_proba(features)[:, 1]


def train(run_id):
    run = TrainingRun.objects.select_related("profile").get(pk=run_id)
    if not TrainingRun.objects.filter(pk=run.pk, status="queued").update(status="training"):
        return
    run.status = "training"
    run.error = ""
    try:
        rows = labeled_cycles(run.profile)
        requested_limit = run.metrics.get("requested_cycle_limit")
        if requested_limit:
            rows = rows[-requested_limit:]
        if not rows_eligibility(rows):
            raise ValueError(
                "Selected data requires 200 labeled cycles, including 20 of each class."
            )
        train_rows, validation, test = split_cycles(rows)
        run_sets = [
            {cycle.run_id for cycle, _, _ in partition}
            for partition in (train_rows, validation, test)
        ]
        run_isolated = all(
            left.isdisjoint(right)
            for index, left in enumerate(run_sets)
            for right in run_sets[index + 1 :]
        )
        features, labels, weights = [], [], []
        for _, outcome, snapshots in train_rows:
            # Every prefix remains a training example, while later prefixes receive
            # more weight because they contain more of the cycle's observable evidence.
            # This prevents the many necessarily ambiguous loading samples from
            # overwhelming the configured decision-checkpoint signal.
            progression_total = sum(index * index for index in range(1, len(snapshots) + 1))
            for index, snapshot in enumerate(snapshots, start=1):
                features.append(snapshot.features)
                labels.append(int(outcome.effective_label == "failure"))
                weights.append(index * index / progression_total)
        pipeline = make_pipeline(
            DictVectorizer(sparse=False),
            HistGradientBoostingClassifier(
                class_weight="balanced",
                random_state=42,
                max_iter=100,
                max_leaf_nodes=15,
                early_stopping=False,
            ),
        )
        pipeline.fit(features, labels, histgradientboostingclassifier__sample_weight=weights)
        truth, probabilities = _evaluation(pipeline, validation)
        thresholds = np.linspace(0.05, 0.95, 91)
        validation_scores = {
            float(candidate): balanced_accuracy_score(truth, probabilities >= candidate)
            for candidate in thresholds
        }
        threshold = max(
            thresholds,
            key=lambda candidate: (
                validation_scores[float(candidate)],
                -abs(candidate - 0.5),
            ),
        )
        truth, probabilities = _evaluation(pipeline, test)
        predicted = probabilities >= threshold
        score = balanced_accuracy_score(truth, predicted)
        run.threshold = float(threshold)
        run.metrics = {
            "balanced_accuracy": float(score),
            "validation_balanced_accuracy": float(validation_scores[float(threshold)]),
            "confusion_matrix": confusion_matrix(truth, predicted).tolist(),
            "train_cycles": len(train_rows),
            "validation_cycles": len(validation),
            "test_cycles": len(test),
            "split_strategy": "run_isolated" if run_isolated else "stratified_cycles",
            "requested_cycle_limit": requested_limit,
        }
        run.dataset = [
            {
                "cycle": str(c.id),
                "outcome": str(o.id),
                "label": o.effective_label,
                "human_revision": o.overridden_at.isoformat() if o.overridden_at else "",
                "partition": partition,
            }
            for partition, subset in zip(
                ["train", "validation", "test"], [train_rows, validation, test], strict=True
            )
            for c, o, _ in subset
        ]
        if score < 0.70:
            raise ValueError("Candidate did not meet 0.70 test balanced accuracy.")
        buffer = io.BytesIO()
        joblib.dump(pipeline, buffer)
        data = buffer.getvalue()
        artifact_key = f"ml/tenant-{run.tenant_id}/{run.id}/model.joblib"
        run.artifact_key = _store_artifact(artifact_key, data)
        run.checksum = hashlib.sha256(data).hexdigest()
        run.status = "candidate"
    except Exception as exc:
        run.status = "failed"
        run.error = str(exc)[:2000]
    run.save()


@lru_cache(maxsize=16)
def _load(key, checksum):
    data = _read_artifact(key)
    if hashlib.sha256(data).hexdigest() != checksum:
        raise ValueError("Model checksum mismatch")
    return joblib.load(io.BytesIO(data))


def load_artifact(run):
    return _load(run.artifact_key, run.checksum)
