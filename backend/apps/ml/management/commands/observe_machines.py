import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from apps.ml.registry import sync_models
from apps.ml.worker import process_pending, prune_feature_history


class Command(BaseCommand):
    help = "Process telemetry into observations and refresh external prediction models."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        synced_at = 0
        while True:
            close_old_connections()
            process_pending()
            if time.monotonic() - synced_at > 60:
                try:
                    sync_models()
                    prune_feature_history()
                except Exception as exc:
                    self.stderr.write(str(exc))
                synced_at = time.monotonic()
            if options["once"]:
                return
            time.sleep(1)
