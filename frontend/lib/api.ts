import "server-only";

import { cookies } from "next/headers";
import { alerts, inventoryRisks, kpis, losses, uploads, weeklyTrend } from "./demo-data";
import type { OperationalAlert, UploadRecord } from "./types";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!API_URL) return null;

  try {
    const cookieHeader = (await cookies()).toString();
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...init?.headers,
      },
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`API request failed with ${response.status}`);
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getDashboardSummary() {
  return (
    (await apiRequest<{
      kpis: typeof kpis;
      trend: typeof weeklyTrend;
      losses: typeof losses;
      inventoryRisks: typeof inventoryRisks;
    }>("/api/performance/summary/")) ?? { kpis, trend: weeklyTrend, losses, inventoryRisks }
  );
}

export async function getAlerts(): Promise<OperationalAlert[]> {
  const response = await apiRequest<OperationalAlert[] | { results: OperationalAlert[] }>(
    "/api/alerts/",
  );
  if (!response) return alerts;
  return Array.isArray(response) ? response : response.results;
}

export async function getUploads(): Promise<UploadRecord[]> {
  const response = await apiRequest<UploadRecord[] | { results: UploadRecord[] }>(
    "/api/uploads/",
  );
  if (!response) return uploads;
  return Array.isArray(response) ? response : response.results;
}
