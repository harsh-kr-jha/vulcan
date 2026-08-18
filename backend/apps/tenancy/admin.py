from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin

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


class EmailIdentityInline(admin.StackedInline):
    model = EmailIdentity
    extra = 1
    max_num = 1
    can_delete = False
    fields = ("email",)


class MembershipInline(admin.StackedInline):
    model = Membership
    extra = 1
    fields = ("tenant", "role", "all_factories", "factories", "is_active")
    autocomplete_fields = ("tenant", "factories")


user_model = get_user_model()


class VulcanUserAdmin(UserAdmin):
    inlines = (EmailIdentityInline, MembershipInline)

    def save_formset(self, request, form, formset, change):
        super().save_formset(request, form, formset, change)
        if formset.model is EmailIdentity:
            identity = EmailIdentity.objects.filter(user=form.instance).first()
            if identity and form.instance.email != identity.email:
                form.instance.email = identity.email
                form.instance.save(update_fields=["email"])


def configure_vulcan_user_admin():
    """Replace the stock user screen after Django admin autodiscovery has completed."""

    registered_admin = admin.site._registry.get(user_model)
    if isinstance(registered_admin, VulcanUserAdmin):
        return
    if registered_admin is not None:
        admin.site.unregister(user_model)
    admin.site.register(user_model, VulcanUserAdmin)


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
