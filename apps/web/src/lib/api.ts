import type {
  DashboardResponse,
  SynchronizationStatus,
} from "@oynk/shared";
const API = (import.meta.env.VITE_API_URL ?? "").replace(
  /\/+$/,
  ""
);
export async function getDashboard(chain = "ALL"): Promise<DashboardResponse> {
  const q = chain === "ALL" ? "" : `?chain=${chain}`;
  const r = await fetch(`${API}/api/dashboard${q}`);
  if (!r.ok) throw new Error("Unable to load blockchain data");
  return r.json();
}
export async function getSyncStatus(): Promise<SynchronizationStatus> {
  const r = await fetch(`${API}/api/dashboard/sync`);
  if (!r.ok) throw new Error("Unable to check synchronization status");
  return r.json();
}
