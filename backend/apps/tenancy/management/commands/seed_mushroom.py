from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.operations.imports import record_date
from apps.operations.models import StandardRecord, Upload
from apps.tenancy.models import Factory, FactoryMaster
from apps.tenancy.services import get_workspace_identity


class Command(BaseCommand):
    help = "Create or refresh the Musroom cultivation-intelligence showcase factory."

    def handle(self, *args, **options):
        identity = get_workspace_identity()
        identity.company.name = "Musroom Cultivation Labs"
        identity.company.legal_name = "Musroom Cultivation Labs Pvt. Ltd."
        identity.company.save(update_fields=["name", "legal_name", "updated_at"])

        factory, _ = Factory.objects.get_or_create(
            tenant=identity.tenant,
            code="MUSROOM-01",
            defaults={
                "company": identity.company,
                "name": "Musroom",
                "address": "Sonipat, Haryana, India",
                "timezone": "Asia/Kolkata",
            },
        )
        factory.name = "Musroom"
        factory.company = identity.company
        factory.address = "Sonipat, Haryana, India"
        factory.timezone = "Asia/Kolkata"
        factory.configuration = {
            **factory.configuration,
            "currency": "INR",
            "industry": "Button mushroom cultivation",
            "factoryDetails": {
                "factoryType": "Climate-controlled button mushroom farm",
                "facilityAreaM2": 6400,
                "ratedCapacityPerDay": 1800,
                "productionUnit": "kg mushrooms",
                "operatingHoursPerDay": 24,
                "shiftsPerDay": 3,
                "powerCapacityKva": 900,
                "energyUnit": "kWh",
                "weightUnit": "kg",
                "temperatureUnit": "°C",
                "pressureUnit": "bar",
                "commissionedYear": 2024,
            },
            "targets": {
                "oee": 0,
                "availability": 95,
                "performance": 95,
                "quality": 96,
                "planAttainment": 92,
                "rejectionRate": 2,
                "supplierScore": 85,
                "stockCoverDays": 7,
                "downtimeMinutes": 45,
                "downtimeUnit": "minutes",
                "biologicalEfficiency": 90,
                "saleableYield": 94,
                "contaminationRate": 2,
                "environmentCompliance": 92,
                "waterProductivity": 1100,
            },
            "customKpis": [],
        }
        factory.save()

        wing = self.master(
            identity,
            factory,
            "lines",
            "Growing Wing A",
            "WING-A",
            metadata={"sequence": 1, "rooms": 4},
        )
        compost_line = self.master(
            identity,
            factory,
            "lines",
            "Compost & Casing Line",
            "COMPOST",
            metadata={"sequence": 2},
        )

        process_specs = [
            {
                "name": "Compost Preparation",
                "code": "COMPOST-PREP",
                "line": compost_line,
                "type": "substrate",
                "description": "Pre-wet, mix and turn straw, manure and supplements.",
                "input": "kg dry materials",
                "output": "kg compost",
                "days": 12,
                "temperature": (55, 72),
                "humidity": (60, 80),
                "co2": 12000,
                "machines": [("Compost Yard", "COMPOST-YARD", 42)],
            },
            {
                "name": "Pasteurisation & Conditioning",
                "code": "PASTEUR",
                "line": compost_line,
                "type": "pasteurisation",
                "description": "Pasteurise compost and condition ammonia before spawning.",
                "input": "kg compost",
                "output": "kg conditioned compost",
                "days": 7,
                "temperature": (45, 60),
                "humidity": (70, 95),
                "co2": 10000,
                "machines": [("Pasteurisation Tunnel 1", "TUNNEL-01", 75)],
            },
            {
                "name": "Spawning",
                "code": "SPAWN",
                "line": compost_line,
                "type": "inoculation",
                "description": "Blend mushroom spawn into conditioned compost and fill beds.",
                "input": "kg conditioned compost",
                "output": "kg spawned compost",
                "days": 1,
                "temperature": (22, 25),
                "humidity": (80, 92),
                "co2": 5000,
                "machines": [("Spawning & Filling Line", "SPAWN-LINE", 36)],
            },
            {
                "name": "Spawn Run",
                "code": "SPAWN-RUN",
                "line": wing,
                "type": "incubation",
                "description": "Colonise compost under warm, high-CO2 room conditions.",
                "input": "kg spawned compost",
                "output": "kg colonised compost",
                "days": 14,
                "temperature": (23, 25),
                "humidity": (88, 95),
                "co2": 5000,
                "machines": [("Spawn Run Room", "SPAWN-ROOM", 28)],
            },
            {
                "name": "Casing",
                "code": "CASING",
                "line": wing,
                "type": "casing",
                "description": "Apply and irrigate pasteurised casing soil over colonised compost.",
                "input": "kg colonised compost",
                "output": "kg cased beds",
                "days": 7,
                "temperature": (21, 24),
                "humidity": (90, 96),
                "co2": 3500,
                "machines": [("Casing Preparation Room", "CASING-ROOM", 18)],
            },
            {
                "name": "Pinning",
                "code": "PINNING",
                "line": wing,
                "type": "pinning",
                "description": "Induce pin formation through temperature and fresh-air control.",
                "input": "kg cased beds",
                "output": "kg pinned beds",
                "days": 8,
                "temperature": (16, 19),
                "humidity": (88, 94),
                "co2": 1400,
                "machines": [("Pinning Room", "PINNING-ROOM", 32)],
            },
            {
                "name": "Cropping & Harvest",
                "code": "CROP",
                "line": wing,
                "type": "cropping",
                "description": "Maintain crop climate, irrigate and harvest successive flushes.",
                "input": "kg crop beds",
                "output": "kg mushrooms",
                "days": 21,
                "temperature": (16, 19),
                "humidity": (85, 92),
                "co2": 1200,
                "machines": [
                    ("Growing Room 1", "GR-01", 24),
                    ("Growing Room 2", "GR-02", 24),
                    ("Growing Room 3", "GR-03", 24),
                    ("Growing Room 4", "GR-04", 24),
                ],
            },
            {
                "name": "Packing & Cold Room",
                "code": "PACK",
                "line": wing,
                "type": "packing",
                "description": "Grade, pack, label and chill saleable mushrooms.",
                "input": "kg harvested mushrooms",
                "output": "kg packed mushrooms",
                "days": 1,
                "temperature": (2, 5),
                "humidity": (80, 90),
                "co2": 1500,
                "machines": [("Packing & Cold Room", "PACK-COLD", 30)],
            },
        ]

        processes = []
        process_machines = {}
        for sequence, spec in enumerate(process_specs, start=1):
            process = self.master(
                identity,
                factory,
                "processes",
                spec["name"],
                spec["code"],
                parent=spec["line"],
                metadata={
                    "sequence": sequence,
                    "processType": spec["type"],
                    "description": spec["description"],
                    "inputUnit": spec["input"],
                    "outputUnit": spec["output"],
                    "targetCycleMinutes": spec["days"] * 1440,
                    "targetTemperatureC": sum(spec["temperature"]) / 2,
                    "capacityPerHour": 75 if spec["code"] == "CROP" else 500,
                },
            )
            processes.append(process)
            process_machines[process.code] = []
            for machine_name, machine_code, power_kw in spec["machines"]:
                machine = self.master(
                    identity,
                    factory,
                    "machines",
                    machine_name,
                    machine_code,
                    parent=spec["line"],
                    metadata={
                        "processCode": process.code,
                        "manufacturer": "Musroom Climate Systems",
                        "model": f"MUS-{machine_code}",
                        "commissionedYear": 2024,
                        "powerKw": power_kw,
                        "capacityPerHour": 75 if spec["code"] == "CROP" else 500,
                    },
                )
                process_machines[process.code].append(machine)

        masters = [
            ("skus", "Button Mushroom Grade A", "MUSH-BUTTON-A", {"unit": "kg"}),
            ("skus", "Button Mushroom Grade B", "MUSH-BUTTON-B", {"unit": "kg"}),
            ("materials", "Wheat straw", "MAT-STRAW", {"unit": "kg"}),
            ("materials", "Chicken manure", "MAT-MANURE", {"unit": "kg"}),
            ("materials", "Gypsum", "MAT-GYPSUM", {"unit": "kg"}),
            ("materials", "Urea", "MAT-UREA", {"unit": "kg"}),
            ("materials", "Wheat bran", "MAT-BRAN", {"unit": "kg"}),
            ("materials", "Mushroom spawn", "MAT-SPAWN", {"unit": "kg"}),
            ("materials", "Cocopeat casing", "MAT-COCOPEAT", {"unit": "kg"}),
            ("materials", "Formalin", "MAT-FORMALIN", {"unit": "litre"}),
            ("materials", "Lime", "MAT-LIME", {"unit": "kg"}),
            ("materials", "Packing punnets", "MAT-PUNNET", {"unit": "pieces"}),
            ("suppliers", "Haryana Straw Collective", "SUP-STRAW", {}),
            ("suppliers", "North India Poultry Inputs", "SUP-MANURE", {}),
            ("suppliers", "Mycelium Genetics Lab", "SUP-SPAWN", {}),
            ("suppliers", "Green Casing Materials", "SUP-CASING", {}),
            ("suppliers", "FreshPack Solutions", "SUP-PACK", {}),
            ("shifts", "Morning Harvest", "SHIFT-MORNING", {"start": "05:00", "end": "13:00"}),
            ("shifts", "Day Crop Care", "SHIFT-DAY", {"start": "13:00", "end": "21:00"}),
            ("shifts", "Night Monitoring", "SHIFT-NIGHT", {"start": "21:00", "end": "05:00"}),
            ("reasonCodes", "HVAC temperature deviation", "DT-HVAC-TEMP", {}),
            ("reasonCodes", "Fogger pressure loss", "DT-FOGGER", {}),
            ("reasonCodes", "Green mould contamination", "QLT-GREEN-MOULD", {}),
            ("reasonCodes", "Cap bruising", "QLT-BRUISING", {}),
        ]
        for kind, name, code, metadata in masters:
            self.master(identity, factory, kind, name, code, metadata=metadata)

        factory.uploads.filter(source_type="showcase").delete()
        today = date.today()
        self.seed_process_data(
            identity,
            factory,
            process_specs,
            processes,
            process_machines,
            today,
        )
        self.seed_operational_data(identity, factory, wing, today)
        self.seed_spatial_layout(identity, factory)
        self.stdout.write(
            self.style.SUCCESS(
                f"Musroom ready: {len(processes)} crop stages and "
                f"{factory.standard_records.count()} standardized records."
            )
        )

    def master(self, identity, factory, kind, name, code, parent=None, metadata=None):
        item, _ = FactoryMaster.objects.update_or_create(
            factory=factory,
            kind=kind,
            code=code,
            defaults={
                "tenant": identity.tenant,
                "name": name,
                "parent": parent,
                "metadata": metadata or {},
                "is_active": True,
            },
        )
        return item

    def seed_process_data(
        self,
        identity,
        factory,
        process_specs,
        processes,
        process_machines,
        today,
    ):
        batches = {
            "GR-01": "MUS-2607-R1",
            "GR-02": "MUS-2607-R2",
            "GR-03": "MUS-2607-R3",
            "GR-04": "MUS-2607-R4",
        }
        for spec, process in zip(process_specs, processes, strict=True):
            rows = []
            temp_min, temp_max = spec["temperature"]
            humidity_min, humidity_max = spec["humidity"]
            for day_offset in range(7):
                observed = today - timedelta(days=6 - day_offset)
                for machine_index, machine in enumerate(process_machines[process.code]):
                    temperature = (temp_min + temp_max) / 2 + ((day_offset % 3) - 1) * 0.4
                    humidity = (humidity_min + humidity_max) / 2 + (machine_index % 2) * 0.6
                    co2 = spec["co2"] * 0.74
                    status = "running"
                    downtime = 4 + machine_index
                    if process.code == "CROP" and machine.code == "GR-03" and observed == today:
                        humidity = humidity_min - 4.5
                        co2 = spec["co2"] + 420
                        status = "warning"
                        downtime = 74
                    output = (
                        285 + day_offset * 5 + machine_index * 7 if process.code == "CROP" else 8800
                    )
                    input_quantity = output * 1.04
                    rows.append(
                        {
                            "date": observed.isoformat(),
                            "line": spec["line"].name,
                            "process": process.code,
                            "machine": machine.code,
                            "shift": "Day Crop Care",
                            "status": status,
                            "input_quantity": round(input_quantity, 1),
                            "output_quantity": round(output, 1),
                            "rejected_quantity": round(output * 0.012, 1),
                            "run_minutes": 1440 - downtime,
                            "cycle_time_minutes": spec["days"] * 1440,
                            "temperature_c": round(temperature, 1),
                            "humidity_pct": round(humidity, 1),
                            "co2_ppm": round(co2),
                            "substrate_moisture_pct": 68.5
                            if process.code in {"CASING", "PINNING", "CROP"}
                            else 65,
                            "water_litres": 235 + machine_index * 10
                            if process.code == "CROP"
                            else 0,
                            "treatment": "Lime + approved crop-care spray"
                            if process.code == "CROP" and day_offset in {1, 5}
                            else "",
                            "treatment_quantity": 30
                            if process.code == "CROP" and day_offset in {1, 5}
                            else 0,
                            "temperature_min_c": temp_min,
                            "temperature_max_c": temp_max,
                            "humidity_min_pct": humidity_min,
                            "humidity_max_pct": humidity_max,
                            "co2_max_ppm": spec["co2"],
                            "energy_kwh": 44 + machine_index * 8,
                            "downtime_minutes": downtime,
                            "operator": "Musroom Crop Team",
                            "batch_id": batches.get(machine.code, f"MUS-{process.code}-01"),
                        }
                    )
            self.create_upload(
                identity,
                factory,
                "process",
                f"musroom_{process.code.casefold()}_observations.csv",
                rows,
                import_context={
                    "processId": str(process.id),
                    "processCode": process.code,
                    "processName": process.name,
                },
            )

    def seed_operational_data(self, identity, factory, wing, today):
        production = []
        downtime = []
        quality = []
        rooms = ["Growing Room 1", "Growing Room 2", "Growing Room 3", "Growing Room 4"]
        reasons = ["Cap bruising", "Open veil", "Green mould contamination", "Undersize caps"]
        for day_offset in range(7):
            harvest_date = today - timedelta(days=6 - day_offset)
            for room_index, room in enumerate(rooms, start=1):
                planned = 315 + room_index * 4
                actual = 292 + day_offset * 4 + room_index * 5
                rejected = 5 + (7 if room_index == 3 and day_offset >= 5 else room_index)
                grade_b = 12 + room_index
                good = actual - rejected - grade_b
                production.append(
                    {
                        "date": harvest_date.isoformat(),
                        "line": wing.name,
                        "machine": room,
                        "sku": "Button Mushroom Grade A",
                        "shift": "Morning Harvest",
                        "order_id": f"MUS-HARV-{harvest_date:%m%d}",
                        "planned_quantity": planned,
                        "actual_quantity": actual,
                        "good_quantity": good,
                        "rejected_quantity": rejected,
                        "reworked_quantity": grade_b,
                        "batch_id": f"MUS-2607-R{room_index}",
                        "flush_number": 2 if day_offset < 4 else 3,
                        "substrate_dry_kg": 2400 + room_index * 50,
                        "growing_area_m2": 112,
                        "water_litres": 235 + room_index * 10,
                        "crop_age_days": 29 + day_offset,
                        "planned_minutes": 480,
                        "downtime_minutes": 74 if room_index == 3 and harvest_date == today else 8,
                        "ideal_cycle_minutes": 1.4,
                    }
                )
                quality.append(
                    {
                        "date": harvest_date.isoformat(),
                        "line": wing.name,
                        "machine": room,
                        "sku": "Button Mushroom Grade A",
                        "shift": "Morning Harvest",
                        "inspected_quantity": actual,
                        "rejected_quantity": rejected,
                        "reworked_quantity": grade_b,
                        "defect_reason": reasons[room_index - 1],
                    }
                )
            downtime.extend(
                [
                    {
                        "date": harvest_date.isoformat(),
                        "line": wing.name,
                        "machine": "Growing Room 3",
                        "shift": "Day Crop Care",
                        "reason": "HVAC temperature deviation",
                        "minutes": 74 if harvest_date == today else 18,
                        "occurrences": 2 if harvest_date == today else 1,
                    },
                    {
                        "date": harvest_date.isoformat(),
                        "line": wing.name,
                        "machine": "Growing Room 2",
                        "shift": "Day Crop Care",
                        "reason": "Fogger pressure loss",
                        "minutes": 12,
                        "occurrences": 1,
                    },
                ]
            )

        inventory_specs = [
            ("Wheat straw", "Haryana Straw Collective", "kg", 24000, 5200, 18000, "on_time"),
            ("Chicken manure", "North India Poultry Inputs", "kg", 9800, 3100, 9300, "on_time"),
            ("Gypsum", "North India Poultry Inputs", "kg", 820, 260, 780, "on_time"),
            ("Urea", "North India Poultry Inputs", "kg", 210, 95, 285, "delayed"),
            ("Wheat bran", "Haryana Straw Collective", "kg", 580, 220, 660, "delayed"),
            ("Mushroom spawn", "Mycelium Genetics Lab", "kg", 760, 310, 930, "partial"),
            ("Cocopeat casing", "Green Casing Materials", "kg", 5200, 1850, 5550, "on_time"),
            ("Formalin", "Green Casing Materials", "litre", 340, 72, 216, "on_time"),
            ("Lime", "Green Casing Materials", "kg", 430, 160, 480, "on_time"),
            ("Packing punnets", "FreshPack Solutions", "pieces", 3600, 1800, 5400, "delayed"),
        ]
        inventory = [
            {
                "date": today.isoformat(),
                "material": material,
                "supplier": supplier,
                "unit": unit,
                "available_quantity": available,
                "daily_consumption": consumption,
                "safety_stock": safety,
                "expected_receipt_date": (today + timedelta(days=2)).isoformat(),
                "required_date": (today + timedelta(days=1)).isoformat(),
                "receipt_status": status,
            }
            for material, supplier, unit, available, consumption, safety, status in inventory_specs
        ]

        supplier_profiles = [
            (
                "Haryana Straw Collective",
                "Wheat straw",
                30000,
                (0, 0, 1),
                0.99,
                0.99,
                (True, True, True),
            ),
            (
                "North India Poultry Inputs",
                "Chicken manure",
                18000,
                (0, 2, 0),
                0.96,
                0.98,
                (True, True, False),
            ),
            (
                "Mycelium Genetics Lab",
                "Mushroom spawn",
                2400,
                (0, 1, 3),
                0.94,
                0.995,
                (True, True, True),
            ),
            (
                "Green Casing Materials",
                "Cocopeat casing",
                8000,
                (1, 3, 4),
                0.91,
                0.97,
                (True, False, False),
            ),
            (
                "FreshPack Solutions",
                "Packing punnets",
                15000,
                (3, 5, 6),
                0.84,
                0.95,
                (False, False, False),
            ),
        ]
        suppliers = []
        for supplier_index, profile in enumerate(supplier_profiles, start=1):
            supplier, material, ordered, delays, receipt_rate, acceptance_rate, terms = profile
            for delivery_index, offset in enumerate((6, 3, 0), start=1):
                actual_delivery = today - timedelta(days=offset)
                promised = actual_delivery - timedelta(days=delays[delivery_index - 1])
                received = round(ordered * receipt_rate)
                suppliers.append(
                    {
                        "supplier": supplier,
                        "material": material,
                        "purchase_order": f"MUS-PO-{supplier_index:02}-{delivery_index:02}",
                        "order_date": (promised - timedelta(days=10)).isoformat(),
                        "promised_date": promised.isoformat(),
                        "actual_delivery_date": actual_delivery.isoformat(),
                        "ordered_quantity": ordered,
                        "received_quantity": received,
                        "accepted_quantity": round(received * acceptance_rate),
                        "terms_met": "yes" if terms[delivery_index - 1] else "no",
                    }
                )

        orders = [
            {
                "order_id": "MUS-ORDER-NCR-001",
                "sku": "Button Mushroom Grade A",
                "line": wing.name,
                "required_quantity": 3600,
                "produced_quantity": 2740,
                "due_date": (today + timedelta(days=1)).isoformat(),
                "priority": "critical",
                "status": "open",
            },
            {
                "order_id": "MUS-ORDER-HORECA-002",
                "sku": "Button Mushroom Grade A",
                "line": wing.name,
                "required_quantity": 2400,
                "produced_quantity": 1960,
                "due_date": (today + timedelta(days=3)).isoformat(),
                "priority": "high",
                "status": "open",
            },
        ]
        for dataset_type, filename, rows in [
            ("production", "musroom_harvest.csv", production),
            ("downtime", "musroom_room_downtime.csv", downtime),
            ("quality", "musroom_crop_quality.csv", quality),
            ("inventory", "musroom_inventory.csv", inventory),
            ("supplier", "musroom_supplier_receipts.csv", suppliers),
            ("orders", "musroom_customer_orders.csv", orders),
        ]:
            self.create_upload(identity, factory, dataset_type, filename, rows)

    def seed_spatial_layout(self, identity, factory):
        from apps.spatial.models import (
            FactoryLayout,
            MachineConnection,
            MachineObservation,
            MachineOperationalStatus,
            MachineParameter,
            ParamDataType,
            SpatialMachine,
            UnitSystem,
        )

        FactoryLayout.objects.filter(factory=factory).delete()
        layout = FactoryLayout.objects.create(
            tenant=identity.tenant,
            factory=factory,
            floor_width=80.0,
            floor_height=50.0,
            unit_system=UnitSystem.METERS,
            is_active=True,
        )

        machine_params_map = {
            "Compost Yard": [
                ("moisture_pct", ParamDataType.NUMBER, True, 1),
                ("temperature_c", ParamDataType.NUMBER, True, 2),
                ("turning_cycle", ParamDataType.NUMBER, False, 3),
                ("nitrogen_pct", ParamDataType.NUMBER, False, 4),
            ],
            "Pasteurisation Tunnel 1": [
                ("peak_temp_c", ParamDataType.NUMBER, True, 1),
                ("holding_hours", ParamDataType.NUMBER, True, 2),
                ("airflow_cfm", ParamDataType.NUMBER, False, 3),
                ("ammonia_ppm", ParamDataType.NUMBER, True, 4),
            ],
            "Spawning & Filling Line": [
                ("spawn_rate_pct", ParamDataType.NUMBER, True, 1),
                ("fill_density_kg_m2", ParamDataType.NUMBER, True, 2),
                ("line_speed_m_min", ParamDataType.NUMBER, False, 3),
                ("casing_depth_cm", ParamDataType.NUMBER, False, 4),
            ],
            "Spawn Run Room": [
                ("bed_temp_c", ParamDataType.NUMBER, True, 1),
                ("air_temp_c", ParamDataType.NUMBER, True, 2),
                ("rh_pct", ParamDataType.NUMBER, True, 3),
                ("co2_ppm", ParamDataType.NUMBER, True, 4),
            ],
            "Casing Room": [
                ("casing_moisture_pct", ParamDataType.NUMBER, True, 1),
                ("temp_c", ParamDataType.NUMBER, True, 2),
                ("rh_pct", ParamDataType.NUMBER, True, 3),
                ("ph_level", ParamDataType.NUMBER, False, 4),
            ],
            "Pinning Room": [
                ("temp_c", ParamDataType.NUMBER, True, 1),
                ("rh_pct", ParamDataType.NUMBER, True, 2),
                ("co2_ppm", ParamDataType.NUMBER, True, 3),
                ("fresh_air_pct", ParamDataType.NUMBER, False, 4),
            ],
            "Growing Room 1": [
                ("temperature_c", ParamDataType.NUMBER, True, 1),
                ("humidity_pct", ParamDataType.NUMBER, True, 2),
                ("co2_ppm", ParamDataType.NUMBER, True, 3),
                ("cap_size_mm", ParamDataType.NUMBER, False, 4),
            ],
            "Packing & Cold Room": [
                ("cold_storage_temp_c", ParamDataType.NUMBER, True, 1),
                ("rh_pct", ParamDataType.NUMBER, True, 2),
                ("pack_weight_g", ParamDataType.NUMBER, True, 3),
                ("seal_integrity", ParamDataType.TEXT, False, 4),
            ],
        }

        machine_obs_map = {
            "Compost Yard": [
                {"moisture_pct": 68.5, "temperature_c": 63.1, "turning_cycle": 3, "nitrogen_pct": 2.1, "input_in-1": 10100, "output_out-1": 9400},
                {"moisture_pct": 67.8, "temperature_c": 62.4, "turning_cycle": 2, "nitrogen_pct": 2.0, "input_in-1": 9900, "output_out-1": 9250},
            ],
            "Pasteurisation Tunnel 1": [
                {"peak_temp_c": 58.5, "holding_hours": 8.0, "airflow_cfm": 2400, "ammonia_ppm": 12, "input_in-2": 9400, "output_out-2": 9150},
                {"peak_temp_c": 59.0, "holding_hours": 8.2, "airflow_cfm": 2350, "ammonia_ppm": 14, "input_in-2": 9250, "output_out-2": 9000},
            ],
            "Spawning & Filling Line": [
                {"spawn_rate_pct": 0.85, "fill_density_kg_m2": 85, "line_speed_m_min": 14.5, "casing_depth_cm": 4.5, "input_in-3": 9150, "output_out-3": 9050},
                {"spawn_rate_pct": 0.82, "fill_density_kg_m2": 84, "line_speed_m_min": 14.2, "casing_depth_cm": 4.4, "input_in-3": 9000, "output_out-3": 8920},
            ],
            "Spawn Run Room": [
                {"bed_temp_c": 24.2, "air_temp_c": 22.8, "rh_pct": 92.5, "co2_ppm": 2450, "input_in-4": 9050, "output_out-4": 8980},
                {"bed_temp_c": 24.0, "air_temp_c": 22.5, "rh_pct": 92.0, "co2_ppm": 2400, "input_in-4": 8920, "output_out-4": 8850},
            ],
            "Casing Room": [
                {"casing_moisture_pct": 72.0, "temp_c": 22.1, "rh_pct": 93.0, "ph_level": 7.4, "input_in-5": 8980, "output_out-5": 8920},
                {"casing_moisture_pct": 71.5, "temp_c": 22.0, "rh_pct": 92.8, "ph_level": 7.5, "input_in-5": 8850, "output_out-5": 8800},
            ],
            "Pinning Room": [
                {"temp_c": 17.5, "rh_pct": 89.5, "co2_ppm": 1150, "fresh_air_pct": 35, "input_in-6": 8920, "output_out-6": 8880},
                {"temp_c": 17.3, "rh_pct": 89.2, "co2_ppm": 1180, "fresh_air_pct": 33, "input_in-6": 8800, "output_out-6": 8750},
            ],
            "Growing Room 1": [
                {"temperature_c": 17.1, "humidity_pct": 88.5, "co2_ppm": 888, "cap_size_mm": 42.5, "input_in-7": 8880, "output_out-7": 8862},
                {"temperature_c": 17.0, "humidity_pct": 88.2, "co2_ppm": 910, "cap_size_mm": 41.8, "input_in-7": 8750, "output_out-7": 8720},
            ],
            "Packing & Cold Room": [
                {"cold_storage_temp_c": 3.8, "rh_pct": 85.0, "pack_weight_g": 250, "seal_integrity": "Passed", "input_in-8": 8862, "output_out-8": 8238},
                {"cold_storage_temp_c": 4.0, "rh_pct": 84.5, "pack_weight_g": 250, "seal_integrity": "Passed", "input_in-8": 8720, "output_out-8": 8110},
            ],
        }

        machine_configs = [
            (
                "Compost Yard",
                4,
                6,
                8,
                6,
                "Substrate",
                "Compost",
                MachineOperationalStatus.RUNNING,
                1,
            ),
            (
                "Pasteurisation Tunnel 1",
                18,
                6,
                8,
                6,
                "Compost",
                "Conditioned Compost",
                MachineOperationalStatus.RUNNING,
                2,
            ),
            (
                "Spawning & Filling Line",
                32,
                6,
                8,
                6,
                "Conditioned Compost",
                "Spawned Compost",
                MachineOperationalStatus.RUNNING,
                3,
            ),
            (
                "Spawn Run Room",
                46,
                6,
                8,
                6,
                "Spawned Compost",
                "Colonised Compost",
                MachineOperationalStatus.RUNNING,
                4,
            ),
            (
                "Casing Room",
                60,
                6,
                8,
                6,
                "Colonised Compost",
                "Cased Beds",
                MachineOperationalStatus.RUNNING,
                5,
            ),
            (
                "Pinning Room",
                18,
                24,
                8,
                6,
                "Cased Beds",
                "Pinned Beds",
                MachineOperationalStatus.RUNNING,
                6,
            ),
            (
                "Growing Room 1",
                32,
                24,
                8,
                6,
                "Pinned Beds",
                "Fresh Mushrooms",
                MachineOperationalStatus.RUNNING,
                7,
            ),
            (
                "Packing & Cold Room",
                46,
                24,
                8,
                6,
                "Fresh Mushrooms",
                "Packed Mushrooms",
                MachineOperationalStatus.RUNNING,
                8,
            ),
        ]

        created_machines = []
        for name, px, py, sw, sh, inp, out, status, order in machine_configs:
            m = SpatialMachine.objects.create(
                tenant=identity.tenant,
                layout=layout,
                name=name,
                position_x=px,
                position_y=py,
                size_width=sw,
                size_height=sh,
                inputs=[{"id": f"in-{order}", "label": inp, "unitType": "kg"}],
                outputs=[{"id": f"out-{order}", "label": out, "unitType": "kg"}],
                status=status,
                display_order=order,
            )
            created_machines.append(m)

            # Seed parameters for each mushroom machine
            params_list = machine_params_map.get(name, [])
            for key, dt, req, p_ord in params_list:
                MachineParameter.objects.create(
                    machine=m,
                    key=key,
                    data_type=dt,
                    required=req,
                    order=p_ord,
                )

            # Seed sample observation snapshots
            obs_list = machine_obs_map.get(name, [])
            for obs_data in obs_list:
                MachineObservation.objects.create(
                    tenant=identity.tenant,
                    machine=m,
                    values=obs_data,
                )

        for idx in range(len(created_machines) - 1):
            MachineConnection.objects.create(
                tenant=identity.tenant,
                layout=layout,
                source=created_machines[idx],
                target=created_machines[idx + 1],
                name=f"{created_machines[idx].name} to {created_machines[idx + 1].name}",
                material_type=machine_configs[idx][6],
            )

    def create_upload(self, identity, factory, dataset_type, filename, rows, import_context=None):
        headers = list(rows[0])
        upload = Upload.objects.create(
            tenant=identity.tenant,
            factory=factory,
            original_filename=filename,
            checksum=f"showcase-{dataset_type}-{filename}",
            file_size=0,
            file_type="csv",
            uploaded_by=identity.user,
            uploaded_at=timezone.now(),
            template_code=dataset_type,
            template_version="mushroom-v1",
            dataset_type=dataset_type,
            source_type="showcase",
            headers=headers,
            raw_rows=rows,
            import_context=import_context or {},
            mapping={header: header for header in headers},
            record_count=len(rows),
            accepted_rows=len(rows),
            data_quality_score=100,
            status="COMPLETED",
        )
        StandardRecord.objects.bulk_create(
            [
                StandardRecord(
                    tenant=identity.tenant,
                    upload=upload,
                    factory=factory,
                    dataset_type=dataset_type,
                    source_row=index,
                    operational_date=record_date(row),
                    line=str(row.get("line", "")),
                    machine=str(row.get("machine", "")),
                    sku=str(row.get("sku", "")),
                    shift=str(row.get("shift", "")),
                    values=row,
                )
                for index, row in enumerate(rows, start=2)
            ]
        )
