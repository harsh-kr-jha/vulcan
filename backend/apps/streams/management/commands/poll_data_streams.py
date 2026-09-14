import time
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from django.db.models import Q
from django.db.utils import OperationalError, ProgrammingError
from django.utils import timezone

from apps.streams.models import BindingStatus, MachineStreamBinding, MachineTelemetrySample
from apps.streams.services import mark_poll_failure, poll_binding


class Command(BaseCommand):
    help = "Continuously pull due http-pull-v1 data stream bindings."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        last_pruned_at = 0.0
        while True:
            close_old_connections()
            try:
                if time.monotonic() - last_pruned_at >= 3600:
                    cutoff = timezone.now() - timedelta(days=settings.DATA_STREAM_RETENTION_DAYS)
                    MachineTelemetrySample.objects.filter(received_at__lt=cutoff).delete()
                    last_pruned_at = time.monotonic()
                due = list(
                    MachineStreamBinding.objects.filter(
                        channel__stream__enabled=True,
                        status__in=[BindingStatus.ACTIVE, BindingStatus.DEGRADED],
                    )
                    .filter(Q(next_poll_at__isnull=True) | Q(next_poll_at__lte=timezone.now()))
                    .select_related("machine", "channel__stream__credential")[:100]
                )
            except (OperationalError, ProgrammingError) as exc:
                if options["once"]:
                    raise
                self.stderr.write(f"Data-stream database is not ready: {exc}")
                time.sleep(settings.DATA_STREAM_POLL_SECONDS)
                continue
            for binding in due:
                try:
                    poll_binding(binding)
                except Exception as exc:
                    mark_poll_failure(binding, exc)
                    self.stderr.write(f"{binding.id}: {exc}")
            if options["once"]:
                return
            time.sleep(settings.DATA_STREAM_POLL_SECONDS)
