import type {
  DashboardResponse,
  OnchainTransferRow,
  SynchronizationStatus,
  TimelinePoint,
  TransferRow,
} from "@oynk/shared";
const API = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(
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
  const normalized: DashboardResponse = {
    ...dashboard,
    metrics: {
      ...dashboard.metrics,
      onchainVolumeUsd:
        dashboard.metrics.onchainVolumeUsd ?? dashboard.metrics.totalUsd ?? 0,
      offchainVolumeUsd: dashboard.metrics.offchainVolumeUsd ?? 0,
      settlementCount:
        dashboard.metrics.settlementCount ??
        dashboard.metrics.pairedTransferCount ??
        0,
    },
    transfers: (dashboard.transfers as Array<TransferRow | Omit<OnchainTransferRow, "settlementRoute">>).map((transfer) =>
      "settlementRoute" in transfer
        ? transfer
        : { ...transfer, settlementRoute: "ONCHAIN" },
    ),
  };

  if (normalized.timeline.length === 0 && normalized.transfers.length > 0) {
    return {
      ...normalized,
      timeline: timelineFromTransfers(normalized.transfers),
    };
  }

  return normalized;
}
export async function getSyncStatus(): Promise<SynchronizationStatus> {
  const response = await fetch(`${API}/api/sync/status`);
  if (response.ok) return response.json();
  throw new Error("Unable to check synchronization status");
}
