import json

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.streams.datasets import LEVELS, generate_training_datasets
from apps.tenancy.models import Factory, Tenant


class Command(BaseCommand):
    help = "Generate immutable Parquet datasets for external ML training."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True, help="Tenant slug")
        parser.add_argument("--factory", required=True, help="Factory code")
        parser.add_argument("--level", choices=sorted(LEVELS), required=True)
        parser.add_argument("--version", required=True, help="Semantic version, e.g. 1.0.0")

    def handle(self, *args, **options):
        if not settings.ML_DATASETS_ENABLED:
            raise CommandError("ML dataset generation is disabled.")
        tenant = Tenant.objects.filter(slug=options["tenant"], is_active=True).first()
        if tenant is None:
            raise CommandError("Tenant was not found.")
        factory = Factory.objects.filter(
            tenant=tenant, code=options["factory"], is_active=True
        ).first()
        if factory is None:
            raise CommandError("Factory was not found in that tenant.")
        try:
            result = generate_training_datasets(
                tenant=tenant,
                factory=factory,
                level=options["level"],
                version=options["version"],
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(json.dumps({"generated": len(result), "datasets": result}, indent=2))
