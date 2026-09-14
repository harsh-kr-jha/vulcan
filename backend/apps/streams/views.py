import base64
import json

from django.db.models import Count, Max, Min, ProtectedError, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import CanOperateUploads, factories_for_request, tenant_for_request
from apps.spatial.models import SpatialMachine
from apps.streams.client import StreamClientError, request_json, valid_control_action
from apps.streams.models import (
    DataInputStream,
    MachineCycleOutcome,
    MachineStreamBinding,
    MachineTelemetrySample,
)
from apps.streams.serializers import (
    DataInputStreamSerializer,
    MachineCycleOutcomeSerializer,
    MachineTelemetrySerializer,
)
from apps.streams.services import bind_machine, discover_stream, refresh_binding_schema


class DataInputStreamViewSet(viewsets.ModelViewSet):
    serializer_class = DataInputStreamSerializer
    permission_classes = [CanOperateUploads]

    def get_queryset(self):
        queryset = DataInputStream.objects.filter(
            tenant=tenant_for_request(self.request), factory__in=factories_for_request(self.request)
        ).prefetch_related(
            "channels__machine_binding__machine", "channels__schema_versions", "credential"
        )
        factory = self.request.query_params.get("factory")
        return queryset.filter(factory_id=factory) if factory else queryset

    def destroy(self, request, *args, **kwargs):
        stream = self.get_object()
        if any(hasattr(channel, "machine_binding") for channel in stream.channels.all()):
            return Response(
                {
                    "detail": (
                        "Disconnect every assigned Lexicon machine before deleting this stream."
                    )
                },
                status=409,
            )
        try:
            stream.delete()
        except ProtectedError:
            return Response({"detail": "This stream still has protected dependencies."}, status=409)
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def discover(self, request, pk=None):
        stream = self.get_object()
        try:
            manifest = discover_stream(stream)
        except StreamClientError as exc:
            stream.status = "degraded"
            stream.last_error = str(exc)
            stream.save(update_fields=["status", "last_error", "updated_at"])
            return Response({"detail": str(exc)}, status=400)
        return Response({"manifest": manifest, "stream": self.get_serializer(stream).data})

    @action(detail=True, methods=["post"], url_path=r"control/(?P<control_action>[a-z0-9_-]+)")
    def control(self, request, pk=None, control_action=None):
        stream = self.get_object()
        if not stream.enabled:
            return Response({"detail": "Enable this source before controlling it."}, status=409)
        controls = (
            stream.capabilities.get("controls", []) if isinstance(stream.capabilities, dict) else []
        )
        allowed = {item.get("id") for item in controls if isinstance(item, dict)}
        if not valid_control_action(control_action or "") or control_action not in allowed:
            return Response({"detail": "This source did not advertise that control."}, status=400)
        try:
            result = request_json(
                stream, f"/v1/control/{control_action}", method="POST", payload=request.data
            )
        except StreamClientError as exc:
            return Response({"detail": str(exc)}, status=502)
        return Response(result)


class MachineStreamBindingView(APIView):
    permission_classes = [CanOperateUploads]

    def delete(self, request, machine_id):
        machine = get_object_or_404(
            SpatialMachine,
            id=machine_id,
            tenant=tenant_for_request(request),
            layout__factory__in=factories_for_request(request),
        )
        bind_machine(machine, None)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MachineStreamSchemaAcceptanceView(APIView):
    permission_classes = [CanOperateUploads]

    def post(self, request, machine_id):
        binding = get_object_or_404(
            MachineStreamBinding.objects.select_related("machine__layout", "channel__stream"),
            machine_id=machine_id,
            tenant=tenant_for_request(request),
            machine__layout__factory__in=factories_for_request(request),
        )
        try:
            refresh_binding_schema(binding, accept_incompatible=True)
        except StreamClientError as exc:
            return Response({"detail": str(exc)}, status=400)
        binding.refresh_from_db()
        return Response({"status": binding.status, "last_error": binding.last_error})


class MachineTelemetryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, machine_id):
        machine = get_object_or_404(
            SpatialMachine,
            id=machine_id,
            tenant=tenant_for_request(request),
            layout__factory__in=factories_for_request(request),
        )
        limit = min(500, max(1, int(request.query_params.get("limit", "50"))))
        samples = list(MachineTelemetrySample.objects.filter(machine=machine)[:limit])
        run_ids = {sample.run_id for sample in samples if sample.run_id}
        cycle_ids = {sample.cycle_id for sample in samples if sample.cycle_id}
        outcomes = {
            (outcome.run_id, outcome.cycle_id): outcome
            for outcome in MachineCycleOutcome.objects.filter(
                machine=machine, run_id__in=run_ids, cycle_id__in=cycle_ids
            ).select_related("overridden_by")
        }
        serializer = MachineTelemetrySerializer(samples, many=True, context={"outcomes": outcomes})
        return Response({"results": serializer.data})


class MachineCycleOutcomeView(APIView):
    permission_classes = [CanOperateUploads]

    def patch(self, request, machine_id, outcome_id):
        outcome = get_object_or_404(
            MachineCycleOutcome.objects.select_related("machine__layout", "overridden_by"),
            id=outcome_id,
            machine_id=machine_id,
            tenant=tenant_for_request(request),
            machine__layout__factory__in=factories_for_request(request),
        )
        label = str(request.data.get("effective_label", ""))
        if label not in {"good", "failure"}:
            return Response({"effective_label": ["Choose either good or failure."]}, status=400)
        outcome.effective_label = label
        outcome.overridden_by = request.user
        outcome.overridden_at = timezone.now()
        outcome.override_note = str(request.data.get("override_note", ""))[:2000]
        outcome.save(
            update_fields=[
                "effective_label",
                "overridden_by",
                "overridden_at",
                "override_note",
                "updated_at",
            ]
        )
        return Response(MachineCycleOutcomeSerializer(outcome).data)


def _cycle_cursor(summary):
    payload = json.dumps(
        [summary["ended_at"].isoformat(), summary["run_id"], summary["cycle_id"]],
        separators=(",", ":"),
    ).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def _parse_cycle_cursor(value):
    try:
        padded = value + "=" * (-len(value) % 4)
        ended_at, run_id, cycle_id = json.loads(base64.urlsafe_b64decode(padded))
        parsed = parse_datetime(ended_at)
        if parsed is None:
            raise ValueError
        return parsed, str(run_id), str(cycle_id)
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("Invalid history cursor.") from exc


class MachineCycleHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, machine_id):
        machine = get_object_or_404(
            SpatialMachine,
            id=machine_id,
            tenant=tenant_for_request(request),
            layout__factory__in=factories_for_request(request),
        )
        limit = min(50, max(1, int(request.query_params.get("limit", "20"))))
        summaries = (
            MachineTelemetrySample.objects.filter(machine=machine)
            .exclude(cycle_id="")
            .values("run_id", "cycle_id", "cycle_number", "recipe_id")
            .annotate(
                started_at=Min("observed_at"),
                ended_at=Max("observed_at"),
                sample_count=Count("id"),
            )
            .order_by("-ended_at", "-run_id", "-cycle_id")
        )
        cursor = request.query_params.get("cursor")
        if cursor:
            try:
                ended_at, run_id, cycle_id = _parse_cycle_cursor(cursor)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)
            summaries = summaries.filter(
                Q(ended_at__lt=ended_at)
                | Q(ended_at=ended_at, run_id__lt=run_id)
                | Q(ended_at=ended_at, run_id=run_id, cycle_id__lt=cycle_id)
            )
        page = list(summaries[: limit + 1])
        has_more = len(page) > limit
        page = page[:limit]

        pairs = {(item["run_id"], item["cycle_id"]) for item in page}
        pair_filter = Q()
        for run_id, cycle_id in pairs:
            pair_filter |= Q(run_id=run_id, cycle_id=cycle_id)
        samples = (
            list(
                MachineTelemetrySample.objects.filter(machine=machine)
                .filter(pair_filter)
                .order_by("observed_at")
            )
            if pairs
            else []
        )
        outcomes = (
            {
                (outcome.run_id, outcome.cycle_id): outcome
                for outcome in MachineCycleOutcome.objects.filter(machine=machine)
                .filter(pair_filter)
                .select_related("overridden_by")
            }
            if pairs
            else {}
        )
        samples_by_cycle = {pair: [] for pair in pairs}
        for sample in samples:
            samples_by_cycle[(sample.run_id, sample.cycle_id)].append(sample)

        results = []
        from apps.ml.models import MachineCycle
        from apps.ml.views import cycle_data, prediction_data

        ml_cycles = (
            {
                (c.run_id, c.cycle_id): c
                for c in MachineCycle.objects.filter(machine=machine)
                .filter(pair_filter)
                .select_related("profile__sku")
                .prefetch_related("snapshots")
            }
            if pairs
            else {}
        )
        for summary in page:
            pair = (summary["run_id"], summary["cycle_id"])
            ml_cycle = ml_cycles.get(pair)
            observation = cycle_data(ml_cycle)
            sample_ml = {str(s.event_id): s for s in ml_cycle.snapshots.all()} if ml_cycle else {}
            sample_rows = MachineTelemetrySerializer(
                samples_by_cycle[pair], many=True, context={"outcomes": {}}
            ).data
            for row in sample_rows:
                snapshot = sample_ml.get(str(row["event_id"]))
                row["ml"] = (
                    {
                        "violations": snapshot.violations,
                        "prediction": prediction_data(snapshot) if snapshot.model_id else None,
                    }
                    if snapshot
                    else None
                )
            actual = outcomes.get(pair)
            if observation:
                prediction = observation["checkpoint_prediction"]
                observation["correct"] = (
                    prediction["label"] == actual.effective_label if prediction and actual else None
                )
            results.append(
                {
                    **summary,
                    "outcome": MachineCycleOutcomeSerializer(outcomes[pair]).data
                    if pair in outcomes
                    else None,
                    "samples": sample_rows,
                    "ml": observation,
                }
            )
        return Response(
            {
                "results": results,
                "next_cursor": _cycle_cursor(page[-1]) if has_more and page else None,
            }
        )
