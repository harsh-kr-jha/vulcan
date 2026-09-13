import hashlib
import json
import os
from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction

from apps.analytics.cache import invalidate_workspace
from apps.tenancy.management.commands.seed_mypol import Command as DatasetSeedCommand
from apps.tenancy.master_imports import apply_master_import, inspect_master_import
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
from processing.templates import TEMPLATES

REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
DATA_ROOT = REPOSITORY_ROOT / "test-data" / "infinexxgen-chakan"
DATASET_FILES = {
    "projects": "projects.csv",
    "project_stages": "project_stages.csv",
    "production": "production.csv",
    "downtime": "downtime.csv",
    "quality": "quality.csv",
    "inventory": "inventory.csv",
    "orders": "orders.csv",
    "supplier": "suppliers.csv",
    "utilities": "utilities.csv",
}


class Command(DatasetSeedCommand):
    help = "Import the complete synthetic INFINEXXGEN Chakan showcase into a local workspace."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-slug", default="infinexxgen")

    def handle(self, *args, **options):
        credentials = self.demo_credentials()
        manifest, verified = self.verify_fixture_pack()
        metadata = self.load_json("metadata.json")
        configuration = self.load_json("factory_configuration.json")

        with transaction.atomic():
            tenant = self.configure_tenant(options["tenant_slug"])
            company = self.configure_company(tenant, metadata)
            factory = self.configure_factory(tenant, company, metadata, configuration)
            uploader = (
                self.provision_demo_login(tenant, credentials)
                if credentials
                else self.seed_user(tenant)
            )
            master_count = self.import_masters(tenant, factory)

            factory.uploads.filter(source_type="showcase").delete()
            imported_counts = {
                dataset_type: self.import_dataset(
                    tenant,
                    factory,
                    uploader,
                    dataset_type,
                    DATA_ROOT / filename,
                    verified[filename],
                )
                for dataset_type, filename in DATASET_FILES.items()
            }
            process_count = 0
            for process_import in metadata["processImports"]:
                filename = process_import["file"]
                process = FactoryMaster.objects.get(
                    factory=factory,
                    kind=FactoryMaster.Kind.PROCESS,
                    code=process_import["selectProcessCode"],
                    is_active=True,
                )
                allowed_fields = {field.key for field in TEMPLATES["process"]}
                rows = [
                    {key: value for key, value in row.items() if key in allowed_fields}
                    for row in self.read_csv(DATA_ROOT / filename)
                ]
                process_count += self.store_rows(
                    tenant,
                    factory,
                    uploader,
                    "process",
                    Path(filename).name,
                    rows,
                    checksum=verified[filename]["sha256"],
                    file_size=(DATA_ROOT / filename).stat().st_size,
                    source_type="showcase",
                    import_context={
                        "processId": str(process.id),
                        "processCode": process.code,
                        "processName": process.name,
                    },
                )

        invalidate_workspace(factory.id)
        call_command("seed_technical_library")
        total = sum(imported_counts.values()) + process_count
        self.stdout.write(
            self.style.SUCCESS(
                f"INFINEXXGEN Chakan ready: {total:,} operational rows, "
                f"{master_count} active masters, and "
                f"{len(metadata['processImports'])} process sheets."
            )
        )
        self.stdout.write(
            f"Recommended dashboard range: {manifest['recommended_demo_range']['from']} to "
            f"{manifest['recommended_demo_range']['to']}."
        )

    @staticmethod
    def configure_tenant(slug):
        tenant, _ = Tenant.objects.get_or_create(slug=slug)
        tenant.name = "INFINEXXGEN Technologies"
        tenant.is_active = True
        tenant.settings = {
            **tenant.settings,
            "template": "INFINEXXGEN",
            "dataClassification": "synthetic-showcase",
        }
        tenant.save()
        return tenant

    @staticmethod
    def configure_company(tenant, metadata):
        display_name = metadata["company"]["displayName"]
        company, _ = Company.objects.get_or_create(tenant=tenant, name=display_name)
        company.legal_name = metadata["company"]["legalName"]
        company.is_active = True
        company.save()
        return company

    @staticmethod
    def configure_factory(tenant, company, metadata, configuration):
        factory_data = metadata["factory"]
        factory, _ = Factory.objects.get_or_create(
            tenant=tenant,
            code=factory_data["code"],
            defaults={
                "company": company,
                "name": factory_data["name"],
            },
        )
        factory.company = company
        factory.name = factory_data["name"]
        factory.address = factory_data["addressForTestSetup"]
        factory.timezone = factory_data["timezone"]
        factory.configuration = configuration
        factory.is_active = True
        factory.save()
        return factory

    @staticmethod
    def import_masters(tenant, factory):
        path = DATA_ROOT / "factory_master_reference.csv"
        payload = path.read_bytes()
        uploaded = SimpleUploadedFile(path.name, payload, content_type="text/csv")
        preview = inspect_master_import(factory, uploaded)
        if not preview["canApply"]:
            messages = "; ".join(
                item["message"] for item in preview["issues"] if item["severity"] == "error"
            )
            raise CommandError(f"INFINEXXGEN master data is invalid: {messages}")
        uploaded.seek(0)
        result = apply_master_import(tenant, factory, uploaded, preview["checksum"])
        return result["appliedTotal"]

    def import_dataset(self, tenant, factory, uploader, dataset_type, path, verification):
        return self.store_rows(
            tenant,
            factory,
            uploader,
            dataset_type,
            path.name,
            self.read_csv(path),
            checksum=verification["sha256"],
            file_size=path.stat().st_size,
            source_type="showcase",
        )

    @staticmethod
    def load_json(filename):
        try:
            return json.loads((DATA_ROOT / filename).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise CommandError(f"Could not load INFINEXXGEN fixture {filename}.") from exc

    def verify_fixture_pack(self):
        manifest = self.load_json("manifest.json")
        if manifest.get("synthetic") is not True:
            raise CommandError("The INFINEXXGEN fixture must remain explicitly synthetic.")
        verified = {}
        for entry in manifest.get("files", []):
            filename = entry["file"]
            path = DATA_ROOT / filename
            try:
                payload = path.read_bytes()
            except OSError as exc:
                raise CommandError(f"Missing INFINEXXGEN fixture file: {filename}.") from exc
            if hashlib.sha256(payload).hexdigest() != entry["sha256"]:
                raise CommandError(f"INFINEXXGEN fixture checksum failed: {filename}.")
            if "rows" in entry:
                row_count = max(len(payload.decode("utf-8-sig").splitlines()) - 1, 0)
                if row_count != entry["rows"]:
                    raise CommandError(f"INFINEXXGEN fixture row count failed: {filename}.")
            verified[filename] = entry
        required = set(DATASET_FILES.values()) | {
            "factory_master_reference.csv",
            *[item["file"] for item in self.load_json("metadata.json")["processImports"]],
        }
        if not required.issubset(verified):
            raise CommandError("The manifest does not cover every INFINEXXGEN source file.")
        return manifest, verified

    @staticmethod
    def demo_credentials():
        raw_email = os.getenv("INFINEXXGEN_DEMO_EMAIL", "")
        password = os.getenv("INFINEXXGEN_DEMO_PASSWORD", "")
        if bool(raw_email) != bool(password):
            raise CommandError(
                "Set INFINEXXGEN_DEMO_EMAIL and INFINEXXGEN_DEMO_PASSWORD together."
            )
        if not raw_email:
            return None
        email = normalize_login_email(raw_email)
        try:
            validate_email(email)
            candidate = get_user_model()(username="infinexxgen-portal-user", email=email)
            validate_password(password, user=candidate)
        except ValidationError as exc:
            raise CommandError("Invalid portal credentials: " + " ".join(exc.messages)) from exc
        return email, password

    @transaction.atomic
    def provision_demo_login(self, tenant, credentials):
        email, password = credentials
        user_model = get_user_model()
        user, created = user_model.objects.get_or_create(username="infinexxgen-portal-user")
        if not created and EmailIdentity.objects.filter(user=user).exclude(email=email).exists():
            raise CommandError("The reserved INFINEXXGEN username belongs to another login.")
        user.email = email
        user.first_name = "INFINEXXGEN"
        user.last_name = "Portal User"
        user.is_active = True
        user.is_staff = False
        user.is_superuser = False
        user.set_password(password)
        user.save()
        try:
            EmailIdentity.objects.update_or_create(user=user, defaults={"email": email})
        except IntegrityError as exc:
            raise CommandError("The configured portal email belongs to another user.") from exc
        Membership.objects.update_or_create(
            user=user,
            tenant=tenant,
            defaults={
                "role": Role.COMPANY_ADMIN,
                "all_factories": True,
                "is_active": True,
            },
        )
        return user

    @staticmethod
    def seed_user(tenant):
        membership = (
            Membership.objects.filter(tenant=tenant, is_active=True, user__is_active=True)
            .select_related("user")
            .first()
        )
        if membership:
            return membership.user
        user, created = get_user_model().objects.get_or_create(
            username="infinexxgen-seed-uploader",
            defaults={"first_name": "INFINEXXGEN", "last_name": "Fixture Import"},
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        return user
