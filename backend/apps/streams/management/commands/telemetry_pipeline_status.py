import json

from django.core.management.base import BaseCommand

from apps.streams.pipeline import pipeline_status


class Command(BaseCommand):
    help = "Report enabled telemetry stages and local retry-buffer pressure."

    def handle(self, *args, **options):
        self.stdout.write(json.dumps(pipeline_status(), sort_keys=True))
