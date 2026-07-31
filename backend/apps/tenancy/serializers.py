from rest_framework import serializers

from apps.tenancy.models import Factory, FactoryMaster


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

    class Meta:
        model = Factory
        fields = ["id", "companyId", "name", "code", "location", "timezone", "currency"]

    def get_currency(self, obj):
        return obj.configuration.get("currency", "INR")

    def update(self, instance, validated_data):
        currency = self.initial_data.get("currency")
        if currency:
            instance.configuration = {**instance.configuration, "currency": currency}
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
        return parent
