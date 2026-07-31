import type { DashboardFilters, FactoryState, InventoryRecord } from "./factory-domain";

export interface IntelligenceAlert {
  id: string;
  title: string;
  description: string;
  asset: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "new" | "acknowledged" | "resolved" | "dismissed";
  occurredAt: string;
  relativeTime: string;
  recommendation: string;
  threshold: string;
  observed: string;
  ruleVersion: string;
  evidence: string[];
}

export interface OrderRisk {
  orderId: string;
  sku: string;
  dueDate: string;
  completion: number;
  remaining: number;
  risk: "critical" | "high" | "watch";
  reason: string;
}

function matches(record: { factoryId: string; date?: string; line?: string; machine?: string; sku?: string; shift?: string }, filters: DashboardFilters) {
  return record.factoryId === filters.factoryId &&
    (!record.date || (record.date >= filters.from && record.date <= filters.to)) &&
    (filters.line === "all" || record.line === filters.line) &&
    (filters.machine === "all" || record.machine === filters.machine) &&
    (filters.sku === "all" || record.sku === filters.sku) &&
    (filters.shift === "all" || record.shift === filters.shift);
}

function sum<T>(rows: T[], selector: (row: T) => number) {
  return rows.reduce((total, row) => total + selector(row), 0);
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function daysBetween(from: string, to: string) {
  return Math.ceil((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);
}

export function buildIntelligence(state: FactoryState, filters: DashboardFilters) {
  const production = state.data.production.filter((row) => matches(row, filters));
  const downtime = state.data.downtime.filter((row) => matches(row, filters));
  const quality = state.data.quality.filter((row) => matches(row, filters));
  const inventoryHistory = state.data.inventory.filter((row) => row.factoryId === filters.factoryId && row.date <= filters.to);
  const inventory = Object.values(inventoryHistory.reduce<Record<string, InventoryRecord>>((latest, row) => {
    if (!latest[row.material] || latest[row.material].date < row.date) latest[row.material] = row;
    return latest;
  }, {}));
  const orders = state.data.orders.filter((row) => row.factoryId === filters.factoryId && (filters.sku === "all" || row.sku === filters.sku) && (filters.line === "all" || row.line === filters.line));

  const planned = sum(production, (row) => row.plannedQuantity);
  const actual = sum(production, (row) => row.actualQuantity);
  const good = sum(production, (row) => row.goodQuantity);
  const rejected = sum(production, (row) => row.rejectedQuantity);
  const reworked = sum(production, (row) => row.reworkedQuantity);
  const plannedMinutes = sum(production, (row) => row.plannedMinutes);
  const recordedProductionDowntime = sum(production, (row) => row.downtimeMinutes);
  const productionDowntime = recordedProductionDowntime || sum(downtime, (row) => row.minutes);
  const runMinutes = Math.max(plannedMinutes - productionDowntime, 0);
  const idealMinutes = sum(production, (row) => row.idealCycleMinutes * row.actualQuantity);
  const availability = Math.min(percent(runMinutes, plannedMinutes), 100);
  const performance = Math.min(percent(idealMinutes, runMinutes), 100);
  const qualityRate = Math.min(percent(good, actual), 100);
  const oee = (availability * performance * qualityRate) / 10_000;

  const inspected = sum(quality, (row) => row.inspectedQuantity);
  const qualityRejected = sum(quality, (row) => row.rejectedQuantity);
  const qualityReworked = sum(quality, (row) => row.reworkedQuantity);
  const firstPassYield = inspected > 0 ? percent(Math.max(inspected - qualityRejected - qualityReworked, 0), inspected) : qualityRate;

  const dates = [...new Set(production.map((row) => row.date))].sort();
  const productionTrend = dates.map((date) => {
    const rows = production.filter((row) => row.date === date);
    return { date, planned: sum(rows, (row) => row.plannedQuantity), actual: sum(rows, (row) => row.actualQuantity), good: sum(rows, (row) => row.goodQuantity) };
  });

  const machineLoss = Object.values(downtime.reduce<Record<string, { machine: string; line: string; minutes: number; occurrences: number }>>((acc, row) => {
    const current = acc[row.machine] ?? { machine: row.machine, line: row.line, minutes: 0, occurrences: 0 };
    current.minutes += row.minutes;
    current.occurrences += row.occurrences;
    acc[row.machine] = current;
    return acc;
  }, {})).sort((a, b) => b.minutes - a.minutes);

  const reasonLoss = Object.values(downtime.reduce<Record<string, { reason: string; minutes: number; occurrences: number }>>((acc, row) => {
    const current = acc[row.reason] ?? { reason: row.reason, minutes: 0, occurrences: 0 };
    current.minutes += row.minutes;
    current.occurrences += row.occurrences;
    acc[row.reason] = current;
    return acc;
  }, {})).sort((a, b) => b.minutes - a.minutes);

  const defectLoss = Object.values(quality.reduce<Record<string, { reason: string; rejected: number; reworked: number }>>((acc, row) => {
    const current = acc[row.defectReason] ?? { reason: row.defectReason, rejected: 0, reworked: 0 };
    current.rejected += row.rejectedQuantity;
    current.reworked += row.reworkedQuantity;
    acc[row.defectReason] = current;
    return acc;
  }, {})).sort((a, b) => b.rejected - a.rejected);

  const skuQuality = Object.values(quality.reduce<Record<string, { sku: string; inspected: number; rejected: number }>>((acc, row) => {
    const current = acc[row.sku] ?? { sku: row.sku, inspected: 0, rejected: 0 };
    current.inspected += row.inspectedQuantity;
    current.rejected += row.rejectedQuantity;
    acc[row.sku] = current;
    return acc;
  }, {})).map((item) => ({ ...item, rejectionRate: percent(item.rejected, item.inspected) })).sort((a, b) => b.rejectionRate - a.rejectionRate);

  const inventoryRisks = inventory.map((row) => ({
    ...row,
    stockDays: row.dailyConsumption > 0 ? row.availableQuantity / row.dailyConsumption : 999,
    projectedStockout: addDays(filters.to, row.dailyConsumption > 0 ? Math.floor(row.availableQuantity / row.dailyConsumption) : 365),
  })).filter((row) => row.stockDays < Math.max(state.targets.stockCoverDays * 2, 7) || row.receiptStatus === "delayed").sort((a, b) => a.stockDays - b.stockDays);

  const averageDailyGood = good / Math.max(dates.length, 1);
  const orderRisks: OrderRisk[] = orders.filter((order) => order.status !== "completed").map((order) => {
    const remaining = Math.max(order.requiredQuantity - order.producedQuantity, 0);
    const daysLeft = Math.max(daysBetween(filters.to, order.dueDate), 0.25);
    const requiredRate = remaining / daysLeft;
    const bottleneck = machineLoss[0];
    const riskScore = requiredRate / Math.max(averageDailyGood, 1);
    const risk: OrderRisk["risk"] = daysLeft <= 1 && remaining > 0 ? "critical" : riskScore > 0.5 ? "high" : "watch";
    const reason = bottleneck ? `${bottleneck.machine} lost ${bottleneck.minutes} minutes` : "Required run rate is above the recent average";
    return { orderId: order.orderId, sku: order.sku, dueDate: order.dueDate, completion: percent(order.producedQuantity, order.requiredQuantity), remaining, risk, reason };
  }).sort((a, b) => {
    const weights: Record<OrderRisk["risk"], number> = { critical: 0, high: 1, watch: 2 };
    return weights[a.risk] - weights[b.risk];
  });

  const alerts = generateAlerts(state, filters, { oee, actual, planned, machineLoss, defectLoss, inventoryRisks, orderRisks });
  const factoryUploads = state.uploads.filter((upload) => upload.factoryId === filters.factoryId);
  const dataQuality = factoryUploads.reduce((total, upload) => total + upload.dataQualityScore / Math.max(factoryUploads.length, 1), 0);

  return {
    production,
    downtime,
    quality,
    inventory,
    orders,
    totals: { planned, actual, good, rejected: inspected > 0 ? qualityRejected : rejected, reworked: inspected > 0 ? qualityReworked : reworked, planAttainment: percent(actual, planned), firstPassYield },
    oee: { availability, performance, quality: qualityRate, value: oee, plannedMinutes, runMinutes, idealMinutes },
    productionTrend,
    machineLoss,
    reasonLoss,
    defectLoss,
    skuQuality,
    inventoryRisks,
    orderRisks,
    alerts,
    dataQuality: factoryUploads.length ? dataQuality : 100,
  };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function generateAlerts(state: FactoryState, filters: DashboardFilters, values: { oee: number; actual: number; planned: number; machineLoss: { machine: string; line: string; minutes: number; occurrences: number }[]; defectLoss: { reason: string; rejected: number }[]; inventoryRisks: (InventoryRecord & { stockDays: number })[]; orderRisks: OrderRisk[] }): IntelligenceAlert[] {
  const generated: Omit<IntelligenceAlert, "status">[] = [];
  const attainment = percent(values.actual, values.planned);
  if (values.orderRisks[0]) generated.push({ id: `order-${values.orderRisks[0].orderId}`, title: `${values.orderRisks[0].orderId} is at risk`, description: `${values.orderRisks[0].remaining.toLocaleString("en-IN")} units remain before ${values.orderRisks[0].dueDate}.`, asset: `${values.orderRisks[0].sku} · Orders`, severity: values.orderRisks[0].risk === "critical" ? "critical" : "high", occurredAt: filters.to, relativeTime: "Current plan", recommendation: `Re-sequence the constrained line and secure material before committing the next shift. ${values.orderRisks[0].reason}.`, threshold: "Projected completion > due date", observed: `${values.orderRisks[0].completion.toFixed(1)}% complete`, ruleVersion: "order-risk-v1", evidence: [values.orderRisks[0].orderId, values.orderRisks[0].reason] });
  if (values.machineLoss[0] && values.machineLoss[0].minutes > state.targets.downtimeMinutes) generated.push({ id: `downtime-${values.machineLoss[0].machine}`, title: `${values.machineLoss[0].machine} is the largest bottleneck`, description: `${values.machineLoss[0].minutes} lost minutes across ${values.machineLoss[0].occurrences} stops.`, asset: `${values.machineLoss[0].machine} · ${values.machineLoss[0].line}`, severity: values.machineLoss[0].minutes > 120 ? "critical" : "high", occurredAt: filters.to, relativeTime: "This period", recommendation: "Inspect the recurring failure mode before the next planned changeover and assign maintenance ownership.", threshold: `> ${state.targets.downtimeMinutes} lost min`, observed: `${values.machineLoss[0].minutes} min`, ruleVersion: "bottleneck-v2", evidence: [`${values.machineLoss[0].occurrences} stop records`, `${values.machineLoss[0].minutes} minutes`] });
  if (values.inventoryRisks[0]) generated.push({ id: `inventory-${values.inventoryRisks[0].material}`, title: `${values.inventoryRisks[0].material} stock-out projected`, description: `Current stock covers ${values.inventoryRisks[0].stockDays.toFixed(1)} production days.`, asset: `${values.inventoryRisks[0].supplier} · Inventory`, severity: values.inventoryRisks[0].stockDays < Math.max(1, state.targets.stockCoverDays * 0.67) ? "critical" : "high", occurredAt: filters.to, relativeTime: "Current stock", recommendation: values.inventoryRisks[0].receiptStatus === "delayed" ? "Expedite the delayed receipt or re-sequence orders that consume this material." : "Confirm supplier dispatch and protect safety stock for priority orders.", threshold: `< ${state.targets.stockCoverDays} days cover`, observed: `${values.inventoryRisks[0].stockDays.toFixed(1)} days`, ruleVersion: "inventory-cover-v1", evidence: [`${values.inventoryRisks[0].availableQuantity} available`, `${values.inventoryRisks[0].dailyConsumption}/day consumption`] });
  if (values.oee < state.targets.oee) generated.push({ id: "oee-below-target", title: "Factory OEE is below target", description: `OEE is ${values.oee.toFixed(1)}%, driven by the current availability and loss profile.`, asset: "Factory performance", severity: values.oee < 65 ? "high" : "medium", occurredAt: filters.to, relativeTime: "This period", recommendation: `Prioritise the top bottleneck before pursuing speed improvements. Production attainment is ${attainment.toFixed(1)}%.`, threshold: `< ${state.targets.oee}%`, observed: `${values.oee.toFixed(1)}%`, ruleVersion: "oee-target-v1", evidence: [`Plan attainment ${attainment.toFixed(1)}%`, `OEE ${values.oee.toFixed(1)}%`] });
  if (values.defectLoss[0]) generated.push({ id: `quality-${values.defectLoss[0].reason}`, title: `${values.defectLoss[0].reason} leads quality loss`, description: `${values.defectLoss[0].rejected} rejected units share this defect reason.`, asset: "Quality · Rejections", severity: "medium", occurredAt: filters.to, relativeTime: "This period", recommendation: "Verify the process parameter at first-piece approval and sample the next three batches.", threshold: "Top defect reason", observed: `${values.defectLoss[0].rejected} rejected`, ruleVersion: "quality-pareto-v1", evidence: [`${values.defectLoss[0].rejected} rejected records`] });
  return generated.map((alert) => ({ ...alert, status: state.alertStatuses[alert.id] ?? "new" })).filter((alert) => alert.status !== "dismissed");
}

export function answerOperationalQuestion(question: string, state: FactoryState, filters: DashboardFilters) {
  const data = buildIntelligence(state, filters);
  const normalized = question.toLowerCase();
  if (normalized.includes("order")) {
    const risk = data.orderRisks[0];
    return risk ? { answer: `${risk.orderId} (${risk.sku}) needs attention first: ${risk.remaining.toLocaleString("en-IN")} units remain and it is only ${risk.completion.toFixed(1)}% complete.`, reasoning: risk.reason, evidence: [risk.orderId, `Due ${risk.dueDate}`, `${risk.completion.toFixed(1)}% complete`] } : { answer: "No open order is currently projected to miss its due date.", reasoning: "All open orders fit the recent good-output run rate.", evidence: [] };
  }
  if (normalized.includes("below plan") || normalized.includes("production")) return { answer: `Production is ${data.totals.planAttainment.toFixed(1)}% of plan, a gap of ${(data.totals.planned - data.totals.actual).toLocaleString("en-IN")} units.`, reasoning: data.machineLoss[0] ? `${data.machineLoss[0].machine} is the largest measured constraint with ${data.machineLoss[0].minutes} lost minutes.` : "No downtime cause is available for the selected filter.", evidence: [`Plan ${data.totals.planned.toLocaleString("en-IN")}`, `Actual ${data.totals.actual.toLocaleString("en-IN")}`, data.machineLoss[0]?.machine ?? "No bottleneck"] };
  if (normalized.includes("machine") || normalized.includes("bottleneck")) { const top = data.machineLoss[0]; return top ? { answer: `${top.machine} is creating the largest bottleneck.`, reasoning: `It lost ${top.minutes} minutes across ${top.occurrences} stops, more than any other selected asset.`, evidence: [top.machine, top.line, `${top.minutes} min`, `${top.occurrences} stops`] } : { answer: "No bottleneck data exists for this selection.", reasoning: "Add downtime records to compare assets.", evidence: [] }; }
  if (normalized.includes("material") || normalized.includes("stock")) { const risk = data.inventoryRisks[0]; return risk ? { answer: `${risk.material} may run out first, with ${risk.stockDays.toFixed(1)} days of cover.`, reasoning: risk.receiptStatus === "delayed" ? `The ${risk.supplier} receipt is marked delayed.` : "Consumption will reach safety stock before the next planning window.", evidence: [risk.material, `${risk.availableQuantity} available`, `${risk.dailyConsumption}/day`] } : { answer: "No material is below the seven-day risk horizon.", reasoning: "Current balances cover expected daily consumption.", evidence: [] }; }
  if (normalized.includes("loss")) { const top = data.reasonLoss[0]; return top ? { answer: `${top.reason} caused the most production loss: ${top.minutes} minutes.`, reasoning: `It occurred ${top.occurrences} times in the selected period.`, evidence: [top.reason, `${top.minutes} min`, `${top.occurrences} events`] } : { answer: "No loss events are available for this selection.", reasoning: "Upload downtime records to calculate loss.", evidence: [] }; }
  if (normalized.includes("rejection") || normalized.includes("quality") || normalized.includes("product")) { const sku = data.skuQuality[0]; return sku ? { answer: `${sku.sku} has the highest rejection rate at ${sku.rejectionRate.toFixed(2)}%.`, reasoning: data.defectLoss[0] ? `${data.defectLoss[0].reason} is the leading defect reason.` : "No defect reason is available.", evidence: [sku.sku, `${sku.rejected} rejected`, `${sku.inspected} inspected`] } : { answer: "No quality records are available for this selection.", reasoning: "Upload rejection or inspection data first.", evidence: [] }; }
  const first = data.alerts.find((alert) => alert.status !== "resolved");
  return first ? { answer: `Act on “${first.title}” first.`, reasoning: first.recommendation, evidence: first.evidence } : { answer: "No immediate priority issue is active for the selected filters.", reasoning: "All configured thresholds are currently within range.", evidence: [] };
}
