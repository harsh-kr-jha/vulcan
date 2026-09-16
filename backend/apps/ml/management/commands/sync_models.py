from django.core.management.base import BaseCommand, CommandError

from apps.ml.registry import sync_models


class Command(BaseCommand):
    help = "Discover and verify externally trained prediction models."

    def handle(self, *args, **options):
        try:
            result = sync_models()
        except Exception as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                f"Model registry synced: {result['discovered']} discovered, "
                f"{result['active']} active."
            )
        )
