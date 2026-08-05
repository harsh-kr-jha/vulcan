from django.contrib import admin

from .models import (
    Company,
    EmailIdentity,
    Factory,
    FactoryMaster,
    Machine,
    Membership,
    ProductionLine,
    Tenant,
)


@admin.register(EmailIdentity)
class EmailIdentityAdmin(admin.ModelAdmin):
    list_display = ("email", "user", "updated_at")
    search_fields = ("email", "user__username")
    autocomplete_fields = ("user",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "created_at", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "legal_name", "is_active", "updated_at")
    list_filter = ("is_active", "tenant")
    search_fields = ("name", "legal_name", "tenant__name")
    autocomplete_fields = ("tenant",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Factory)
class FactoryAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "company", "tenant", "timezone", "is_active")
    list_filter = ("is_active", "tenant", "company")
    search_fields = ("name", "code", "company__name", "tenant__name")
    autocomplete_fields = ("tenant", "company")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "tenant", "role", "all_factories", "is_active")
    list_filter = ("role", "all_factories", "is_active", "tenant")
    search_fields = ("user__username", "user__email", "tenant__name")
    autocomplete_fields = ("user", "tenant", "factories")
    filter_horizontal = ("factories",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ProductionLine)
class ProductionLineAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "factory", "tenant", "is_active")
    list_filter = ("is_active", "tenant", "factory")
    search_fields = ("name", "code", "factory__name")
    autocomplete_fields = ("tenant", "factory")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "line", "factory", "tenant", "is_active")
    list_filter = ("is_active", "tenant", "factory", "line")
    search_fields = ("name", "code", "line__name", "factory__name")
    autocomplete_fields = ("tenant", "factory", "line")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(FactoryMaster)
class FactoryMasterAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "kind", "factory", "tenant", "parent", "is_active")
    list_filter = ("kind", "is_active", "tenant", "factory")
    search_fields = ("name", "code", "factory__name")
    autocomplete_fields = ("tenant", "factory", "parent")
    readonly_fields = ("id", "created_at", "updated_at")
