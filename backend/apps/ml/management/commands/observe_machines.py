import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from apps.ml.worker import process_pending, schedule_training


class Command(BaseCommand):
    help = "Process durable telemetry into ML observations and schedule training."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        scheduled_at = 0
        while True:
            close_old_connections()
            process_pending()
            if time.monotonic() - scheduled_at > 60:
                try:
                    schedule_training()
                except Exception as exc:
                    self.stderr.write(str(exc))
                scheduled_at = time.monotonic()
            if options["once"]:
                return
            time.sleep(1)
