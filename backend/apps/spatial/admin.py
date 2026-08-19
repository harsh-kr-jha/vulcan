from django.contrib import admin

from apps.spatial.models import (
    DispatchConfiguration,
    DispatchEvent,
    FactoryLayout,
    InventoryChange,
    InventoryConfiguration,
    MachineConnection,
    MachineCustomKpi,
    MachineObservation,
    MachineParameter,
    SpatialMachine,
)


class SpatialMachineInline(admin.TabularInline):
    model = SpatialMachine
    extra = 0
    fields = ("name", "position_x", "position_y", "status")
    readonly_fields = ("id",)


class MachineConnectionInline(admin.TabularInline):
    model = MachineConnection
    extra = 0
    fields = ("source", "target", "name", "material_type")
    readonly_fields = ("id",)


@admin.register(FactoryLayout)
class FactoryLayoutAdmin(admin.ModelAdmin):
    list_display = ("factory", "floor_width", "floor_height", "unit_system", "is_active")
    list_filter = ("unit_system", "is_active")
    search_fields = ("factory__name",)
    inlines = [SpatialMachineInline, MachineConnectionInline]


class MachineParameterInline(admin.TabularInline):
    model = MachineParameter
    extra = 0
    fields = ("key", "data_type", "required", "order")


class MachineCustomKpiInline(admin.TabularInline):
    model = MachineCustomKpi
    extra = 0
    fields = ("name", "display_unit", "formula")


@admin.register(SpatialMachine)
class SpatialMachineAdmin(admin.ModelAdmin):
    list_display = ("name", "layout", "position_x", "position_y", "status")
    list_filter = ("status",)
    search_fields = ("name",)
    inlines = [MachineParameterInline, MachineCustomKpiInline]


@admin.register(MachineConnection)
class MachineConnectionAdmin(admin.ModelAdmin):
    list_display = ("source", "target", "name", "material_type")
    search_fields = ("name", "source__name", "target__name")


@admin.register(MachineObservation)
class MachineObservationAdmin(admin.ModelAdmin):
    list_display = ("machine", "submitted_at", "submitted_by")
    list_filter = ("submitted_at",)
    readonly_fields = ("submitted_at",)


@admin.register(InventoryConfiguration)
class InventoryConfigurationAdmin(admin.ModelAdmin):
    list_display = ("layout", "storage_capacity", "capacity_unit")


@admin.register(InventoryChange)
class InventoryChangeAdmin(admin.ModelAdmin):
    list_display = ("inventory", "material_id", "direction", "quantity", "submitted_at")
    list_filter = ("direction", "submitted_at")
    readonly_fields = ("submitted_at",)


@admin.register(DispatchConfiguration)
class DispatchConfigurationAdmin(admin.ModelAdmin):
    list_display = ("layout",)


@admin.register(DispatchEvent)
class DispatchEventAdmin(admin.ModelAdmin):
    list_display = ("dispatch", "product_id", "event_type", "quantity", "unit", "submitted_at")
    list_filter = ("event_type", "submitted_at")
    readonly_fields = ("submitted_at",)
