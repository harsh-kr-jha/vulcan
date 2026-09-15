import os
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.alerts.models import Alert, AlertRule
from apps.analytics.models import DailyMetric, LossEvent
from apps.operations.models import Upload, UploadState
from apps.spatial.models import FactoryLayout, SpatialMachine
from apps.tenancy.models import (
    Company,
    EmailIdentity,
    Factory,
    FactoryMaster,
    Membership,
    Role,
    Tenant,
)


class Command(BaseCommand):
    help = "Create a safe, repeatable local demo dataset."

    def handle(self, *args, **options):
        demo_password = os.getenv("DEMO_PASSWORD", "")
        if len(demo_password) < 15:
            raise CommandError("Set DEMO_PASSWORD to a unique value of at least 15 characters.")
        tenant, _ = Tenant.objects.get_or_create(
            slug="vulcan-demo", defaults={"name": "Vulcan Manufacturing India"}
        )
        company, _ = Company.objects.get_or_create(
            tenant=tenant,
            name="Vulcan Manufacturing India Pvt. Ltd.",
        )
        factory, _ = Factory.objects.get_or_create(
            tenant=tenant,
            code="PNQ-01",
            defaults={
                "company": company,
                "name": "Pune Plant 01",
                "address": "Chakan Industrial Area, Pune, Maharashtra 410501",
            },
        )
        user, created = get_user_model().objects.get_or_create(
            username="harsh",
            defaults={
                "email": "harsh@example.com",
                "first_name": "Harsh",
                "last_name": "Kumar",
            },
        )
        if created:
            user.set_password(demo_password)
            user.save(update_fields=["password"])
        EmailIdentity.objects.get_or_create(user=user, defaults={"email": user.email})
        Membership.objects.get_or_create(
            user=user,
            tenant=tenant,
            defaults={"role": Role.FACTORY_MANAGER, "all_factories": True},
        )

        line, _ = FactoryMaster.objects.get_or_create(
            tenant=tenant,
            factory=factory,
            kind=FactoryMaster.Kind.LINE,
            code="LN-02",
            defaults={"name": "Press Line 02"},
        )
        layout, _ = FactoryLayout.objects.get_or_create(
            tenant=tenant,
            factory=factory,
            defaults={"floor_width": 100, "floor_height": 50},
        )
        machine_names = ["Press 01", "Press 02", "Press 04"]
        machines = []
        for index, name in enumerate(machine_names, start=1):
            machine, _ = SpatialMachine.objects.get_or_create(
                tenant=tenant,
                layout=layout,
                code=f"PRS-{index:02}",
                defaults={"name": name, "position_x": index * 3, "position_y": 3},
            )
            machines.append(machine)

        self._create_metrics(tenant, factory)
        self._create_losses(tenant, factory, line, machines[-1])
        self._create_alerts(tenant, factory, line, machines[-1])
        self._create_uploads(tenant, factory, user)
        self.stdout.write(
            self.style.SUCCESS(
                "Demo ready: login with harsh@example.com and the configured DEMO_PASSWORD."
            )
        )

    def _create_metrics(self, tenant, factory):
        values = [
            (19_800, 17_700, 77, 91, 96, 67.3),
            (20_200, 18_950, 82, 93, 97, 74.0),
            (20_000, 18_120, 79, 92, 96, 69.8),
            (19_500, 19_080, 86, 94, 98, 79.2),
            (20_500, 19_620, 84, 95, 97, 77.4),
            (20_100, 18_780, 80, 94, 96, 72.2),
            (20_000, 18_420, 81, 92, 96.3, 71.8),
        ]
        start = timezone.localdate() - timedelta(days=6)
        codes = [
            ("planned_output", "units"),
            ("production_output", "units"),
            ("availability", "percent"),
            ("performance", "percent"),
            ("first_pass_yield", "percent"),
            ("oee", "percent"),
        ]
        for offset, day_values in enumerate(values):
            operational_date = start + timedelta(days=offset)
            for (code, unit), value in zip(codes, day_values, strict=True):
                DailyMetric.objects.update_or_create(
                    tenant=tenant,
                    factory=factory,
                    line=None,
                    machine=None,
                    operational_date=operational_date,
                    kpi_code=code,
                    definition_version="v1",
                    defaults={
                        "value": Decimal(str(value)),
                        "unit": unit,
                        "inputs": {"delta": 3.2, "direction": "up"},
                    },
                )
        DailyMetric.objects.update_or_create(
            tenant=tenant,
            factory=factory,
            line=None,
            machine=None,
            operational_date=timezone.localdate(),
            kpi_code="unplanned_downtime",
            definition_version="v1",
            defaults={
                "value": Decimal("188"),
                "unit": "minutes",
                "inputs": {"delta": 12.6, "direction": "down", "status": "critical"},
            },
        )

    def _create_losses(self, tenant, factory, line, machine):
        start = timezone.make_aware(datetime.combine(timezone.localdate(), time.min))
        for category, minutes, confidence in [
            ("Equipment failure", "187", "high"),
            ("Changeover", "109", "high"),
            ("Minor stops", "82", "medium"),
            ("Quality loss", "50", "high"),
            ("Other", "27", "low"),
        ]:
            LossEvent.objects.get_or_create(
                tenant=tenant,
                factory=factory,
                line=line,
                machine=machine if category == "Equipment failure" else None,
                period_start=start,
                period_end=start + timedelta(days=1),
                category=category,
                defaults={
                    "minutes_lost": Decimal(minutes),
                    "calculation_method": "loss-v1",
                    "confidence": confidence,
                },
            )

    def _create_alerts(self, tenant, factory, line, machine):
        now = timezone.now()
        rule, _ = AlertRule.objects.get_or_create(
            tenant=tenant,
            code="downtime-frequency",
            version="v2",
            defaults={
                "name": "Repeated machine stops",
                "metric": "downtime_events",
                "operator": "greater_than",
                "threshold": Decimal("3"),
                "time_window": "shift",
                "grouping_dimension": "machine",
                "severity": "critical",
                "recommendation_template": "Inspect the hydraulic pressure valve.",
            },
        )
        Alert.objects.get_or_create(
            tenant=tenant,
            factory=factory,
            rule=rule,
            title="Repeated stoppages on Press 04",
            defaults={
                "line": line,
                "machine": machine,
                "explanation": (
                    "Four unplanned stops exceeded the shift threshold in the last 6 hours."
                ),
                "recommendation": (
                    "Inspect the hydraulic pressure valve before the next changeover."
                ),
                "severity": "critical",
                "observed_value": "4 stops · 52 min",
                "threshold_display": "> 3 stops / shift",
                "evaluation_start": now - timedelta(hours=6),
                "evaluation_end": now,
                "input_records": ["demo-1", "demo-2", "demo-3", "demo-4"],
            },
        )

    def _create_uploads(self, tenant, factory, user):
        for filename, template, state, rows, quality in [
            ("production_today.xlsx", "production", UploadState.COMPLETED, 18_420, "99.8"),
            ("quality_shift_b.csv", "quality", UploadState.VALIDATION_REVIEW, 2_840, "97.7"),
            ("downtime_line_2.xlsx", "downtime", UploadState.MAPPING_REQUIRED, 412, "0"),
        ]:
            Upload.objects.get_or_create(
                tenant=tenant,
                factory=factory,
                original_filename=filename,
                defaults={
                    "file_type": filename.rsplit(".", 1)[-1],
                    "file_size": 1_200_000,
                    "uploaded_by": user,
                    "template_code": template,
                    "template_version": "3",
                    "status": state,
                    "record_count": rows,
                    "accepted_rows": max(rows - 32, 0),
                    "warning_rows": 32 if rows else 0,
                    "data_quality_score": Decimal(quality),
                },
            )
