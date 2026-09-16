"""Seed Mushroom Farm Digital Twin matching the layout sketch and comprehensive dummy data.

Layout Schema:
- Room 1, Room 2, Room 3, Room 4 (4 large growing rooms)
- Straw + Chicken manure Inventory, Drying, Pasturizer (3 prep units)
- Platform (large brown bottom-right block)
- Path (purple corridor connecting rooms to platform)
"""

import os
import django
from decimal import Decimal
from datetime import timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.tenancy.models import Factory, Tenant, FactoryMaster
from apps.spatial.models import (
    FactoryLayout,
    SpatialMachine,
    MachineParameter,
    MachineObservation,
    MachineConnection,
    InventoryConfiguration,
    InventoryChange,
    DispatchConfiguration,
    DispatchEvent,
    UnitSystem,
    MachineOperationalStatus,
    ParamDataType,
)
from apps.operations.models import Upload, StandardRecord

User = get_user_model()


def seed_twin():
    print("Beginning Mushroom Farm Twin seed...")

    tenant = Tenant.objects.first()
    if not tenant:
        raise RuntimeError("No tenant found!")
    
    factory = Factory.objects.filter(tenant=tenant).first()
    if not factory:
        factory = Factory.objects.first()
    print(f"Target Factory: '{factory.name}' ({factory.id}) in Tenant '{tenant.name}'")

    admin_user = User.objects.filter(is_superuser=True).first() or User.objects.first()

    # 1. Clear any existing spatial layouts for this factory
    existing_layouts = FactoryLayout.objects.filter(factory=factory)
    print(f"Cleaning {existing_layouts.count()} existing layouts...")
    existing_layouts.delete()

    # 2. Create FactoryLayout (50m wide x 16m high)
    layout = FactoryLayout.objects.create(
        tenant=tenant,
        factory=factory,
        floor_width=Decimal("50.0"),
        floor_height=Decimal("16.0"),
        unit_system=UnitSystem.METERS,
        is_active=True,
    )
    print(f"Created FactoryLayout: {layout.id} ({layout.floor_width}x{layout.floor_height} {layout.unit_system})")

    # 3. Create 9 Machines matching the layout sketch exactly
    # Room 1..4 (top left-center), Prep blocks (top right), Platform (bottom right), Path (bottom left corridor)
    machine_configs = [
        {
            "key": "room_1",
            "name": "Room 1",
            "x": 1,
            "y": 1,
            "w": 6,
            "h": 6,
            "status": MachineOperationalStatus.RUNNING,
            "order": 1,
            "inputs": [{"id": "trays_in", "label": "Phase II Cased Trays", "unitType": "trays"}],
            "outputs": [{"id": "flush1_out", "label": "Grade-A Button Harvest", "unitType": "kg"}],
            "params": [
                ("crop_stage", ParamDataType.SELECTION, ["Inoculation", "Spawn Run", "Pinning", "Flush 1 Harvesting", "Flush 2 Harvesting", "Cookout"]),
                ("temperature", ParamDataType.NUMBER, []),
                ("humidity", ParamDataType.NUMBER, []),
                ("co2_ppm", ParamDataType.NUMBER, []),
                ("compost_temp", ParamDataType.NUMBER, []),
                ("air_velocity", ParamDataType.NUMBER, []),
                ("active", ParamDataType.BOOLEAN, []),
            ],
            "live_values": {
                "crop_stage": "Flush 1 Harvesting",
                "temperature": 18.2,
                "humidity": 89.5,
                "co2_ppm": 1150,
                "compost_temp": 20.1,
                "air_velocity": 0.25,
                "active": True,
            },
        },
        {
            "key": "room_2",
            "name": "Room 2",
            "x": 9,
            "y": 1,
            "w": 6,
            "h": 6,
            "status": MachineOperationalStatus.RUNNING,
            "order": 2,
            "inputs": [{"id": "trays_in", "label": "Phase II Cased Trays", "unitType": "trays"}],
            "outputs": [{"id": "flush2_out", "label": "Cremini / Brown Harvest", "unitType": "kg"}],
            "params": [
                ("crop_stage", ParamDataType.SELECTION, ["Inoculation", "Spawn Run", "Pinning", "Flush 1 Harvesting", "Flush 2 Harvesting", "Cookout"]),
                ("temperature", ParamDataType.NUMBER, []),
                ("humidity", ParamDataType.NUMBER, []),
                ("co2_ppm", ParamDataType.NUMBER, []),
                ("compost_temp", ParamDataType.NUMBER, []),
                ("air_velocity", ParamDataType.NUMBER, []),
                ("active", ParamDataType.BOOLEAN, []),
            ],
            "live_values": {
                "crop_stage": "Flush 2 Harvesting",
                "temperature": 17.8,
                "humidity": 91.2,
                "co2_ppm": 1280,
                "compost_temp": 19.8,
                "air_velocity": 0.22,
                "active": True,
            },
        },
        {
            "key": "room_3",
            "name": "Room 3",
            "x": 17,
            "y": 1,
            "w": 6,
            "h": 6,
            "status": MachineOperationalStatus.WARNING,
            "order": 3,
            "inputs": [{"id": "trays_in", "label": "Phase II Spawned Trays", "unitType": "trays"}],
            "outputs": [{"id": "pin_out", "label": "Developing Primordia", "unitType": "trays"}],
            "params": [
                ("crop_stage", ParamDataType.SELECTION, ["Inoculation", "Spawn Run", "Pinning", "Flush 1 Harvesting", "Flush 2 Harvesting", "Cookout"]),
                ("temperature", ParamDataType.NUMBER, []),
                ("humidity", ParamDataType.NUMBER, []),
                ("co2_ppm", ParamDataType.NUMBER, []),
                ("compost_temp", ParamDataType.NUMBER, []),
                ("air_velocity", ParamDataType.NUMBER, []),
                ("active", ParamDataType.BOOLEAN, []),
            ],
            "live_values": {
                "crop_stage": "Pinning",
                "temperature": 19.6,  # elevated temp causing warning
                "humidity": 86.4,
                "co2_ppm": 1420,
                "compost_temp": 22.3,
                "air_velocity": 0.18,
                "active": True,
            },
        },
        {
            "key": "room_4",
            "name": "Room 4",
            "x": 25,
            "y": 1,
            "w": 6,
            "h": 6,
            "status": MachineOperationalStatus.RUNNING,
            "order": 4,
            "inputs": [{"id": "compost_in", "label": "Pasteurized Substrate", "unitType": "tons"}],
            "outputs": [{"id": "mycelium_out", "label": "Colonized Mycelium Beds", "unitType": "m2"}],
            "params": [
                ("crop_stage", ParamDataType.SELECTION, ["Inoculation", "Spawn Run", "Pinning", "Flush 1 Harvesting", "Flush 2 Harvesting", "Cookout"]),
                ("temperature", ParamDataType.NUMBER, []),
                ("humidity", ParamDataType.NUMBER, []),
                ("co2_ppm", ParamDataType.NUMBER, []),
                ("compost_temp", ParamDataType.NUMBER, []),
                ("air_velocity", ParamDataType.NUMBER, []),
                ("active", ParamDataType.BOOLEAN, []),
            ],
            "live_values": {
                "crop_stage": "Spawn Run",
                "temperature": 24.0,
                "humidity": 94.5,
                "co2_ppm": 4200,
                "compost_temp": 25.2,
                "air_velocity": 0.15,
                "active": True,
            },
        },
        {
            "key": "straw_manure",
            "name": "Straw + Chicken manure Inventory",
            "x": 33,
            "y": 1,
            "w": 4,
            "h": 4,
            "status": MachineOperationalStatus.RUNNING,
            "order": 5,
            "inputs": [
                {"id": "raw_straw", "label": "Wheat Straw Bales", "unitType": "bales"},
                {"id": "raw_manure", "label": "Organic Poultry Manure", "unitType": "tons"},
            ],
            "outputs": [{"id": "pre_mix", "label": "Conditioned Mix", "unitType": "tons"}],
            "params": [
                ("straw_bales_stock", ParamDataType.NUMBER, []),
                ("manure_moisture_pct", ParamDataType.NUMBER, []),
                ("pile_temp", ParamDataType.NUMBER, []),
                ("ph_level", ParamDataType.NUMBER, []),
                ("nitrogen_pct", ParamDataType.NUMBER, []),
                ("active", ParamDataType.BOOLEAN, []),
            ],
            "live_values": {
                "straw_bales_stock": 420,
                "manure_moisture_pct": 42.5,
                "pile_temp": 48.0,
                "ph_level": 7.4,
                "nitrogen_pct": 3.6,
                "active": True,
            },
        },
        {
            "key": "drying",
            "name": "Drying",
            "x": 39,
            "y": 1,
            "w": 4,
            "h": 4,
            "status": MachineOperationalStatus.RUNNING,
            "order": 6,
            "inputs": [{"id": "fresh_culled", "label": "Fresh Culled Mushrooms", "unitType": "kg"}],
            "outputs": [{"id": "dried_slices", "label": "Dried Mushroom Slices", "unitType": "kg"}],
            "params": [
                ("dryer_temp", ParamDataType.NUMBER, []),
                ("air_circulation_pct", ParamDataType.NUMBER, []),
                ("moisture_out", ParamDataType.NUMBER, []),
                ("batch_weight_kg", ParamDataType.NUMBER, []),
                ("cycle_time_hrs", ParamDataType.NUMBER, []),
                ("active", ParamDataType.BOOLEAN, []),
            ],
            "live_values": {
                "dryer_temp": 58.5,
                "air_circulation_pct": 75.0,
                "moisture_out": 11.8,
                "batch_weight_kg": 850,
                "cycle_time_hrs": 6.5,
                "active": True,
            },
        },
        {
            "key": "pasturizer",
            "name": "Pasturizer",
            "x": 44,
            "y": 1,
            "w": 4,
            "h": 4,
            "status": MachineOperationalStatus.RUNNING,
            "order": 7,
            "inputs": [{"id": "phase1_compost", "label": "Phase I Compost", "unitType": "tons"}],
            "outputs": [{"id": "phase2_compost", "label": "Phase II Pasteurized Substrate", "unitType": "tons"}],
            "params": [
                ("steam_temp", ParamDataType.NUMBER, []),
                ("tunnel_pressure_kpa", ParamDataType.NUMBER, []),
                ("conditioning_temp", ParamDataType.NUMBER, []),
                ("ammonia_ppm", ParamDataType.NUMBER, []),
                ("compost_core_temp", ParamDataType.NUMBER, []),
                ("cycle_status", ParamDataType.SELECTION, ["Heating", "Pasteurizing", "Conditioning", "Cooling"]),
                ("active", ParamDataType.BOOLEAN, []),
            ],
            "live_values": {
                "steam_temp": 60.2,
                "tunnel_pressure_kpa": 104.5,
                "conditioning_temp": 48.0,
                "ammonia_ppm": 8.5,
                "compost_core_temp": 59.8,
                "cycle_status": "Conditioning",
                "active": True,
            },
        },
        {
            "key": "path",
            "name": "Path",
            "x": 1,
            "y": 8,
            "w": 32,
            "h": 4,
            "status": MachineOperationalStatus.RUNNING,
            "order": 8,
            "inputs": [{"id": "room_crates", "label": "Harvest Crates in Transit", "unitType": "crates"}],
            "outputs": [{"id": "platform_in", "label": "Dock Inflow", "unitType": "crates"}],
            "params": [
                ("ambient_temp", ParamDataType.NUMBER, []),
                ("air_pressure_pa", ParamDataType.NUMBER, []),
                ("traffic_status", ParamDataType.SELECTION, ["Clear", "Harvest Transfer", "Spawn Transit", "Substrate Loading"]),
                ("forklift_active", ParamDataType.BOOLEAN, []),
                ("sanitation_status", ParamDataType.SELECTION, ["Clean", "Sanitizing", "Pending"]),
                ("active", ParamDataType.BOOLEAN, []),
            ],
            "live_values": {
                "ambient_temp": 19.2,
                "air_pressure_pa": 28.0,
                "traffic_status": "Harvest Transfer",
                "forklift_active": True,
                "sanitation_status": "Clean",
                "active": True,
            },
        },
        {
            "key": "platform",
            "name": "Platform",
            "x": 33,
            "y": 6,
            "w": 15,
            "h": 8,
            "status": MachineOperationalStatus.RUNNING,
            "order": 9,
            "inputs": [
                {"id": "packed_crates", "label": "Graded Cold Crates", "unitType": "crates"},
                {"id": "dried_boxes", "label": "Cartons Dried Slices", "unitType": "cartons"},
            ],
            "outputs": [{"id": "reefer_shipments", "label": "Reefer Pallets", "unitType": "pallets"}],
            "params": [
                ("platform_temp", ParamDataType.NUMBER, []),
                ("dock_humidity", ParamDataType.NUMBER, []),
                ("pallet_loading_bays", ParamDataType.NUMBER, []),
                ("turnaround_time_mins", ParamDataType.NUMBER, []),
                ("dispatch_readiness", ParamDataType.SELECTION, ["Ready", "Staging", "Inspecting"]),
                ("active", ParamDataType.BOOLEAN, []),
            ],
            "live_values": {
                "platform_temp": 8.5,
                "dock_humidity": 78.0,
                "pallet_loading_bays": 4,
                "turnaround_time_mins": 22.5,
                "dispatch_readiness": "Ready",
                "active": True,
            },
        },
    ]

    machine_objects = {}
    now = timezone.now()

    for mc in machine_configs:
        machine = SpatialMachine.objects.create(
            tenant=tenant,
            layout=layout,
            name=mc["name"],
            position_x=mc["x"],
            position_y=mc["y"],
            size_width=mc["w"],
            size_height=mc["h"],
            inputs=mc["inputs"],
            outputs=mc["outputs"],
            status=mc["status"],
            display_order=mc["order"],
        )
        machine_objects[mc["key"]] = machine
        print(f"Created Machine: '{machine.name}' at ({machine.position_x}, {machine.position_y}) size {machine.size_width}x{machine.size_height}")

        # Parameters
        for p_idx, (p_key, p_type, p_options) in enumerate(mc["params"]):
            MachineParameter.objects.create(
                machine=machine,
                key=p_key,
                data_type=p_type,
                options=p_options,
                required=True,
                order=p_idx + 1,
            )

        # Create historical observations (8 observations over recent hours)
        base_vals = mc["live_values"]
        for obs_i in range(8):
            staggered_time = now - timedelta(hours=(7 - obs_i) * 0.5) - timedelta(minutes=5)
            # Add slight realistic drift for history
            obs_vals = dict(base_vals)
            if "temperature" in obs_vals and isinstance(obs_vals["temperature"], (int, float)):
                obs_vals["temperature"] = round(float(obs_vals["temperature"]) + (obs_i - 4) * 0.1, 1)
            if "humidity" in obs_vals and isinstance(obs_vals["humidity"], (int, float)):
                obs_vals["humidity"] = round(float(obs_vals["humidity"]) + (obs_i - 4) * 0.2, 1)
            if "co2_ppm" in obs_vals and isinstance(obs_vals["co2_ppm"], (int, float)):
                obs_vals["co2_ppm"] = int(obs_vals["co2_ppm"] + (obs_i - 4) * 15)

            obs = MachineObservation.objects.create(
                tenant=tenant,
                machine=machine,
                values=obs_vals if obs_i < 7 else base_vals,
                submitted_by=admin_user,
            )
            # Update submitted_at to staggered timestamp
            MachineObservation.objects.filter(id=obs.id).update(submitted_at=staggered_time)

    # 4. Create Material Flow Connections
    connections_data = [
        ("straw_manure", "platform", "Raw prep wetting to staging platform", "Conditioned Straw & Manure", Decimal("15.5")),
        ("platform", "pasturizer", "Bulk transfer to pasteurization tunnel", "Phase I Substrate Mix", Decimal("14.0")),
        ("pasturizer", "path", "Pasteurized compost out to transit path", "Phase II Clean Substrate", Decimal("12.5")),
        ("path", "room_1", "Trays loaded into Room 1", "Cased Compost Trays", Decimal("80.0")),
        ("path", "room_2", "Trays loaded into Room 2", "Cased Compost Trays", Decimal("80.0")),
        ("path", "room_3", "Trays loaded into Room 3", "Spawned Substrate Trays", Decimal("80.0")),
        ("path", "room_4", "Substrate filled into Room 4", "Phase II Bulk Compost", Decimal("12.0")),
        ("room_1", "path", "Flush 1 Button harvest crates", "Fresh White Button", Decimal("450.0")),
        ("room_2", "path", "Flush 2 Cremini harvest crates", "Fresh Brown Cremini", Decimal("380.0")),
        ("room_3", "path", "Portobello harvest crates", "Fresh Jumbo Portobello", Decimal("290.0")),
        ("path", "platform", "Central path delivery to cold dock platform", "Harvested Mushroom Crates", Decimal("1120.0")),
        ("platform", "drying", "Oversized/cull mushroom delivery to dryer", "Cull Fresh Mushrooms", Decimal("220.0")),
        ("drying", "platform", "Dried sliced product to dispatch platform", "Dried Sliced Mushrooms", Decimal("28.0")),
    ]

    for src_key, tgt_key, name, mat_type, qty in connections_data:
        MachineConnection.objects.create(
            tenant=tenant,
            layout=layout,
            source=machine_objects[src_key],
            target=machine_objects[tgt_key],
            name=name,
            description=name,
            material_type=mat_type,
            quantity_per_cycle=qty,
        )
    print(f"Created {len(connections_data)} MachineConnections.")

    # 5. Create Inventory Configuration & Changes
    inv_materials = [
        {"id": "mat_straw", "name": "Wheat Straw (Golden Bales)", "unit": "kilograms", "quantity": 32000},
        {"id": "mat_manure", "name": "Broiler Chicken Manure (Organic)", "unit": "kilograms", "quantity": 18500},
        {"id": "mat_gypsum", "name": "Agricultural Gypsum (CaSO4)", "unit": "kilograms", "quantity": 6200},
        {"id": "mat_spawn", "name": "Grain Spawn (Agaricus bisporus A15)", "unit": "kilograms", "quantity": 1850},
        {"id": "mat_casing", "name": "Sphagnum Peat Moss Casing Soil", "unit": "kilograms", "quantity": 14000},
        {"id": "mat_lime", "name": "Sugar Beet Lime (pH Buffer)", "unit": "kilograms", "quantity": 4500},
    ]

    inv = InventoryConfiguration.objects.create(
        tenant=tenant,
        layout=layout,
        storage_capacity=120000,
        capacity_unit="kilograms",
        materials=inv_materials,
    )
    print(f"Created InventoryConfiguration: {inv.id} (capacity {inv.storage_capacity} kg)")

    inv_changes = [
        ("mat_straw", "inbound", Decimal("10000.0"), timedelta(hours=36)),
        ("mat_straw", "outbound", Decimal("4500.0"), timedelta(hours=22)),
        ("mat_manure", "inbound", Decimal("6000.0"), timedelta(hours=30)),
        ("mat_manure", "outbound", Decimal("2800.0"), timedelta(hours=18)),
        ("mat_gypsum", "inbound", Decimal("2000.0"), timedelta(hours=26)),
        ("mat_gypsum", "outbound", Decimal("600.0"), timedelta(hours=14)),
        ("mat_spawn", "inbound", Decimal("500.0"), timedelta(hours=20)),
        ("mat_spawn", "outbound", Decimal("250.0"), timedelta(hours=8)),
        ("mat_casing", "inbound", Decimal("4000.0"), timedelta(hours=16)),
        ("mat_casing", "outbound", Decimal("1200.0"), timedelta(hours=6)),
        ("mat_lime", "inbound", Decimal("1500.0"), timedelta(hours=12)),
        ("mat_straw", "outbound", Decimal("3200.0"), timedelta(hours=2)),
    ]

    for mat_id, direction, qty, td in inv_changes:
        chg = InventoryChange.objects.create(
            tenant=tenant,
            inventory=inv,
            material_id=mat_id,
            direction=direction,
            quantity=qty,
            submitted_by=admin_user,
        )
        InventoryChange.objects.filter(id=chg.id).update(submitted_at=now - td)

    print(f"Created {len(inv_changes)} InventoryChanges.")

    # 6. Create Dispatch Configuration & Events
    disp_products = [
        {"id": "prod_button_a", "name": "Fresh White Button Mushrooms (Grade A)", "unit": "kilograms", "awaitingQuantity": 4200},
        {"id": "prod_cremini", "name": "Brown Cremini Mushrooms (Premium Pack)", "unit": "kilograms", "awaitingQuantity": 2850},
        {"id": "prod_portobello", "name": "Jumbo Portobello Mushroom Caps", "unit": "kilograms", "awaitingQuantity": 1650},
        {"id": "prod_dried", "name": "Dehydrated Button Slices (Bulk Bags)", "unit": "kilograms", "awaitingQuantity": 980},
        {"id": "prod_spent_compost", "name": "Spent Mushroom Substrate (SMS Soil Enricher)", "unit": "kilograms", "awaitingQuantity": 8500},
    ]

    disp = DispatchConfiguration.objects.create(
        tenant=tenant,
        layout=layout,
        products=disp_products,
    )
    print(f"Created DispatchConfiguration: {disp.id}")

    disp_events = [
        ("prod_button_a", "arrival", Decimal("6000.0"), "kilograms", timedelta(hours=34)),
        ("prod_button_a", "dispatched", Decimal("3800.0"), "kilograms", timedelta(hours=24)),
        ("prod_button_a", "arrival", Decimal("2000.0"), "kilograms", timedelta(hours=10)),
        ("prod_cremini", "arrival", Decimal("4500.0"), "kilograms", timedelta(hours=30)),
        ("prod_cremini", "dispatched", Decimal("2500.0"), "kilograms", timedelta(hours=18)),
        ("prod_cremini", "arrival", Decimal("850.0"), "kilograms", timedelta(hours=6)),
        ("prod_portobello", "arrival", Decimal("2400.0"), "kilograms", timedelta(hours=28)),
        ("prod_portobello", "dispatched", Decimal("1200.0"), "kilograms", timedelta(hours=14)),
        ("prod_portobello", "arrival", Decimal("450.0"), "kilograms", timedelta(hours=4)),
        ("prod_dried", "arrival", Decimal("1500.0"), "kilograms", timedelta(hours=40)),
        ("prod_dried", "dispatched", Decimal("600.0"), "kilograms", timedelta(hours=20)),
        ("prod_dried", "arrival", Decimal("80.0"), "kilograms", timedelta(hours=3)),
        ("prod_spent_compost", "arrival", Decimal("14000.0"), "kilograms", timedelta(hours=48)),
        ("prod_spent_compost", "dispatched", Decimal("7000.0"), "kilograms", timedelta(hours=16)),
        ("prod_spent_compost", "arrival", Decimal("1500.0"), "kilograms", timedelta(hours=1)),
    ]

    for prod_id, event_type, qty, unit, td in disp_events:
        evt = DispatchEvent.objects.create(
            tenant=tenant,
            dispatch=disp,
            product_id=prod_id,
            event_type=event_type,
            quantity=qty,
            unit=unit,
            submitted_by=admin_user,
        )
        DispatchEvent.objects.filter(id=evt.id).update(submitted_at=now - td)

    print(f"Created {len(disp_events)} DispatchEvents.")

    # 7. Sync FactoryMaster & StandardRecord for Performance / Operations
    print("Syncing FactoryMaster records...")
    # Lines
    line_obj, _ = FactoryMaster.objects.get_or_create(
        tenant=tenant, factory=factory, kind=FactoryMaster.Kind.LINE, code="WING-A",
        defaults={"name": "Growing Wing A", "is_active": True}
    )
    # Processes
    process_names = [
        ("COMPOST-PREP", "Compost Preparation"),
        ("PASTEUR", "Pasteurisation & Conditioning"),
        ("SPAWN-RUN", "Spawn Run"),
        ("PINNING", "Pinning"),
        ("CROP-FLUSH1", "Harvest Flush 1"),
        ("CROP-FLUSH2", "Harvest Flush 2"),
        ("DRYING", "Mushroom Dehydration"),
        ("PLATFORM-DISP", "Platform & Cold Dispatch"),
    ]
    for p_code, p_name in process_names:
        FactoryMaster.objects.update_or_create(
            tenant=tenant, factory=factory, kind=FactoryMaster.Kind.PROCESS, code=p_code,
            defaults={"name": p_name, "is_active": True}
        )
    # Machines
    machine_masters = [
        ("ROOM-1", "Room 1"),
        ("ROOM-2", "Room 2"),
        ("ROOM-3", "Room 3"),
        ("ROOM-4", "Room 4"),
        ("STRAW-MANURE-INV", "Straw + Chicken manure Inventory"),
        ("DRYING-UNIT", "Drying"),
        ("PASTURIZER-01", "Pasturizer"),
        ("PATH-01", "Path"),
        ("PLATFORM-01", "Platform"),
    ]
    for m_code, m_name in machine_masters:
        FactoryMaster.objects.update_or_create(
            tenant=tenant, factory=factory, kind=FactoryMaster.Kind.MACHINE, code=m_code,
            defaults={"name": m_name, "is_active": True}
        )
    # SKUs
    skus = [
        ("SKU-BUTTON-A", "Fresh White Button Mushrooms (Grade A)"),
        ("SKU-CREMINI", "Brown Cremini Mushrooms"),
        ("SKU-PORTOBELLO", "Jumbo Portobello Mushrooms"),
        ("SKU-DRIED-SLICES", "Dehydrated Button Slices"),
    ]
    for s_code, s_name in skus:
        FactoryMaster.objects.update_or_create(
            tenant=tenant, factory=factory, kind=FactoryMaster.Kind.SKU, code=s_code,
            defaults={"name": s_name, "is_active": True}
        )

    # 8. Create an Upload container and StandardRecords for Performance Explorer
    print("Creating StandardRecord operational dataset...")
    upload, _ = Upload.objects.get_or_create(
        tenant=tenant,
        factory=factory,
        dataset_type="process",
        original_filename="mushroom_twin_telemetry_live.csv",
        defaults={
            "file_type": "csv",
            "uploaded_by": admin_user,
            "template_code": "process",
            "template_version": "1.0",
            "record_count": 50,
            "status": "COMPLETED",
        },
    )

    # Populate process records for Room 1..4 for each day of the last 7 days
    start_date = (now - timedelta(days=6)).date()
    row_counter = 1

    # Clear previous twin upload records if any
    StandardRecord.objects.filter(upload=upload).delete()

    for day_i in range(7):
        current_date = start_date + timedelta(days=day_i)
        room_data = [
            ("Room 1", "Growing Wing A", "Harvest Flush 1", "BATCH-R1-2026", 18.2, 89.5, 1150, 68.5, 340, "running"),
            ("Room 2", "Growing Wing A", "Harvest Flush 2", "BATCH-R2-2026", 17.8, 91.2, 1280, 69.2, 380, "running"),
            ("Room 3", "Growing Wing A", "Pinning", "BATCH-R3-2026", 19.6, 86.4, 1420, 67.0, 410, "warning"),
            ("Room 4", "Growing Wing A", "Spawn Run", "BATCH-R4-2026", 24.0, 94.5, 4200, 71.0, 150, "running"),
        ]
        for r_name, line_name, proc_name, batch, temp, hum, co2, moist, water, st in room_data:
            StandardRecord.objects.create(
                tenant=tenant,
                upload=upload,
                factory=factory,
                dataset_type="process",
                source_row=row_counter,
                operational_date=current_date,
                line=line_name,
                machine=r_name,
                sku="",
                shift="Morning Shift",
                values={
                    "date": current_date.isoformat(),
                    "line": line_name,
                    "process": proc_name,
                    "machine": r_name,
                    "batch_id": batch,
                    "temperature_c": temp,
                    "humidity_pct": hum,
                    "co2_ppm": co2,
                    "substrate_moisture_pct": moist,
                    "water_litres": water,
                    "status": st,
                },
            )
            row_counter += 1

    # Production (harvest) records
    prod_upload, _ = Upload.objects.get_or_create(
        tenant=tenant,
        factory=factory,
        dataset_type="production",
        original_filename="mushroom_harvest_log.csv",
        defaults={
            "file_type": "csv",
            "uploaded_by": admin_user,
            "template_code": "production",
            "template_version": "1.0",
            "record_count": 30,
            "status": "COMPLETED",
        },
    )
    StandardRecord.objects.filter(upload=prod_upload).delete()
    prod_row = 1
    for day_i in range(7):
        current_date = start_date + timedelta(days=day_i)
        harvests = [
            ("Room 1", "SKU-BUTTON-A", 480, 465, 450, 15),
            ("Room 2", "SKU-CREMINI", 390, 382, 370, 12),
            ("Room 3", "SKU-PORTOBELLO", 310, 295, 285, 10),
        ]
        for r_name, sku_code, planned, actual, good, rej in harvests:
            StandardRecord.objects.create(
                tenant=tenant,
                upload=prod_upload,
                factory=factory,
                dataset_type="production",
                source_row=prod_row,
                operational_date=current_date,
                line="Growing Wing A",
                machine=r_name,
                sku=sku_code,
                shift="Morning Shift",
                values={
                    "date": current_date.isoformat(),
                    "line": "Growing Wing A",
                    "machine": r_name,
                    "sku": sku_code,
                    "planned_quantity": planned,
                    "actual_quantity": actual,
                    "good_quantity": good,
                    "rejected_quantity": rej,
                    "unit": "kg",
                },
            )
            prod_row += 1

    print("Finished seeding Mushroom Farm Twin successfully!")


if __name__ == "__main__":
    seed_twin()
