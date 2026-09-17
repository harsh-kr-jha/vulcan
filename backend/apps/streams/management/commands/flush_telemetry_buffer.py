import json

from django.core.management.base import BaseCommand

from apps.streams.pipeline import flush_buffer


class Command(BaseCommand):
    help = "Retry locally buffered ClickHouse/archive telemetry batches."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        self.stdout.write(json.dumps(flush_buffer(limit=max(1, options["limit"])), sort_keys=True))
