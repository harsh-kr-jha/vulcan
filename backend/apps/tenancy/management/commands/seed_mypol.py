import csv
import hashlib
import json
import os
from datetime import date, timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.operations.imports import normalize_values, record_date
from apps.operations.models import MappingProfile, StandardRecord, Upload, UploadState
from apps.tenancy.models import (
    Company,
    EmailIdentity,
    Factory,
    FactoryMaster,
    Membership,
    Role,
    Tenant,
    normalize_login_email,
)
from processing.mapping import header_signature

REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
DATA_ROOT = REPOSITORY_ROOT / "test-data" / "mypol-mysuru"
DATASET_FILES = {
    "production": "production.csv",
    "downtime": "downtime.csv",
    "quality": "quality.csv",
    "inventory": "inventory.csv",
    "orders": "orders.csv",
    "supplier": "suppliers.csv",
    "utilities": "utilities.csv",
}
MASTER_KINDS = {
    "line": FactoryMaster.Kind.LINE,
    "machine": FactoryMaster.Kind.MACHINE,
    "sku": FactoryMaster.Kind.SKU,
    "material": FactoryMaster.Kind.MATERIAL,
    "supplier": FactoryMaster.Kind.SUPPLIER,
    "shift": FactoryMaster.Kind.SHIFT,
    "reason_code": FactoryMaster.Kind.REASON_CODE,
}
MACHINE_PROCESS = {
    "MC-01": "L1-CUR",
    "MC-02": "L1-CUR",
    "MC-03": "L2-CUR",
    "MC-04": "L2-CUR",
    "MC-05": "L3-VUL",
    "MC-06": "L3-VUL",
    "MC-07": "L4-MLD",
    "MC-08": "L4-MLD",
}


def process_spec(
    code,
    name,
    process_type,
    description,
    input_unit,
    output_unit,
    cycle_minutes,
    capacity_per_hour,
    *,
    temperature_c=None,
    pressure_bar=None,
):
    return {
        "code": code,
        "name": name,
        "processType": process_type,
        "description": description,
        "inputUnit": input_unit,
        "outputUnit": output_unit,
        "targetCycleMinutes": cycle_minutes,
        "capacityPerHour": capacity_per_hour,
        "targetTemperatureC": temperature_c,
        "targetPressureBar": pressure_bar,
    }


PROCESS_BLUEPRINTS = {
    "LINE-01": [
        process_spec(
            "L1-MIX",
            "Compound Preparation",
            "mixing",
            "Weigh and mix the butyl-rubber compound for two-wheeler tubes.",
            "kg",
            "kg",
            18,
            380,
            temperature_c=118,
        ),
        process_spec(
            "L1-EXT",
            "Tube Extrusion",
            "extrusion",
            "Extrude the compound into a controlled continuous tube profile.",
            "kg",
            "metres",
            0.42,
            1800,
            temperature_c=92,
            pressure_bar=115,
        ),
        process_spec(
            "L1-VAL",
            "Valve Application",
            "assembly",
            "Prepare the valve base and bond the valve stem to the tube blank.",
            "pieces",
            "pieces",
            0.18,
            820,
            temperature_c=78,
            pressure_bar=4.2,
        ),
        process_spec(
            "L1-SPL",
            "Tube Splicing",
            "splicing",
            "Cut to length and join both ends into an uncured tube ring.",
            "pieces",
            "pieces",
            0.22,
            800,
            temperature_c=105,
            pressure_bar=5.5,
        ),
        process_spec(
            "L1-CUR",
            "Tube Vulcanisation",
            "curing",
            "Cure the green tube under controlled steam heat and pressure.",
            "pieces",
            "pieces",
            6.8,
            780,
            temperature_c=168,
            pressure_bar=8.5,
        ),
        process_spec(
            "L1-QPK",
            "Leak Test & Packing",
            "inspection",
            "Leak-test, visually inspect, label and pack accepted tubes.",
            "pieces",
            "pieces",
            0.15,
            760,
        ),
    ],
    "LINE-02": [
        process_spec(
            "L2-MIX",
            "Heavy Tube Compound Preparation",
            "mixing",
            "Prepare heavy-duty butyl compound and additives.",
            "kg",
            "kg",
            22,
            420,
            temperature_c=120,
        ),
        process_spec(
            "L2-EXT",
            "Heavy Tube Extrusion",
            "extrusion",
            "Extrude heavy-section tube profiles to controlled gauge.",
            "kg",
            "metres",
            0.55,
            1400,
            temperature_c=94,
            pressure_bar=125,
        ),
        process_spec(
            "L2-VAL",
            "Heavy Valve Application",
            "assembly",
            "Apply and bond heavy-vehicle valve assemblies.",
            "pieces",
            "pieces",
            0.24,
            650,
            temperature_c=80,
            pressure_bar=4.8,
        ),
        process_spec(
            "L2-SPL",
            "Heavy Tube Splicing",
            "splicing",
            "Join heavy tube blanks and verify splice geometry.",
            "pieces",
            "pieces",
            0.3,
            620,
            temperature_c=108,
            pressure_bar=6,
        ),
        process_spec(
            "L2-CUR",
            "Heavy Tube Vulcanisation",
            "curing",
            "Cure heavy-vehicle tubes through the hydraulic press bank.",
            "pieces",
            "pieces",
            8.2,
            600,
            temperature_c=170,
            pressure_bar=9,
        ),
        process_spec(
            "L2-QPK",
            "Heavy Tube Inspection & Packing",
            "inspection",
            "Perform air-retention testing, final inspection and packing.",
            "pieces",
            "pieces",
            0.2,
            590,
        ),
    ],
    "LINE-03": [
        process_spec(
            "L3-MIX",
            "Curing Product Compound Preparation",
            "mixing",
            "Prepare reinforced compounds used by tyre-industry curing products.",
            "kg",
            "kg",
            24,
            320,
            temperature_c=118,
        ),
        process_spec(
            "L3-FRM",
            "Preforming & Reinforcement",
            "forming",
            "Preform blanks and position fabric reinforcement where required.",
            "kg",
            "pieces",
            1.1,
            300,
            temperature_c=84,
        ),
        process_spec(
            "L3-VUL",
            "Curing Product Vulcanisation",
            "curing",
            "Mould and vulcanise curing bags, envelopes and flaps.",
            "pieces",
            "pieces",
            12,
            280,
            temperature_c=172,
            pressure_bar=10,
        ),
        process_spec(
            "L3-FIN",
            "Cooling & Finishing",
            "finishing",
            "Cool, demould and trim finished curing products.",
            "pieces",
            "pieces",
            0.65,
            270,
        ),
        process_spec(
            "L3-QA",
            "Dimensional Inspection",
            "inspection",
            "Verify dimensions, surface finish and product identification.",
            "pieces",
            "pieces",
            0.35,
            260,
        ),
    ],
    "LINE-04": [
        process_spec(
            "L4-MIX",
            "Engineering Compound Preparation",
            "mixing",
            "Prepare application-specific compounds for engineered rubber products.",
            "kg",
            "kg",
            20,
            340,
            temperature_c=116,
        ),
        process_spec(
            "L4-INS",
            "Insert Preparation & Bonding",
            "preparation",
            "Clean, prepare and apply bonding agent to metal inserts.",
            "pieces",
            "pieces",
            0.8,
            360,
            temperature_c=70,
        ),
        process_spec(
            "L4-PRF",
            "Preforming",
            "forming",
            "Cut and weigh compound preforms for controlled mould loading.",
            "kg",
            "pieces",
            0.55,
            350,
        ),
        process_spec(
            "L4-MLD",
            "Compression Moulding & Cure",
            "moulding",
            "Compression-mould and vulcanise automotive and NVH components.",
            "pieces",
            "pieces",
            9.5,
            320,
            temperature_c=175,
            pressure_bar=12,
        ),
        process_spec(
            "L4-TRM",
            "Deflashing & Trimming",
            "finishing",
            "Remove flash and finish moulded component edges.",
            "pieces",
            "pieces",
            0.42,
            310,
        ),
        process_spec(
            "L4-QA",
            "Final Inspection",
            "inspection",
            "Inspect dimensions, rubber-to-metal bond and visual quality.",
            "pieces",
            "pieces",
            0.3,
            300,
        ),
    ],
}


class Command(BaseCommand):
    help = "Import the complete synthetic MYPOL Mysuru automotive showcase into a local workspace."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant-slug",
            help=(
                "Existing local tenant to receive the factory; defaults to "
                "vulcan-demo when present."
            ),
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "seed_mypol is a local synthetic-data command and requires DJANGO_DEBUG=true."
            )
        if settings.VULCAN_VARIANT != "automotive":
            raise CommandError("seed_mypol can run only with VULCAN_VARIANT=automotive.")

        credentials = self.demo_credentials()
        manifest, verified_files = self.verify_fixture_pack()

        with transaction.atomic():
            tenant = self.resolve_tenant(options.get("tenant_slug"))
            company = self.configure_company(tenant)
            factory = self.configure_factory(tenant, company, manifest)
            uploader = (
                self.provision_demo_login(tenant, credentials)
                if credentials
                else self.seed_user(tenant)
            )
            master_counts = self.import_masters(tenant, factory)

            factory.uploads.filter(source_type__in={"showcase", "showcase-derived"}).delete()
            imported_counts = {
                dataset_type: self.import_dataset(
                    tenant,
                    factory,
                    uploader,
                    dataset_type,
                    DATA_ROOT / filename,
                    verified_files[filename],
                )
                for dataset_type, filename in DATASET_FILES.items()
            }
            derived_process_rows = self.seed_process_snapshots(
                tenant,
                factory,
                uploader,
                manifest,
            )

        self.stdout.write(
            self.style.SUCCESS(
                "MYPOL Mysuru ready: "
                f"{sum(imported_counts.values()):,} operational rows, "
                f"{master_counts['total']} active masters, "
                f"{master_counts['processes']} configured processes, "
                f"{master_counts['machines']} machines, and "
                f"{derived_process_rows:,} derived process snapshots."
            )
        )
        self.stdout.write(
            f"Synthetic source period: {manifest['period']['from']} to {manifest['period']['to']}. "
            "Recommended dashboard range: 2026-07-25 to 2026-07-31."
        )
        if credentials:
            self.stdout.write(
                self.style.SUCCESS("Opt-in MYPOL demo login provisioned; its password was rotated.")
            )
        elif Membership.objects.filter(tenant=tenant, is_active=True).exists():
            self.stdout.write(
                "Existing active members of this tenant can access the configured factory."
            )
        else:
            self.stdout.write(
                "No login provisioned; set both MYPOL_DEMO_EMAIL and MYPOL_DEMO_PASSWORD."
            )

    def resolve_tenant(self, requested_slug):
        if requested_slug:
            tenant, _ = Tenant.objects.get_or_create(
                slug=requested_slug,
                defaults={"name": "Vulcan Automotive Demo"},
            )
            return tenant
        existing = Tenant.objects.filter(slug="vulcan-demo", is_active=True).first()
        if existing:
            return existing
        tenant, _ = Tenant.objects.get_or_create(
            slug="vulcan-automotive-demo",
            defaults={"name": "Vulcan Automotive Demo"},
        )
        return tenant

    def configure_company(self, tenant):
        company, _ = Company.objects.get_or_create(tenant=tenant, name="MYPOL")
        company.legal_name = "Mysore Polymers and Rubber Products Pvt. Ltd."
        company.is_active = True
        company.save(update_fields=["legal_name", "is_active", "updated_at"])
        return company

    def configure_factory(self, tenant, company, manifest):
        factory = Factory.objects.filter(tenant=tenant, code="MYP-MYS").first()
        if factory is None:
            factory = Factory.objects.filter(tenant=tenant, code="MYPOL-MYS").first()
            if factory is not None:
                factory.code = "MYP-MYS"
        if factory is None:
            factory = Factory(tenant=tenant, code="MYP-MYS")

        factory.company = company
        factory.name = "MYPOL Mysuru Plant"
        factory.address = "20P, KRS Road, Metagalli Post, Mysuru, Karnataka 570016"
        factory.timezone = "Asia/Kolkata"
        factory.is_active = True
        factory.configuration = {
            **factory.configuration,
            "currency": "INR",
            "industry": settings.VULCAN_VARIANT_CONFIG["industry"],
            "subIndustry": "precision-rubber-engineering",
            "factoryDetails": {
                "factoryType": (
                    "Automotive tubes, tyre-industry products and engineered rubber components"
                ),
                "productionUnit": "pieces",
                "operatingHoursPerDay": 24,
                "shiftsPerDay": 3,
                "energyUnit": "kWh",
                "weightUnit": "kg",
                "temperatureUnit": "°C",
                "pressureUnit": "bar",
                "dataClassification": "synthetic-showcase",
            },
            "targets": {
                "oee": 78,
                "availability": 90,
                "performance": 90,
                "quality": 98,
                "planAttainment": 95,
                "rejectionRate": 2,
                "supplierScore": 85,
                "stockCoverDays": 3,
                "downtimeMinutes": 45,
                "downtimeUnit": "minutes",
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
                },
                {
                    "id": "mypol-plan-attainment",
                    "name": "Schedule attainment",
                    "variableA": "production.actual",
                    "operation": "divide",
                    "variableB": "production.planned",
                    "scale": 100,
                    "decimals": 1,
                    "unit": "%",
                    "pinnedToHome": True,
                },
                {
                    "id": "mypol-heat-recovery-intensity",
                    "name": "Recovered heat per kg steam",
                    "variableA": "utilities.heat_recovered",
                    "operation": "divide",
                    "variableB": "utilities.steam_generated",
                    "scale": 1,
                    "decimals": 2,
                    "unit": "MJ/kg",
                    "pinnedToHome": True,
                },
                {
                    "id": "mypol-steam-per-good-unit",
                    "name": "Steam per good unit",
                    "variableA": "utilities.steam_generated",
                    "operation": "divide",
                    "variableB": "production.good",
                    "scale": 1,
                    "decimals": 2,
                    "unit": "kg/unit",
                    "pinnedToHome": True,
                },
            ],
            "showcase": {
                "synthetic": True,
                "source": "test-data/mypol-mysuru",
                "period": manifest["period"],
                "recommendedRange": {"from": "2026-07-25", "to": "2026-07-31"},
                "disclaimer": manifest["disclaimer"],
            },
        }
        factory.save()
        return factory

    def import_masters(self, tenant, factory):
        rows = self.read_csv(DATA_ROOT / "factory_master_reference.csv")
        FactoryMaster.objects.filter(factory=factory).update(is_active=False)
        lines = {}
        line_rows = [row for row in rows if row["entity_type"] == "line"]
        for sequence, row in enumerate(line_rows, start=1):
            lines[row["code"]] = self.master(
                tenant,
                factory,
                FactoryMaster.Kind.LINE,
                row["name"],
                row["code"],
                metadata={
                    "sequence": sequence,
                    "unit": row["uom"],
                    "description": row["notes"],
                    "source": "synthetic-mypol-fixture",
                },
            )

        process_count = 0
        for line_code, specs in PROCESS_BLUEPRINTS.items():
            line = lines[line_code]
            for sequence, spec in enumerate(specs, start=1):
                metadata = {
                    key: value
                    for key, value in spec.items()
                    if key not in {"code", "name"} and value is not None
                }
                metadata.update({"sequence": sequence, "source": "synthetic-process-blueprint"})
                self.master(
                    tenant,
                    factory,
                    FactoryMaster.Kind.PROCESS,
                    spec["name"],
                    spec["code"],
                    parent=line,
                    metadata=metadata,
                )
                process_count += 1

        kind_counts = {kind.value: 0 for kind in FactoryMaster.Kind}
        for row in rows:
            entity_type = row["entity_type"]
            if entity_type not in MASTER_KINDS or entity_type == "line":
                continue
            kind = MASTER_KINDS[entity_type]
            metadata = {
                "unit": row["uom"],
                "description": row["notes"],
                "source": "synthetic-mypol-fixture",
            }
            if kind == FactoryMaster.Kind.SHIFT and "-" in row["notes"]:
                metadata["start"], metadata["end"] = row["notes"].split("-", 1)
            if kind == FactoryMaster.Kind.MACHINE:
                metadata.update(
                    {
                        "processCode": MACHINE_PROCESS[row["code"]],
                        "manufacturer": "Synthetic test asset",
                        "model": f"TEST-{row['code']}",
                    }
                )
            self.master(
                tenant,
                factory,
                kind,
                row["name"],
                row["code"],
                parent=lines.get(row["parent_code"]),
                metadata=metadata,
            )
            kind_counts[kind.value] += 1

        active = FactoryMaster.objects.filter(factory=factory, is_active=True)
        return {
            "total": active.count(),
            "processes": process_count,
            "machines": kind_counts[FactoryMaster.Kind.MACHINE],
        }

    def master(self, tenant, factory, kind, name, code, *, parent=None, metadata=None):
        item, _ = FactoryMaster.objects.update_or_create(
            factory=factory,
            kind=kind,
            code=code,
            defaults={
                "tenant": tenant,
                "name": name,
                "parent": parent,
                "metadata": metadata or {},
                "is_active": True,
            },
        )
        return item

    def import_dataset(self, tenant, factory, uploader, dataset_type, path, verification):
        rows = self.read_csv(path)
        return self.store_rows(
            tenant,
            factory,
            uploader,
            dataset_type,
            path.name,
            rows,
            checksum=verification["sha256"],
            file_size=path.stat().st_size,
            source_type="showcase",
        )

    def seed_process_snapshots(self, tenant, factory, uploader, manifest):
        end = date.fromisoformat(manifest["period"]["to"])
        start = end - timedelta(days=6)
        processes = list(
            FactoryMaster.objects.filter(
                factory=factory,
                kind=FactoryMaster.Kind.PROCESS,
                is_active=True,
            )
            .select_related("parent")
            .order_by("parent__metadata__sequence", "metadata__sequence", "code")
        )
        machines_by_process = {}
        for machine in FactoryMaster.objects.filter(
            factory=factory,
            kind=FactoryMaster.Kind.MACHINE,
            is_active=True,
        ):
            process_code = str(machine.metadata.get("processCode", ""))
            machines_by_process.setdefault(process_code, []).append(machine)

        total = 0
        for process_index, process in enumerate(processes, start=1):
            metadata = process.metadata
            capacity = float(metadata.get("capacityPerHour", 100))
            cycle = float(metadata.get("targetCycleMinutes", 1))
            connected = machines_by_process.get(process.code, [])
            machine = connected[0].code if connected else f"{process.code}-CELL"
            rows = []
            for day_offset in range(7):
                operational_date = start + timedelta(days=day_offset)
                status = "running"
                downtime = 6 + process_index % 5
                if operational_date == end and process.code == "L2-CUR":
                    status, downtime = "down", 185
                elif operational_date == end and process.code in {"L1-VAL", "L4-MLD"}:
                    status, downtime = "warning", 72
                run_minutes = max(450 - downtime, 1)
                state_factor = 0.48 if status == "down" else 0.76 if status == "warning" else 0.92
                output = capacity * (run_minutes / 60) * state_factor
                row = {
                    "date": operational_date.isoformat(),
                    "line": process.parent.name,
                    "process": process.code,
                    "machine": machine,
                    "shift": "Shift A",
                    "status": status,
                    "input_quantity": round(output * 1.02, 2),
                    "output_quantity": round(output, 2),
                    "rejected_quantity": round(output * (0.008 + process_index % 3 * 0.002), 2),
                    "run_minutes": run_minutes,
                    "cycle_time_minutes": round(cycle * (1.02 + process_index % 4 * 0.01), 3),
                    "energy_kwh": round(35 + capacity * 0.06 + process_index * 2.5, 2),
                    "downtime_minutes": downtime,
                    "operator": "Synthetic MYPOL process team",
                    "batch_id": f"MYP-{operational_date:%m%d}-{process.code}",
                }
                if metadata.get("targetTemperatureC") is not None:
                    row["temperature_c"] = round(
                        float(metadata["targetTemperatureC"]) + (4 if status == "warning" else 1),
                        1,
                    )
                if metadata.get("targetPressureBar") is not None:
                    row["pressure_bar"] = round(
                        max(
                            float(metadata["targetPressureBar"])
                            - (1.8 if status == "down" else 0.1),
                            0,
                        ),
                        1,
                    )
                rows.append(row)
            filename = f"mypol_{process.code.casefold()}_derived_process.csv"
            checksum = hashlib.sha256(
                json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            total += self.store_rows(
                tenant,
                factory,
                uploader,
                "process",
                filename,
                rows,
                checksum=checksum,
                file_size=0,
                source_type="showcase-derived",
                import_context={
                    "processId": str(process.id),
                    "processCode": process.code,
                    "processName": process.name,
                    "derivation": "Synthetic process state derived for Factory Twin demonstration",
                },
            )
        return total

    def store_rows(
        self,
        tenant,
        factory,
        uploader,
        dataset_type,
        filename,
        rows,
        *,
        checksum,
        file_size,
        source_type,
        import_context=None,
    ):
        headers = list(rows[0])
        mapping = {header: header for header in headers}
        signature = header_signature({"data": headers})
        profile, _ = MappingProfile.objects.update_or_create(
            factory=factory,
            template_code=dataset_type,
            template_version="1",
            header_signature=signature,
            defaults={
                "tenant": tenant,
                "mappings": mapping,
                "approved_by": uploader,
                "is_active": True,
            },
        )
        upload = Upload.objects.create(
            tenant=tenant,
            factory=factory,
            original_filename=filename,
            checksum=checksum,
            file_size=file_size,
            file_type="csv",
            uploaded_by=uploader,
            uploaded_at=timezone.now(),
            template_code=dataset_type,
            template_version="1",
            mapping_profile=profile,
            source_sheets=[filename],
            record_count=len(rows),
            accepted_rows=len(rows),
            data_quality_score=100,
            status=UploadState.COMPLETED,
            dataset_type=dataset_type,
            source_type=source_type,
            headers=headers,
            raw_rows=rows,
            import_context=import_context or {},
            mapping=mapping,
        )
        records = []
        for source_row, raw in enumerate(rows, start=2):
            values = normalize_values(raw, dataset_type)
            records.append(
                StandardRecord(
                    tenant=tenant,
                    upload=upload,
                    factory=factory,
                    dataset_type=dataset_type,
                    source_row=source_row,
                    operational_date=record_date(values),
                    line=str(values.get("line", "")),
                    machine=str(values.get("machine", "")),
                    sku=str(values.get("sku", "")),
                    shift=str(values.get("shift", "")),
                    values=values,
                )
            )
        StandardRecord.objects.bulk_create(records, batch_size=500)
        return len(records)

    def verify_fixture_pack(self):
        try:
            manifest = json.loads((DATA_ROOT / "manifest.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise CommandError("The MYPOL fixture manifest could not be loaded.") from exc
        if manifest.get("synthetic") is not True:
            raise CommandError("The MYPOL fixture must remain explicitly marked as synthetic.")
        verified = {}
        for entry in manifest.get("files", []):
            path = DATA_ROOT / entry["file"]
            try:
                payload = path.read_bytes()
            except OSError as exc:
                raise CommandError(f"Missing MYPOL fixture file: {entry['file']}.") from exc
            digest = hashlib.sha256(payload).hexdigest()
            row_count = max(len(payload.decode("utf-8-sig").splitlines()) - 1, 0)
            if digest != entry["sha256"] or row_count != entry["rows"]:
                raise CommandError(
                    f"MYPOL fixture integrity check failed for {entry['file']}; "
                    "regenerate or restore the pack."
                )
            verified[entry["file"]] = entry
        required = set(DATASET_FILES.values()) | {"factory_master_reference.csv"}
        if not required.issubset(verified):
            raise CommandError(
                "The MYPOL fixture manifest does not cover every required source file."
            )
        return manifest, verified

    @staticmethod
    def read_csv(path):
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as source:
                rows = list(csv.DictReader(source))
        except (OSError, csv.Error) as exc:
            raise CommandError(f"Could not read MYPOL fixture {path.name}.") from exc
        if not rows:
            raise CommandError(f"MYPOL fixture {path.name} is empty.")
        return rows

    def demo_credentials(self):
        raw_email = os.getenv("MYPOL_DEMO_EMAIL", "")
        password = os.getenv("MYPOL_DEMO_PASSWORD", "")
        if bool(raw_email) != bool(password):
            raise CommandError("Set MYPOL_DEMO_EMAIL and MYPOL_DEMO_PASSWORD together, or neither.")
        if not raw_email:
            return None
        email = normalize_login_email(raw_email)
        try:
            validate_email(email)
            if len(password) < 15:
                raise ValidationError("The demo password must contain at least 15 characters.")
            candidate = get_user_model()(username="mypol-demo-login", email=email)
            validate_password(password, user=candidate)
        except ValidationError as exc:
            raise CommandError("Invalid MYPOL demo credentials: " + " ".join(exc.messages)) from exc
        return email, password

    @transaction.atomic
    def provision_demo_login(self, tenant, credentials):
        email, password = credentials
        user_model = get_user_model()
        user, created = user_model.objects.get_or_create(username="mypol-demo-login")
        if not created and not EmailIdentity.objects.filter(user=user).exists():
            raise CommandError("The reserved MYPOL demo username belongs to another user.")
        user.email = email
        user.first_name = "MYPOL"
        user.last_name = "Mysuru Team"
        user.is_active = True
        user.is_staff = False
        user.is_superuser = False
        user.set_password(password)
        user.save()
        try:
            EmailIdentity.objects.update_or_create(user=user, defaults={"email": email})
        except IntegrityError as exc:
            raise CommandError("The configured MYPOL demo email belongs to another user.") from exc
        Membership.objects.update_or_create(
            user=user,
            tenant=tenant,
            defaults={"role": Role.COMPANY_ADMIN, "all_factories": True, "is_active": True},
        )
        return user

    @staticmethod
    def seed_user(tenant):
        membership = (
            Membership.objects.filter(tenant=tenant, is_active=True, user__is_active=True)
            .select_related("user")
            .order_by("created_at", "pk")
            .first()
        )
        if membership:
            return membership.user
        user, created = get_user_model().objects.get_or_create(
            username="mypol-seed-uploader",
            defaults={"first_name": "MYPOL", "last_name": "Fixture Import", "is_active": True},
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        return user
