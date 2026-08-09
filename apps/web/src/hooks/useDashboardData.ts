import { useCallback, useEffect, useState } from "react";
import type { DashboardFilter, DashboardResponse, SynchronizationStatus } from "@oynk/shared";

import { getDashboard, getSyncStatus } from "../lib/api";

export type ChainFilter = DashboardFilter;

export function useDashboardData(chain: ChainFilter) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState<SynchronizationStatus | null>(null);
  const [syncError, setSyncError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getDashboard(chain));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "We couldn’t load indexed activity.");
    } finally {
      setLoading(false);
    }
  }, [chain]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void getSyncStatus().then(setSyncStatus).catch(() => undefined); }, []);

  useEffect(() => {
    if (syncStatus?.state !== "RUNNING") return;
    const timer = window.setInterval(() => {
      void getSyncStatus()
        .then((status) => {
          setSyncStatus(status);
          setSyncError("");
          if (status.state !== "RUNNING") void load();
        })
        .catch((statusError) => {
          setSyncError(statusError instanceof Error ? statusError.message : "We couldn’t verify synchronization status.");
        });
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [load, syncStatus?.state]);

  return { data, loading, error, syncStatus, syncError, reload: load };
}
