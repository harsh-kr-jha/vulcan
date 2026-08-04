from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.operations.imports import record_date
from apps.operations.models import StandardRecord, Upload
from apps.tenancy.models import Factory, FactoryMaster
from apps.tenancy.services import get_workspace_identity


class Command(BaseCommand):
    help = "Create or refresh the MyPol process-aware showcase factory in the live workspace."

    def handle(self, *args, **options):
        identity = get_workspace_identity()
        factory, _ = Factory.objects.get_or_create(
            tenant=identity.tenant,
            code="MYPOL-MYS",
            defaults={
                "company": identity.company,
                "name": "MyPol",
                "address": "Hebbal Industrial Area, Mysuru, Karnataka",
                "timezone": "Asia/Kolkata",
            },
        )
        factory.name = "MyPol"
        factory.company = identity.company
        factory.address = "Hebbal Industrial Area, Mysuru, Karnataka"
        factory.timezone = "Asia/Kolkata"
        factory.configuration = {
            **factory.configuration,
            "currency": "INR",
            "industry": "Rubber products manufacturing",
            "factoryDetails": {
                "factoryType": "Inner tube and moulded rubber plant",
                "facilityAreaM2": 18500,
                "ratedCapacityPerDay": 18000,
                "productionUnit": "tubes",
                "operatingHoursPerDay": 24,
                "shiftsPerDay": 3,
                "powerCapacityKva": 2500,
                "energyUnit": "kWh",
                "weightUnit": "kg",
                "temperatureUnit": "°C",
                "pressureUnit": "bar",
                "commissionedYear": 1998,
            },
            "targets": {
                "oee": 78,
                "availability": 88,
                "performance": 92,
                "quality": 98,
                "rejectionRate": 3,
                "supplierScore": 85,
                "stockCoverDays": 3,
                "downtimeMinutes": 45,
            },
            "customKpis": [
                {
                    "id": "mypol-good-output-rate",
                    "name": "Good output rate",
                    "variableA": "production.good",
                    "operation": "divide",
                    "variableB": "production.actual",
                    "scale": 100,
                    "decimals": 1,
                    "unit": "%",
                    "pinnedToHome": True,
                }
            ],
        }
        factory.save()

        line = self.master(
            identity,
            factory,
            "lines",
            "Inner Tube Line 1",
            "ITL-01",
            metadata={"sequence": 1, "productFamily": "Automotive inner tubes"},
        )
        process_specs = [
            (
                "Raw Material Mixing",
                "MIX",
                "mixing",
                "Weigh and blend rubber compound ingredients.",
                "kg",
                "kg",
                18,
                118,
                0,
                380,
                "Internal Mixer 01",
                "MIX-01",
                160,
            ),
            (
                "Tube Extrusion",
                "EXT",
                "extrusion",
                "Extrude the compound into continuous tube profiles.",
                "kg",
                "metres",
                0.42,
                92,
                115,
                1800,
                "Tube Extruder 01",
                "EXT-01",
                132,
            ),
            (
                "Valve Assembly",
                "VAL",
                "assembly",
                "Fit and bond valve stems to cut tube blanks.",
                "pieces",
                "pieces",
                0.18,
                78,
                4.2,
                820,
                "Valve Fitting Station 01",
                "VAL-01",
                88,
            ),
            (
                "Tube Splicing",
                "SPL",
                "splicing",
                "Join tube ends into a continuous uncured ring.",
                "pieces",
                "pieces",
                0.22,
                105,
                5.5,
                800,
                "Automatic Splicer 01",
                "SPL-01",
                72,
            ),
            (
                "Vulcanisation",
                "CUR",
                "curing",
                "Cure the green tube under controlled heat and pressure.",
                "pieces",
                "pieces",
                6.8,
                168,
                8.5,
                780,
                "Curing Press Bank 01",
                "CUR-01",
                310,
            ),
            (
                "Inspection & Packing",
                "QPK",
                "inspection",
                "Leak test, visually inspect, label and pack finished tubes.",
                "pieces",
                "tubes",
                0.15,
                24,
                0,
                760,
                "Leak Test & Packing Cell",
                "QPK-01",
                54,
            ),
        ]
        processes = []
        machines = []
        for sequence, spec in enumerate(process_specs, start=1):
            (
                name,
                code,
                process_type,
                description,
                input_unit,
                output_unit,
                target_cycle,
                target_temperature,
                target_pressure,
                capacity,
                machine_name,
                machine_code,
                power_kw,
            ) = spec
            process_metadata = {
                "sequence": sequence,
                "processType": process_type,
                "description": description,
                "inputUnit": input_unit,
                "outputUnit": output_unit,
                "targetCycleMinutes": target_cycle,
                "capacityPerHour": capacity,
            }
            if target_temperature:
                process_metadata["targetTemperatureC"] = target_temperature
            if target_pressure:
                process_metadata["targetPressureBar"] = target_pressure
            process = self.master(
                identity,
                factory,
                "processes",
                name,
                code,
                parent=line,
                metadata=process_metadata,
            )
            machine = self.master(
                identity,
                factory,
                "machines",
                machine_name,
                machine_code,
                parent=line,
                metadata={
                    "processCode": code,
                    "manufacturer": "MyPol Engineering",
                    "model": f"MP-{machine_code}",
                    "commissionedYear": 2019 + sequence % 4,
                    "powerKw": power_kw,
                    "capacityPerHour": capacity,
                },
            )
            processes.append(process)
            machines.append(machine)

        for kind, name, code, metadata in [
            ("skus", "Truck Inner Tube 1100-20", "MYP-TUBE-1100-20", {"unit": "tube"}),
            ("materials", "Butyl Rubber IIR Grade A", "MAT-IIR-A", {"unit": "kg"}),
            ("materials", "Carbon Black N660", "MAT-CB-N660", {"unit": "kg"}),
            ("materials", "Process Oil TDAE", "MAT-OIL-TDAE", {"unit": "litre"}),
            ("materials", "Zinc Oxide Active", "MAT-ZNO-A", {"unit": "kg"}),
            ("materials", "Valve Stems TR78A", "MAT-VALVE-TR78A", {"unit": "pieces"}),
            ("materials", "5-ply Packaging Cartons", "MAT-CARTON-5P", {"unit": "pieces"}),
            ("suppliers", "Approved Polymer Supplier A", "SUP-POLY-A", {}),
            ("suppliers", "Carbon Materials India", "SUP-CARBON", {}),
            ("suppliers", "PetroChem Fluids", "SUP-OIL", {}),
            ("suppliers", "Western Minerals", "SUP-MINERAL", {}),
            ("suppliers", "Precision Valve Components", "SUP-VALVE", {}),
            ("suppliers", "Mysuru Packaging Works", "SUP-PACK", {}),
            ("shifts", "Shift A", "SHIFT-A", {"start": "06:00", "end": "14:00"}),
            ("shifts", "Shift B", "SHIFT-B", {"start": "14:00", "end": "22:00"}),
            ("shifts", "Shift C", "SHIFT-C", {"start": "22:00", "end": "06:00"}),
            ("reasonCodes", "Curing pressure deviation", "DT-CURE-PRESS", {}),
            ("reasonCodes", "Valve alignment", "QLT-VALVE-ALIGN", {}),
        ]:
            self.master(identity, factory, kind, name, code, metadata=metadata)

        factory.uploads.filter(source_type="showcase").delete()
        today = date.today()
        self.seed_process_data(identity, factory, line, processes, machines, today)
        self.seed_operational_data(identity, factory, line, machines, today)
        self.stdout.write(
            self.style.SUCCESS(
                f"MyPol ready: {len(processes)} processes, {len(machines)} machines, "
                f"{factory.standard_records.count()} standardized records."
            )
        )

    def master(
        self,
        identity,
        factory,
        kind,
        name,
        code,
        parent=None,
        metadata=None,
    ):
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

    def seed_process_data(self, identity, factory, line, processes, machines, today):
        rows_by_process = {process.code: [] for process in processes}
        for day_offset in range(7):
            operational_date = today - timedelta(days=6 - day_offset)
            for index, (process, machine) in enumerate(zip(processes, machines, strict=True)):
                status = "running"
                downtime = 5 + index * 2
                if operational_date == today and process.code == "VAL":
                    status, downtime = "warning", 92
                if operational_date == today and process.code == "CUR":
                    status, downtime = "down", 310
                metadata = process.metadata
                run_minutes = max(480 - downtime, 1)
                state_factor = 0.35 if status == "down" else 0.72 if status == "warning" else 0.9
                capacity = float(metadata["capacityPerHour"])
                output_quantity = capacity * (run_minutes / 60) * state_factor
                output_quantity *= 0.97 + day_offset * 0.006
                if process.code == "EXT":
                    input_quantity = output_quantity * 0.12
                elif process.code == "QPK":
                    input_quantity = output_quantity * 1.01
                else:
                    input_quantity = output_quantity * 1.02
                rejected_quantity = output_quantity * (0.007 + index * 0.001)
                row = {
                    "date": operational_date.isoformat(),
                    "line": line.name,
                    # Context and standardized rows use the immutable process code.
                    "process": process.code,
                    "machine": machine.code,
                    "shift": "Shift A",
                    "status": status,
                    "input_quantity": round(input_quantity, 1),
                    "output_quantity": round(output_quantity, 1),
                    "rejected_quantity": round(rejected_quantity, 1),
                    "run_minutes": run_minutes,
                    "cycle_time_minutes": round(
                        float(metadata.get("targetCycleMinutes", 1)) * (1.02 + index * 0.008),
                        2,
                    ),
                    "energy_kwh": round(42 + index * 17.5, 1),
                    "downtime_minutes": downtime,
                    "operator": "MyPol Demo Team",
                    "batch_id": f"MYP-{operational_date:%m%d}-{index + 1:02}",
                }
                target_temperature = float(metadata.get("targetTemperatureC", 0))
                target_pressure = float(metadata.get("targetPressureBar", 0))
                if target_temperature:
                    row["temperature_c"] = round(
                        target_temperature + (4 if status == "warning" else 1), 1
                    )
                if target_pressure:
                    row["pressure_bar"] = round(
                        max(target_pressure - (1.8 if status == "down" else 0.1), 0), 1
                    )
                rows_by_process[process.code].append(row)

        for process in processes:
            self.create_upload(
                identity,
                factory,
                "process",
                f"mypol_{process.code.casefold()}_process.csv",
                rows_by_process[process.code],
                import_context={
                    "processId": str(process.id),
                    "processCode": process.code,
                    "processName": process.name,
                },
            )

    def seed_operational_data(self, identity, factory, line, machines, today):
        production = []
        downtime = []
        quality = []
        for day_offset in range(7):
            operational_date = today - timedelta(days=6 - day_offset)
            actual = 15600 + day_offset * 180
            rejected = 260 - day_offset * 8
            production.append(
                {
                    "date": operational_date.isoformat(),
                    "line": line.name,
                    "machine": machines[-1].name,
                    "sku": "Truck Inner Tube 1100-20",
                    "shift": "Shift A",
                    "order_id": f"MYP-ORD-{day_offset + 1:03}",
                    "planned_quantity": 17500,
                    "actual_quantity": actual,
                    "good_quantity": actual - rejected,
                    "rejected_quantity": rejected,
                    "reworked_quantity": 0,
                    "planned_minutes": 1440,
                    "downtime_minutes": 118 if operational_date == today else 72,
                    "ideal_cycle_minutes": 0.075,
                }
            )
            downtime.append(
                {
                    "date": operational_date.isoformat(),
                    "line": line.name,
                    "machine": machines[4].name,
                    "shift": "Shift A",
                    "reason": "Curing pressure deviation",
                    "minutes": 68 if operational_date == today else 28,
                    "occurrences": 2,
                }
            )
            quality.append(
                {
                    "date": operational_date.isoformat(),
                    "line": line.name,
                    "machine": machines[-1].name,
                    "sku": "Truck Inner Tube 1100-20",
                    "shift": "Shift A",
                    "inspected_quantity": actual,
                    "rejected_quantity": rejected,
                    "reworked_quantity": 0,
                    "defect_reason": "Valve alignment",
                }
            )
        inventory = [
            {
                "date": today.isoformat(),
                "material": "Butyl Rubber IIR Grade A",
                "supplier": "Approved Polymer Supplier A",
                "unit": "kg",
                "available_quantity": 4350,
                "daily_consumption": 1450,
                "safety_stock": 4350,
                "expected_receipt_date": (today + timedelta(days=2)).isoformat(),
                "required_date": (today + timedelta(days=1)).isoformat(),
                "receipt_status": "on_time",
            },
            {
                "date": today.isoformat(),
                "material": "Carbon Black N660",
                "supplier": "Carbon Materials India",
                "unit": "kg",
                "available_quantity": 2800,
                "daily_consumption": 720,
                "safety_stock": 3600,
                "expected_receipt_date": (today + timedelta(days=3)).isoformat(),
                "required_date": (today + timedelta(days=1)).isoformat(),
                "receipt_status": "delayed",
            },
            {
                "date": today.isoformat(),
                "material": "Process Oil TDAE",
                "supplier": "PetroChem Fluids",
                "unit": "litre",
                "available_quantity": 1900,
                "daily_consumption": 410,
                "safety_stock": 2050,
                "expected_receipt_date": (today + timedelta(days=2)).isoformat(),
                "required_date": (today + timedelta(days=2)).isoformat(),
                "receipt_status": "on_time",
            },
            {
                "date": today.isoformat(),
                "material": "Zinc Oxide Active",
                "supplier": "Western Minerals",
                "unit": "kg",
                "available_quantity": 420,
                "daily_consumption": 160,
                "safety_stock": 800,
                "expected_receipt_date": (today + timedelta(days=4)).isoformat(),
                "required_date": (today + timedelta(days=1)).isoformat(),
                "receipt_status": "delayed",
            },
            {
                "date": today.isoformat(),
                "material": "Valve Stems TR78A",
                "supplier": "Precision Valve Components",
                "unit": "pieces",
                "available_quantity": 8800,
                "daily_consumption": 5200,
                "safety_stock": 15600,
                "expected_receipt_date": (today + timedelta(days=1)).isoformat(),
                "required_date": (today + timedelta(days=1)).isoformat(),
                "receipt_status": "partial",
            },
            {
                "date": today.isoformat(),
                "material": "5-ply Packaging Cartons",
                "supplier": "Mysuru Packaging Works",
                "unit": "pieces",
                "available_quantity": 9500,
                "daily_consumption": 4200,
                "safety_stock": 12600,
                "expected_receipt_date": (today + timedelta(days=3)).isoformat(),
                "required_date": (today + timedelta(days=1)).isoformat(),
                "receipt_status": "delayed",
            },
        ]
        supplier_profiles = [
            (
                "Approved Polymer Supplier A",
                "Butyl Rubber IIR Grade A",
                12000,
                (0, 1, 0),
                0.99,
                0.99,
                (True, True, True),
            ),
            (
                "Carbon Materials India",
                "Carbon Black N660",
                6000,
                (0, 0, 0),
                1.0,
                0.985,
                (True, True, True),
            ),
            (
                "PetroChem Fluids",
                "Process Oil TDAE",
                4500,
                (0, 1, 2),
                0.96,
                0.97,
                (True, False, True),
            ),
            (
                "Western Minerals",
                "Zinc Oxide Active",
                1800,
                (2, 3, 4),
                0.90,
                0.94,
                (True, False, False),
            ),
            (
                "Precision Valve Components",
                "Valve Stems TR78A",
                30000,
                (0, 0, 1),
                0.98,
                0.995,
                (True, True, True),
            ),
            (
                "Mysuru Packaging Works",
                "5-ply Packaging Cartons",
                20000,
                (5, 2, 6),
                0.85,
                0.95,
                (False, False, False),
            ),
        ]
        suppliers = []
        actual_delivery_offsets = (6, 3, 0)
        for supplier_index, profile in enumerate(supplier_profiles, start=1):
            supplier, material, ordered, delays, receipt_rate, acceptance_rate, terms = profile
            for delivery_index, actual_offset in enumerate(actual_delivery_offsets, start=1):
                delay = delays[delivery_index - 1]
                actual_delivery = today - timedelta(days=actual_offset)
                promised = actual_delivery - timedelta(days=delay)
                received = round(ordered * receipt_rate)
                suppliers.append(
                    {
                        "supplier": supplier,
                        "material": material,
                        "purchase_order": f"MYP-PO-{supplier_index:02}-{delivery_index:02}",
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
                "order_id": "MYP-CUSTOMER-001",
                "sku": "Truck Inner Tube 1100-20",
                "line": line.name,
                "required_quantity": 52000,
                "produced_quantity": 41800,
                "due_date": (today + timedelta(days=2)).isoformat(),
                "priority": "high",
                "status": "open",
            }
        ]
        for dataset_type, filename, rows in [
            ("production", "mypol_production.csv", production),
            ("downtime", "mypol_downtime.csv", downtime),
            ("quality", "mypol_quality.csv", quality),
            ("inventory", "mypol_inventory.csv", inventory),
            ("supplier", "mypol_suppliers.csv", suppliers),
            ("orders", "mypol_orders.csv", orders),
        ]:
            self.create_upload(identity, factory, dataset_type, filename, rows)

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
            template_version="1",
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
