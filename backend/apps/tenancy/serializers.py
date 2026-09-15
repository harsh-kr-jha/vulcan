from datetime import date

from rest_framework import serializers

from apps.tenancy.models import Factory, FactoryMaster


class FactoryDetailsSerializer(serializers.Serializer):
    """Validated, unit-aware details used by setup and the digital twin."""

    factoryType = serializers.CharField(max_length=120, required=False, allow_blank=True)
    facilityAreaM2 = serializers.FloatField(min_value=0, required=False)
    ratedCapacityPerDay = serializers.FloatField(min_value=0, required=False)
    productionUnit = serializers.CharField(max_length=32, required=False, allow_blank=False)
    operatingHoursPerDay = serializers.FloatField(min_value=0, max_value=24, required=False)
    shiftsPerDay = serializers.IntegerField(min_value=1, max_value=24, required=False)
    powerCapacityKva = serializers.FloatField(min_value=0, required=False)
    energyUnit = serializers.ChoiceField(choices=["kWh", "MWh"], required=False)
    weightUnit = serializers.ChoiceField(
        choices=["g", "kg", "tonne", "tonnes", "lb"], required=False
    )
    temperatureUnit = serializers.ChoiceField(choices=["°C", "°F"], required=False)
    pressureUnit = serializers.ChoiceField(choices=["bar", "kPa", "MPa", "psi"], required=False)
    commissionedYear = serializers.IntegerField(
        min_value=1800, max_value=date.today().year, required=False
    )

    def validate(self, attrs):
        if ("ratedCapacityPerDay" in attrs) != ("productionUnit" in attrs):
            raise serializers.ValidationError(
                "Rated capacity and its production unit must be provided together."
            )
        return attrs


class FactorySerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = Factory
        fields = [
            "id",
            "name",
            "code",
            "company",
            "company_name",
            "timezone",
            "address",
            "is_active",
            "configuration",
        ]
        read_only_fields = ["id"]

    def validate_company(self, company):
        tenant = self.context["tenant"]
        if company.tenant_id != tenant.id:
            raise serializers.ValidationError("Company does not belong to the active tenant.")
        return company


class WorkspaceFactorySerializer(serializers.ModelSerializer):
    companyId = serializers.UUIDField(source="company_id", read_only=True)
    location = serializers.CharField(source="address", required=False, allow_blank=True)
    currency = serializers.SerializerMethodField()
    details = serializers.SerializerMethodField()
    recommendedRange = serializers.SerializerMethodField()

    class Meta:
        model = Factory
        fields = [
            "id",
            "companyId",
            "name",
            "code",
            "location",
            "timezone",
            "currency",
            "details",
            "recommendedRange",
        ]

    def get_currency(self, obj):
        return obj.configuration.get("currency", "INR")

    def get_details(self, obj):
        return obj.configuration.get("factoryDetails", {})

    def get_recommendedRange(self, obj):
        showcase = obj.configuration.get("showcase", {})
        value = showcase.get("recommendedRange") if isinstance(showcase, dict) else None
        if not isinstance(value, dict) or not value.get("from") or not value.get("to"):
            return None
        return {"from": str(value["from"]), "to": str(value["to"])}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if "details" not in self.initial_data:
            return attrs

        raw_details = self.initial_data.get("details")
        if raw_details is None:
            raw_details = {}
        if not isinstance(raw_details, dict):
            raise serializers.ValidationError({"details": "Factory details must be an object."})

        known_fields = set(FactoryDetailsSerializer().fields)
        unknown_fields = sorted(set(raw_details) - known_fields)
        if unknown_fields:
            raise serializers.ValidationError(
                {"details": f"Unsupported factory detail(s): {', '.join(unknown_fields)}."}
            )

        existing = self.instance.configuration.get("factoryDetails", {}) if self.instance else {}
        candidate = {**existing, **raw_details} if raw_details else {}
        details = FactoryDetailsSerializer(data=candidate)
        details.is_valid(raise_exception=True)
        self._validated_factory_details = details.validated_data
        return attrs

    def create(self, validated_data):
        configuration = {**validated_data.get("configuration", {})}
        if hasattr(self, "_validated_factory_details"):
            configuration["factoryDetails"] = self._validated_factory_details
        validated_data["configuration"] = configuration
        return super().create(validated_data)

    def update(self, instance, validated_data):
        currency = self.initial_data.get("currency")
        if currency:
            instance.configuration = {**instance.configuration, "currency": currency}
        if "details" in self.initial_data:
            instance.configuration = {
                **instance.configuration,
                "factoryDetails": getattr(self, "_validated_factory_details", {}),
            }
        return super().update(instance, validated_data)


class FactoryMasterSerializer(serializers.ModelSerializer):
    factoryId = serializers.UUIDField(source="factory_id", read_only=True)
    parentId = serializers.PrimaryKeyRelatedField(
        source="parent", queryset=FactoryMaster.objects.all(), required=False, allow_null=True
    )
    active = serializers.BooleanField(source="is_active", required=False)

    class Meta:
        model = FactoryMaster
        fields = ["id", "factoryId", "kind", "name", "code", "parentId", "metadata", "active"]
        read_only_fields = ["id", "factoryId"]

    def validate_parentId(self, parent):
        factory = self.context["factory"]
        if parent and parent.factory_id != factory.id:
            raise serializers.ValidationError("The parent must belong to the same factory.")
        if parent and not parent.is_active:
            raise serializers.ValidationError("Choose an active parent record.")
        return parent

    def validate(self, attrs):
        attrs = super().validate(attrs)
        kind = attrs.get("kind", self.instance.kind if self.instance else None)
        parent = attrs.get("parent", self.instance.parent if self.instance else None)
        metadata = attrs.get("metadata", self.instance.metadata if self.instance else {}) or {}
        if not isinstance(metadata, dict):
            raise serializers.ValidationError({"metadata": "Metadata must be an object."})

        if kind == FactoryMaster.Kind.MACHINE:
            if self.instance is None:
                raise serializers.ValidationError(
                    {"kind": "Machines are created in Lexicon, not Factory Setup."}
                )
            if parent is None or parent.kind != FactoryMaster.Kind.LINE:
                raise serializers.ValidationError(
                    {"parentId": "Every machine must belong to a production line."}
                )
            process_code = str(metadata.get("processCode", "")).strip()
            if process_code:
                process = FactoryMaster.objects.filter(
                    factory=self.context["factory"],
                    kind=FactoryMaster.Kind.PROCESS,
                    code__iexact=process_code,
                    is_active=True,
                ).first()
                if not process or process.parent_id != parent.id:
                    raise serializers.ValidationError(
                        {
                            "metadata": (
                                "The assigned process must be active and belong to "
                                "the machine's production line."
                            )
                        }
                    )
            return attrs

        if kind != FactoryMaster.Kind.PROCESS:
            return attrs
        if parent is None:
            raise serializers.ValidationError(
                {"parentId": "Every manufacturing process must belong to a production line."}
            )
        if parent.kind != FactoryMaster.Kind.LINE:
            raise serializers.ValidationError(
                {"parentId": "A manufacturing process can only belong to a production line."}
            )

        raw_sequence = metadata.get("sequence")
        try:
            sequence = int(raw_sequence)
        except (TypeError, ValueError) as exc:
            raise serializers.ValidationError(
                {"metadata": "Every manufacturing process needs a numeric sequence."}
            ) from exc
        if (
            isinstance(raw_sequence, bool)
            or sequence < 1
            or str(raw_sequence).strip() != str(sequence)
        ):
            raise serializers.ValidationError(
                {"metadata": "Process sequence must be a positive whole number."}
            )
        for unit_key, label in [("inputUnit", "input"), ("outputUnit", "output")]:
            if not str(metadata.get(unit_key, "")).strip():
                raise serializers.ValidationError(
                    {"metadata": f"Every process needs an {label} unit."}
                )
        for numeric_key in [
            "targetCycleMinutes",
            "targetPressureBar",
            "capacityPerHour",
        ]:
            value = metadata.get(numeric_key)
            if value in {None, ""}:
                continue
            try:
                if float(value) < 0:
                    raise ValueError
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError(
                    {"metadata": f"{numeric_key} must be zero or a positive number."}
                ) from exc

        factory = self.context["factory"]
        siblings = FactoryMaster.objects.filter(
            factory=factory,
            kind=FactoryMaster.Kind.PROCESS,
            parent=parent,
            is_active=True,
        )
        if self.instance:
            siblings = siblings.exclude(pk=self.instance.pk)
        for sibling in siblings.only("metadata"):
            try:
                sibling_sequence = int(sibling.metadata.get("sequence"))
            except (TypeError, ValueError):
                continue
            if sibling_sequence == sequence:
                raise serializers.ValidationError(
                    {"metadata": "Process sequence must be unique within its production line."}
                )

        attrs["metadata"] = {**metadata, "sequence": sequence}
        return attrs
