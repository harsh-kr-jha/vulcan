from collections import defaultdict
from datetime import date, timedelta

from apps.operations.imports import serialize_upload
from apps.operations.models import StandardRecord, Upload
from apps.tenancy.serializers import FactoryMasterSerializer, WorkspaceFactorySerializer

DEFAULT_TARGETS = {
    "oee": 78,
    "availability": 85,
    "performance": 95,
    "quality": 98,
    "stockCoverDays": 3,
    "downtimeMinutes": 30,
}


def workspace_snapshot(identity, factory, filters):
    targets = {**DEFAULT_TARGETS, **factory.configuration.get("targets", {})}
    intelligence = build_intelligence(factory, targets, filters)
    masters = {
        kind: []
        for kind in ["lines", "machines", "skus", "materials", "suppliers", "shifts", "reasonCodes"]
    }
    for item in factory.master_records.select_related("parent").order_by("kind", "name"):
        masters[item.kind].append(FactoryMasterSerializer(item).data)
    uploads = [serialize_upload(item) for item in Upload.objects.filter(factory=factory)[:100]]
    actions = [
        {
            "id": str(item.id),
            "alertId": item.alert_key,
            "title": item.title,
            "owner": item.owner,
            "dueDate": item.due_date.isoformat(),
            "status": item.status,
            "createdAt": item.created_at.isoformat(),
        }
        for item in factory.action_items.all()
    ]
    return {
        "state": {
            "company": {
                "id": str(identity.company.id),
                "name": identity.company.name,
                "industry": factory.configuration.get("industry", "Manufacturing"),
            },
            "factories": WorkspaceFactorySerializer(
                identity.tenant.factories.filter(is_active=True), many=True
            ).data,
            "activeFactoryId": str(factory.id),
            "masters": masters,
            "uploads": uploads,
            "actions": actions,
            "targets": targets,
        },
        "intelligence": intelligence,
    }


def build_intelligence(factory, targets, filters):
    records = StandardRecord.objects.filter(factory=factory)
    from_date = parse_date(filters.get("from"))
    to_date = parse_date(filters.get("to"))
    scoped = []
    inventory_history = []
    orders = []
    for record in records.iterator():
        value = record.values
        if record.dataset_type == "inventory":
            if not to_date or not record.operational_date or record.operational_date <= to_date:
                inventory_history.append(value)
            continue
        if record.dataset_type == "orders":
            orders.append(value)
            continue
        if record.operational_date and from_date and record.operational_date < from_date:
            continue
        if record.operational_date and to_date and record.operational_date > to_date:
            continue
        if not matches_dimensions(value, filters):
            continue
        scoped.append((record.dataset_type, value))

    production = [value for kind, value in scoped if kind == "production"]
    downtime = [value for kind, value in scoped if kind == "downtime"]
    quality = [value for kind, value in scoped if kind == "quality"]
    orders = [value for value in orders if matches_dimensions(value, filters, include_shift=False)]
    inventory = latest_inventory(inventory_history)

    planned = total(production, "planned_quantity")
    actual = total(production, "actual_quantity")
    good = total(production, "good_quantity")
    rejected = total(production, "rejected_quantity")
    reworked = total(production, "reworked_quantity")
    planned_minutes = total(production, "planned_minutes")
    recorded_downtime = total(production, "downtime_minutes")
    production_downtime = recorded_downtime or total(downtime, "minutes")
    run_minutes = max(planned_minutes - production_downtime, 0)
    ideal_minutes = sum(
        number(row.get("ideal_cycle_minutes")) * number(row.get("actual_quantity"))
        for row in production
    )
    availability = min(percent(run_minutes, planned_minutes), 100)
    performance = min(percent(ideal_minutes, run_minutes), 100)
    quality_rate = min(percent(good, actual), 100)
    oee = availability * performance * quality_rate / 10_000

    inspected = total(quality, "inspected_quantity")
    quality_rejected = total(quality, "rejected_quantity")
    quality_reworked = total(quality, "reworked_quantity")
    first_pass_yield = (
        percent(max(inspected - quality_rejected - quality_reworked, 0), inspected)
        if inspected
        else quality_rate
    )
    trend, daily_oee = production_trends(production)
    machine_loss = grouped_loss(downtime, "machine", include_line=True)
    reason_loss = grouped_loss(downtime, "reason")
    defect_loss = grouped_quality(quality, "defect_reason")
    sku_quality = grouped_sku_quality(quality)
    inventory_risks = build_inventory_risks(inventory, filters.get("to"), targets)
    order_risks = build_order_risks(
        orders, filters.get("to"), good / max(len(trend), 1), machine_loss
    )
    alerts = generated_alerts(
        factory,
        filters,
        targets,
        oee,
        planned,
        actual,
        machine_loss,
        defect_loss,
        inventory_risks,
        order_risks,
    )
    uploads = Upload.objects.filter(factory=factory, status="COMPLETED")
    upload_count = uploads.count()
    quality_score = (
        sum(float(item.data_quality_score) for item in uploads) / upload_count
        if upload_count
        else 100
    )
    return {
        "totals": {
            "planned": planned,
            "actual": actual,
            "good": good,
            "rejected": quality_rejected if inspected else rejected,
            "reworked": quality_reworked if inspected else reworked,
            "planAttainment": percent(actual, planned),
            "firstPassYield": first_pass_yield,
        },
        "oee": {
            "availability": availability,
            "performance": performance,
            "quality": quality_rate,
            "value": oee,
            "plannedMinutes": planned_minutes,
            "runMinutes": run_minutes,
            "idealMinutes": ideal_minutes,
        },
        "dailyOee": daily_oee,
        "productionTrend": trend,
        "machineLoss": machine_loss,
        "reasonLoss": reason_loss,
        "defectLoss": defect_loss,
        "skuQuality": sku_quality,
        "inventoryRisks": inventory_risks,
        "orderRisks": order_risks,
        "alerts": alerts,
        "dataQuality": quality_score,
    }


def matches_dimensions(value, filters, include_shift=True):
    keys = ["line", "machine", "sku"] + (["shift"] if include_shift else [])
    return all(filters.get(key, "all") in {"", "all", value.get(key)} for key in keys)


def production_trends(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[str(row.get("date", ""))].append(row)
    trend = []
    daily_oee = []
    for day, values in sorted(grouped.items()):
        planned = total(values, "planned_quantity")
        actual = total(values, "actual_quantity")
        good = total(values, "good_quantity")
        planned_minutes = total(values, "planned_minutes")
        run = max(planned_minutes - total(values, "downtime_minutes"), 0)
        ideal = sum(
            number(row.get("ideal_cycle_minutes")) * number(row.get("actual_quantity"))
            for row in values
        )
        value = percent(run, planned_minutes) * percent(ideal, run) * percent(good, actual) / 10_000
        trend.append({"date": day, "planned": planned, "actual": actual, "good": good})
        daily_oee.append({"date": day, "value": value})
    return trend, daily_oee


def grouped_loss(rows, key, include_line=False):
    grouped = {}
    for row in rows:
        name = str(row.get(key) or "Unclassified")
        item = grouped.setdefault(
            name,
            {
                key: name,
                "minutes": 0,
                "occurrences": 0,
                **({"line": row.get("line", "")} if include_line else {}),
            },
        )
        item["minutes"] += number(row.get("minutes"))
        item["occurrences"] += number(row.get("occurrences"), 1)
    return sorted(grouped.values(), key=lambda item: item["minutes"], reverse=True)


def grouped_quality(rows, key):
    grouped = {}
    for row in rows:
        name = str(row.get(key) or "Unclassified")
        item = grouped.setdefault(name, {"reason": name, "rejected": 0, "reworked": 0})
        item["rejected"] += number(row.get("rejected_quantity"))
        item["reworked"] += number(row.get("reworked_quantity"))
    return sorted(grouped.values(), key=lambda item: item["rejected"], reverse=True)


def grouped_sku_quality(rows):
    grouped = {}
    for row in rows:
        sku = str(row.get("sku") or "Unassigned")
        item = grouped.setdefault(sku, {"sku": sku, "inspected": 0, "rejected": 0})
        item["inspected"] += number(row.get("inspected_quantity"))
        item["rejected"] += number(row.get("rejected_quantity"))
    for item in grouped.values():
        item["rejectionRate"] = percent(item["rejected"], item["inspected"])
    return sorted(grouped.values(), key=lambda item: item["rejectionRate"], reverse=True)


def latest_inventory(rows):
    latest = {}
    for row in rows:
        material = str(row.get("material") or "Unassigned")
        if material not in latest or str(latest[material].get("date", "")) < str(
            row.get("date", "")
        ):
            latest[material] = row
    return list(latest.values())


def build_inventory_risks(rows, to_value, targets):
    result = []
    end = parse_date(to_value) or date.today()
    for index, row in enumerate(rows):
        available = number(row.get("available_quantity"))
        consumption = number(row.get("daily_consumption"))
        stock_days = available / consumption if consumption else 999
        status = str(row.get("receipt_status", "unknown")).lower()
        if stock_days < max(targets["stockCoverDays"] * 2, 7) or status == "delayed":
            result.append(
                {
                    "id": f"inventory-{index}-{row.get('material', '')}",
                    "material": row.get("material", "Unassigned"),
                    "supplier": row.get("supplier", "Unknown supplier"),
                    "availableQuantity": available,
                    "dailyConsumption": consumption,
                    "stockDays": stock_days,
                    "projectedStockout": (end + timedelta(days=int(stock_days))).isoformat(),
                    "receiptStatus": status,
                    "expectedReceiptDate": row.get("expected_receipt_date"),
                }
            )
    return sorted(result, key=lambda item: item["stockDays"])


def build_order_risks(rows, to_value, average_daily_good, machine_loss):
    end = parse_date(to_value) or date.today()
    result = []
    for row in rows:
        if str(row.get("status", "open")).lower() == "completed":
            continue
        required = number(row.get("required_quantity"))
        produced = number(row.get("produced_quantity"))
        remaining = max(required - produced, 0)
        due = parse_date(row.get("due_date")) or end
        days_left = max((due - end).days, 0.25)
        risk_score = (remaining / days_left) / max(average_daily_good, 1)
        risk = (
            "critical" if days_left <= 1 and remaining else "high" if risk_score > 0.5 else "watch"
        )
        reason = (
            f"{machine_loss[0]['machine']} lost {machine_loss[0]['minutes']:g} minutes"
            if machine_loss
            else "Required run rate is above the recent average"
        )
        result.append(
            {
                "orderId": row.get("order_id", "Unassigned"),
                "sku": row.get("sku", "Unassigned"),
                "dueDate": due.isoformat(),
                "completion": percent(produced, required),
                "remaining": remaining,
                "risk": risk,
                "reason": reason,
            }
        )
    weights = {"critical": 0, "high": 1, "watch": 2}
    return sorted(result, key=lambda item: weights[item["risk"]])


def generated_alerts(
    factory,
    filters,
    targets,
    oee,
    planned,
    actual,
    machine_loss,
    defect_loss,
    inventory_risks,
    order_risks,
):
    alerts = []
    end = filters.get("to") or date.today().isoformat()
    if order_risks:
        order = order_risks[0]
        alerts.append(
            alert(
                f"order-{order['orderId']}",
                f"{order['orderId']} is at risk",
                f"{order['remaining']:g} units remain before {order['dueDate']}.",
                f"{order['sku']} · Orders",
                "critical" if order["risk"] == "critical" else "high",
                "Re-sequence the constrained line and secure material before "
                "committing the next shift.",
                "Projected completion > due date",
                f"{order['completion']:.1f}% complete",
                end,
                [order["orderId"], order["reason"]],
            )
        )
    if machine_loss and machine_loss[0]["minutes"] > targets["downtimeMinutes"]:
        loss = machine_loss[0]
        alerts.append(
            alert(
                f"downtime-{loss['machine']}",
                f"{loss['machine']} is the largest bottleneck",
                f"{loss['minutes']:g} lost minutes across {loss['occurrences']:g} stops.",
                f"{loss['machine']} · {loss['line']}",
                "critical" if loss["minutes"] > 120 else "high",
                "Inspect the recurring failure mode before the next planned changeover "
                "and assign maintenance ownership.",
                f"> {targets['downtimeMinutes']} lost min",
                f"{loss['minutes']:g} min",
                end,
                [f"{loss['occurrences']:g} stop records", f"{loss['minutes']:g} minutes"],
            )
        )
    if inventory_risks:
        item = inventory_risks[0]
        alerts.append(
            alert(
                f"inventory-{item['material']}",
                f"{item['material']} stock-out projected",
                f"Current stock covers {item['stockDays']:.1f} production days.",
                f"{item['supplier']} · Inventory",
                "critical" if item["stockDays"] < 2 else "high",
                "Expedite the receipt or re-sequence orders that consume this material.",
                f"< {targets['stockCoverDays']} days cover",
                f"{item['stockDays']:.1f} days",
                end,
                [
                    f"{item['availableQuantity']:g} available",
                    f"{item['dailyConsumption']:g}/day consumption",
                ],
            )
        )
    if planned and oee < targets["oee"]:
        alerts.append(
            alert(
                "oee-below-target",
                "Factory OEE is below target",
                f"OEE is {oee:.1f}%, driven by the current availability and loss profile.",
                "Factory performance",
                "high" if oee < 65 else "medium",
                "Prioritise the top bottleneck before pursuing speed improvements.",
                f"< {targets['oee']}%",
                f"{oee:.1f}%",
                end,
                [f"Plan attainment {percent(actual, planned):.1f}%", f"OEE {oee:.1f}%"],
            )
        )
    if defect_loss:
        defect = defect_loss[0]
        alerts.append(
            alert(
                f"quality-{defect['reason']}",
                f"{defect['reason']} leads quality loss",
                f"{defect['rejected']:g} rejected units share this defect reason.",
                "Quality · Rejections",
                "medium",
                "Verify the process parameter at first-piece approval and sample "
                "the next three batches.",
                "Top defect reason",
                f"{defect['rejected']:g} rejected",
                end,
                [f"{defect['rejected']:g} rejected records"],
            )
        )
    statuses = factory.configuration.get("alertStatuses", {})
    return [
        {**item, "status": statuses.get(item["id"], "new")}
        for item in alerts
        if statuses.get(item["id"]) != "dismissed"
    ]


def alert(
    key,
    title,
    description,
    asset,
    severity,
    recommendation,
    threshold,
    observed,
    occurred_at,
    evidence,
):
    return {
        "id": key,
        "title": title,
        "description": description,
        "asset": asset,
        "severity": severity,
        "occurredAt": occurred_at,
        "relativeTime": "Selected period",
        "recommendation": recommendation,
        "threshold": threshold,
        "observed": observed,
        "ruleVersion": "factory-rules-v1",
        "evidence": evidence,
    }


def answer_question(intelligence, question):
    normalized = question.casefold()
    if "order" in normalized and intelligence["orderRisks"]:
        item = intelligence["orderRisks"][0]
        return response(
            f"{item['orderId']} ({item['sku']}) needs attention first: "
            f"{item['remaining']:g} units remain.",
            item["reason"],
            [item["orderId"], f"Due {item['dueDate']}"],
        )
    if any(word in normalized for word in ["machine", "bottleneck", "loss"]):
        items = intelligence["machineLoss"]
        if items:
            item = items[0]
            return response(
                f"{item['machine']} is creating the largest bottleneck.",
                f"It lost {item['minutes']:g} minutes across {item['occurrences']:g} stops.",
                [item["machine"], item["line"]],
            )
    if any(word in normalized for word in ["material", "stock"]):
        items = intelligence["inventoryRisks"]
        if items:
            item = items[0]
            return response(
                f"{item['material']} may run out first, with "
                f"{item['stockDays']:.1f} days of cover.",
                f"The current receipt status is {item['receiptStatus']}.",
                [item["material"]],
            )
    totals = intelligence["totals"]
    return response(
        f"Production is {totals['planAttainment']:.1f}% of plan.",
        "This answer uses only validated records in the selected factory and date range.",
        [f"Plan {totals['planned']:g}", f"Actual {totals['actual']:g}"],
    )


def response(answer, reasoning, evidence):
    return {"answer": answer, "reasoning": reasoning, "evidence": evidence}


def number(value, fallback=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def total(rows, key):
    return sum(number(row.get(key)) for row in rows)


def percent(numerator, denominator):
    return numerator / denominator * 100 if denominator else 0


def parse_date(value):
    try:
        return date.fromisoformat(str(value)) if value else None
    except ValueError:
        return None
