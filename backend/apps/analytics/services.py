from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.analytics.models import DailyMetric, LossEvent
from apps.tenancy.models import Factory


def factory_summary(factory: Factory, days: int = 7) -> dict:
    end = timezone.localdate()
    start = end - timedelta(days=days - 1)
    metrics = DailyMetric.objects.filter(
        tenant=factory.tenant,
        factory=factory,
        line__isnull=True,
        machine__isnull=True,
        operational_date__range=(start, end),
    )

    by_code: dict[str, list[DailyMetric]] = {}
    for metric in metrics.order_by("operational_date"):
        by_code.setdefault(metric.kpi_code, []).append(metric)

    latest = {code: values[-1] for code, values in by_code.items()}
    kpi_metadata = {
        "oee": ("Overall equipment efficiency", "78%", "warning"),
        "production_output": ("Production output", "20,000 units", "good"),
        "first_pass_yield": ("First pass yield", "98%", "warning"),
        "unplanned_downtime": ("Unplanned downtime", "< 150 min", "critical"),
    }
    kpis = []
    for code, (label, target, default_status) in kpi_metadata.items():
        metric = latest.get(code)
        if metric is None:
            continue
        value = float(metric.value)
        kpis.append(
            {
                "code": code,
                "label": label,
                "value": value,
                "formattedValue": _format_metric(code, value),
                "target": f"Target {target}",
                "delta": float(metric.inputs.get("delta", 0)),
                "direction": metric.inputs.get("direction", "flat"),
                "status": metric.inputs.get("status", default_status),
                "unit": metric.unit,
            }
        )

    dates = sorted(
        set(
            date
            for values in by_code.values()
            for date in (metric.operational_date for metric in values)
        )
    )
    metric_lookup = {
        (metric.operational_date, metric.kpi_code): float(metric.value) for metric in metrics
    }
    trend = [
        {
            "label": date.strftime("%d %b"),
            "planned": metric_lookup.get((date, "planned_output"), 0),
            "actual": metric_lookup.get((date, "production_output"), 0),
            "availability": metric_lookup.get((date, "availability"), 0),
            "performance": metric_lookup.get((date, "performance"), 0),
            "quality": metric_lookup.get((date, "first_pass_yield"), 0),
            "oee": metric_lookup.get((date, "oee"), 0),
        }
        for date in dates
    ]

    loss_totals = (
        LossEvent.objects.filter(
            tenant=factory.tenant, factory=factory, period_start__date__range=(start, end)
        )
        .values("category")
        .annotate(minutes=Sum("minutes_lost"))
        .order_by("-minutes")
    )
    total_minutes = sum((item["minutes"] or Decimal(0) for item in loss_totals), Decimal(0))
    palette = ["#e65f48", "#f1a73c", "#577fbc", "#8a68b8", "#a8aeaa"]
    losses = [
        {
            "category": item["category"],
            "value": round(float((item["minutes"] or 0) / total_minutes * 100), 1)
            if total_minutes
            else 0,
            "minutes": float(item["minutes"] or 0),
            "color": palette[index % len(palette)],
        }
        for index, item in enumerate(loss_totals)
    ]
    return {"kpis": kpis, "trend": trend, "losses": losses, "inventoryRisks": []}


def _format_metric(code: str, value: float) -> str:
    if code in {"oee", "first_pass_yield"}:
        return f"{value:.1f}%"
    if code == "unplanned_downtime":
        hours, minutes = divmod(round(value), 60)
        return f"{hours}h {minutes:02d}m"
    return f"{value:,.0f}"
