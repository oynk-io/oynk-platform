import type { DashboardResponse } from "@oynk/shared";
const API = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
export async function getDashboard(chain = "ALL"): Promise<DashboardResponse> {
  const q = chain === "ALL" ? "" : `?chain=${chain}`;
  const r = await fetch(`${API}/api/dashboard${q}`);
  if (!r.ok) throw new Error("Unable to load blockchain data");
  return r.json();
}
export async function requestSync() {
  const r = await fetch(`${API}/api/sync`, { method: "POST" });
  if (!r.ok) throw new Error("Unable to start sync");
}
