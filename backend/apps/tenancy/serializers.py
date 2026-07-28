from rest_framework import serializers

from apps.tenancy.models import Factory


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
