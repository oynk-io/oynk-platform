import type {
  DashboardResponse,
  SynchronizationStatus,
  TimelinePoint,
  TransferRow,
} from "@oynk/shared";
const API = (import.meta.env.VITE_API_URL ?? "https://api.oynk.io").replace(
  /\/+$/,
  ""
);

const TIMELINE_WINDOW_MS = 365 * 24 * 60 * 60 * 1_000;

function timelineFromTransfers(
  transfers: TransferRow[],
  now = Date.now(),
): TimelinePoint[] {
  const cutoff = now - TIMELINE_WINDOW_MS;
  const points = new Map<string, TimelinePoint>();

  for (const transfer of transfers) {
    const timestamp = new Date(transfer.timestamp).getTime();
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > now) continue;

    const date = transfer.timestamp.slice(0, 10);
    const usdValue = Number(transfer.usdValue);
    if (!Number.isFinite(usdValue)) continue;

    const point = points.get(date) ?? {
      date,
      inflowUsd: 0,
      outflowUsd: 0,
      totalUsd: 0,
      transferCount: 0,
    };

    point.totalUsd += usdValue;
    point.transferCount += 1;
    if (transfer.direction === "INFLOW") point.inflowUsd += usdValue;
    else point.outflowUsd += usdValue;
    points.set(date, point);
  }

  return [...points.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

export async function getDashboard(chain = "ALL"): Promise<DashboardResponse> {
  const q = chain === "ALL" ? "" : `?chain=${chain}`;
  const r = await fetch(`${API}/api/dashboard${q}`);
  if (!r.ok) throw new Error("Unable to load blockchain data");
  const dashboard = (await r.json()) as DashboardResponse;

  if (dashboard.timeline.length === 0 && dashboard.transfers.length > 0) {
    return {
      ...dashboard,
      timeline: timelineFromTransfers(dashboard.transfers),
    };
  }

  return dashboard;
}
export async function getSyncStatus(): Promise<SynchronizationStatus> {
  const r = await fetch(`${API}/api/dashboard/sync`);
  if (!r.ok) throw new Error("Unable to check synchronization status");
  return r.json();
}
