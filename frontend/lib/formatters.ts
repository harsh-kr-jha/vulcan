export function formatDuration(minutes: number | null | undefined, empty = "Not reported") {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return empty;
  if (Math.abs(minutes) >= 60) {
    const hours = minutes / 60;
    return `${hours.toLocaleString("en-IN", { maximumFractionDigits: 1 })} hr`;
  }
  return `${minutes.toLocaleString("en-IN", { maximumFractionDigits: 1 })} min`;
}
