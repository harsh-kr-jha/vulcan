from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.common.permissions import factories_for_request, tenant_for_request
from apps.streams.client import StreamClientError, validate_base_url
from apps.streams.crypto import encrypt_secret
from apps.streams.models import (
    DataInputStream,
    DataStreamChannel,
    DataStreamCredential,
    MachineCycleOutcome,
    MachineTelemetrySample,
)


class DataStreamChannelSerializer(serializers.ModelSerializer):
    assigned_machine_id = serializers.SerializerMethodField()
    assigned_machine_name = serializers.SerializerMethodField()
    binding_status = serializers.SerializerMethodField()
    binding_error = serializers.SerializerMethodField()
    binding_last_received_at = serializers.SerializerMethodField()
    schema_review = serializers.SerializerMethodField()

    class Meta:
        model = DataStreamChannel
        fields = [
            "id",
            "external_id",
            "name",
            "schema_version",
            "schema",
            "latest_cursor",
            "active",
            "assigned_machine_id",
            "assigned_machine_name",
            "binding_status",
            "binding_error",
            "binding_last_received_at",
            "schema_review",
        ]

    def get_assigned_machine_id(self, obj):
        try:
            return str(obj.machine_binding.machine_id)
        except Exception:
            return None

    def get_assigned_machine_name(self, obj):
        try:
            return obj.machine_binding.machine.name
        except Exception:
            return None

    def get_binding_status(self, obj):
        try:
            return obj.machine_binding.status
        except Exception:
            return None

    def get_binding_error(self, obj):
        try:
            return obj.machine_binding.last_error
        except Exception:
            return ""

    def get_binding_last_received_at(self, obj):
        try:
            return obj.machine_binding.last_received_at
        except Exception:
            return None

    def get_schema_review(self, obj):
        try:
            if obj.machine_binding.status != "schema_review":
                return None
        except Exception:
            return None
        snapshot = obj.schema_versions.order_by("-created_at").first()
        if not snapshot or snapshot.version == obj.schema_version:
            return None
        old_fields = {
            field.get("key"): field for field in obj.schema.get("fields", []) if field.get("key")
        }
        changes = []
        for field in snapshot.schema.get("fields", []):
            key = field.get("key")
            old = old_fields.get(key)
            if old and (old.get("data_type"), old.get("unit")) != (
                field.get("data_type"),
                field.get("unit"),
            ):
                changes.append(
                    {
                        "key": key,
                        "old_type": old.get("data_type"),
                        "new_type": field.get("data_type"),
                        "old_unit": old.get("unit", ""),
                        "new_unit": field.get("unit", ""),
                    }
                )
        return {"version": snapshot.version, "changes": changes}


class DataInputStreamSerializer(serializers.ModelSerializer):
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=False)
    key_hint = serializers.SerializerMethodField()
    channels = DataStreamChannelSerializer(many=True, read_only=True)
    assigned_machines = serializers.SerializerMethodField()

    class Meta:
        model = DataInputStream
        fields = [
            "id",
            "factory",
            "name",
            "base_url",
            "protocol",
            "enabled",
            "status",
            "capabilities",
            "source_metadata",
            "poll_interval_seconds",
            "last_success_at",
            "last_error",
            "api_key",
            "key_hint",
            "channels",
            "assigned_machines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "protocol",
            "status",
            "capabilities",
            "source_metadata",
            "last_success_at",
            "last_error",
            "key_hint",
            "channels",
            "assigned_machines",
        ]

    def get_key_hint(self, obj):
        try:
            return obj.credential.key_hint
        except Exception:
            return ""

    def get_assigned_machines(self, obj):
        return sum(1 for channel in obj.channels.all() if hasattr(channel, "machine_binding"))

    def validate_factory(self, factory):
        if not factories_for_request(self.context["request"]).filter(pk=factory.pk).exists():
            raise serializers.ValidationError("Choose a factory available to this workspace.")
        return factory

    def validate_base_url(self, value):
        try:
            return validate_base_url(value)
        except StreamClientError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    @transaction.atomic
    def create(self, validated_data):
        api_key = validated_data.pop("api_key", None)
        if not api_key:
            raise serializers.ValidationError({"api_key": "An API key is required."})
        tenant = tenant_for_request(self.context["request"])
        stream = DataInputStream.objects.create(tenant=tenant, **validated_data)
        DataStreamCredential.objects.create(
            tenant=tenant,
            stream=stream,
            encrypted_secret=encrypt_secret(api_key),
            key_hint=api_key[-4:],
        )
        return stream

    @transaction.atomic
    def update(self, instance, validated_data):
        api_key = validated_data.pop("api_key", None)
        enabled_was_changed = (
            "enabled" in validated_data and validated_data["enabled"] != instance.enabled
        )
        instance = super().update(instance, validated_data)
        if enabled_was_changed:
            instance.status = "draft" if instance.enabled else "disabled"
            instance.save(update_fields=["status", "updated_at"])
        if api_key:
            DataStreamCredential.objects.update_or_create(
                stream=instance,
                defaults={
                    "tenant": instance.tenant,
                    "encrypted_secret": encrypt_secret(api_key),
                    "key_hint": api_key[-4:],
                    "revoked_at": None,
                    "rotated_at": timezone.now(),
                },
            )
        return instance


class MachineCycleOutcomeSerializer(serializers.ModelSerializer):
    overridden_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MachineCycleOutcome
        fields = [
            "id",
            "run_id",
            "cycle_id",
            "cycle_number",
            "source_label",
            "effective_label",
            "quality_score",
            "failure_mode",
            "sensor_data_quality",
            "overridden_at",
            "overridden_by_name",
            "override_note",
        ]

    def get_overridden_by_name(self, obj):
        user = obj.overridden_by
        if not user:
            return None
        return user.get_full_name() or user.get_username()


class MachineTelemetrySerializer(serializers.ModelSerializer):
    outcome = serializers.SerializerMethodField()

    def get_outcome(self, obj):
        outcome = self.context.get("outcomes", {}).get((obj.run_id, obj.cycle_id))
        return MachineCycleOutcomeSerializer(outcome).data if outcome else None

    class Meta:
        model = MachineTelemetrySample
        fields = [
            "id",
            "event_id",
            "observed_at",
            "received_at",
            "sequence_no",
            "run_id",
            "cycle_id",
            "cycle_number",
            "cycle_phase",
            "recipe_id",
            "schema_version",
            "values",
            "outcome",
        ]
