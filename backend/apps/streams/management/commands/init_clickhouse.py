from django.core.management.base import BaseCommand

from apps.streams.clickhouse import ClickHouseTelemetryStore


class Command(BaseCommand):
    help = "Create or update ClickHouse telemetry tables and aggregates."

    def handle(self, *args, **options):
        ClickHouseTelemetryStore().initialize()
        self.stdout.write(self.style.SUCCESS("ClickHouse telemetry schema is ready."))
