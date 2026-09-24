from django.utils import timezone
from rest_framework import serializers

from apps.alerts.models import Alert, AlertStatus


class AlertSerializer(serializers.ModelSerializer):
    description = serializers.CharField(source="explanation", read_only=True)
    asset = serializers.SerializerMethodField()
    occurredAt = serializers.DateTimeField(source="generated_at", read_only=True)
    relativeTime = serializers.SerializerMethodField()
    threshold = serializers.CharField(source="threshold_display", read_only=True)
    observed = serializers.CharField(source="observed_value", read_only=True)
    ruleVersion = serializers.CharField(source="rule.version", read_only=True)
    machineId = serializers.UUIDField(source="machine_id", read_only=True)
    lineId = serializers.UUIDField(source="line_id", read_only=True)

    class Meta:
        model = Alert
        fields = [
            "id",
            "title",
            "description",
            "asset",
            "severity",
            "status",
            "occurredAt",
            "relativeTime",
            "recommendation",
            "threshold",
            "observed",
            "ruleVersion",
            "machineId",
            "lineId",
        ]
        read_only_fields = [field for field in fields if field != "status"]

    def get_asset(self, obj) -> str:
        if obj.machine:
            return f"{obj.machine.name} · {obj.line.name if obj.line else obj.factory.name}"
        if obj.line:
            return f"{obj.line.name} · {obj.factory.name}"
        return obj.factory.name

    def get_relativeTime(self, obj) -> str:
        delta = timezone.now() - obj.generated_at
        minutes = max(0, int(delta.total_seconds() // 60))
        if minutes < 60:
            return f"{minutes} min ago"
        if minutes < 1_440:
            return f"{minutes // 60} hr ago"
        return f"{minutes // 1_440} days ago"

    def update(self, instance, validated_data):
        next_status = validated_data.get("status")
        if next_status == AlertStatus.ACKNOWLEDGED and instance.acknowledged_at is None:
            instance.acknowledged_at = timezone.now()
        if next_status == AlertStatus.RESOLVED and instance.resolved_at is None:
            instance.resolved_at = timezone.now()
        return super().update(instance, validated_data)
