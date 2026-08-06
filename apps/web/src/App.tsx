import { useCallback, useEffect, useState } from "react";
import type { Chain, DashboardResponse, SynchronizationStatus } from "@oynk/shared";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import { getDashboard, getSyncStatus } from "./lib/api";
import { CHAIN_METADATA } from "./lib/chains";
import { formatRelativeTime, formatUsd } from "./lib/format";
import { MetricCard } from "./components/MetricCard";
import { TransferTable } from "./components/TransferTable";
import { VolumeChart } from "./components/VolumeChart";

type ChainFilter = "ALL" | Chain;

function DashboardSkeleton() {
  return (
    <div aria-label="Loading indexed transaction activity" role="status" className="animate-pulse">
      <span className="sr-only">Loading indexed transaction activity</span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-36 rounded-2xl border border-white/6 bg-white/[.035]" />)}
      </div>
      <div className="mt-6 h-[370px] rounded-2xl border border-white/6 bg-white/[.035]" />
      <div className="mt-6 h-80 rounded-2xl border border-white/6 bg-white/[.035]" />
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [chain, setChain] = useState<ChainFilter>("ALL");
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
      setError(loadError instanceof Error ? loadError.message : "Unable to load indexed activity");
    } finally {
      setLoading(false);
    }
  }, [chain]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void getSyncStatus().then(setSyncStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (syncStatus?.state !== "RUNNING") return;
    const timer = window.setInterval(() => {
      void getSyncStatus()
        .then((status) => {
          setSyncStatus(status);
          if (status.state !== "RUNNING") void load();
        })
        .catch((statusError) => {
          setSyncError(statusError instanceof Error ? statusError.message : "Unable to check synchronization status");
        });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [load, syncStatus?.state]);

  const syncing = syncStatus?.state === "RUNNING";
  const syncMessage = syncError
    ? syncError
    : syncStatus?.state === "PARTIAL"
      ? `Synchronization completed with errors on ${syncStatus.failedChains.join(", ")}.`
      : syncStatus?.state === "FAILED"
        ? "Synchronization failed. Indexed data was not refreshed."
        : syncStatus?.state === "COMPLETED"
          ? "Synchronization completed and dashboard data was refreshed."
          : "";

  return (
    <main className="dashboard-page min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#07110e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300" aria-label="Return to Oynk home">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-300 font-black text-[#07110e]">O</div>
            <div className="min-w-0"><div className="truncate font-semibold text-white">Oynk</div><div className="hidden text-xs text-slate-500 sm:block">On-chain activity index</div></div>
          </a>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[.03] px-3 py-2 text-xs text-slate-400 lg:flex">
              <span className={`h-2 w-2 rounded-full ${syncing ? "animate-pulse bg-amber-300" : "bg-emerald-300"}`} />
              {syncing ? "Indexing in progress" : data?.metrics.lastSyncedAt ? `Indexed ${formatRelativeTime(data.metrics.lastSyncedAt)}` : "Awaiting first index"}
            </div>
            <label><span className="sr-only">Filter dashboard by blockchain</span><select value={chain} onChange={(event) => setChain(event.target.value as ChainFilter)} className="control max-w-[145px] sm:max-w-none"><option value="ALL">All chains</option><option value="BSC">{CHAIN_METADATA.BSC.label}</option><option value="SOLANA">{CHAIN_METADATA.SOLANA.label}</option></select></label>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="mb-2 text-sm font-medium text-emerald-300">Activity overview</p><h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Indexed on-chain transactions</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Monitor token movement across tracked BNB Smart Chain and Solana wallets, with direct links to on-chain records.</p></div>
          <div className="grid grid-cols-2 gap-x-7 gap-y-1 text-xs lg:text-right"><span className="text-slate-500">Last index update</span><span className="text-slate-300">{data?.metrics.lastSyncedAt ? new Date(data.metrics.lastSyncedAt).toLocaleString() : "Not available"}</span><span className="text-slate-500">Latest transaction</span><span className="text-slate-300">{data?.metrics.latestTransactionAt ? new Date(data.metrics.latestTransactionAt).toLocaleString() : "None indexed"}</span></div>
        </div>

        {syncMessage && <div role="status" aria-live="polite" className={`mb-5 rounded-xl border p-4 text-sm ${syncError || syncStatus?.state === "FAILED" ? "border-red-300/20 bg-red-300/8 text-red-200" : syncStatus?.state === "PARTIAL" ? "border-amber-300/20 bg-amber-300/8 text-amber-100" : "border-emerald-300/20 bg-emerald-300/8 text-emerald-200"}`}>{syncMessage}</div>}
        {error && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-red-300/20 bg-red-300/8 p-4 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between"><span>{error}{data ? " Showing the most recently loaded data." : ""}</span><button type="button" onClick={() => void load()} className="secondary-button inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2"><RotateCcw size={14} /> Retry</button></div>}

        {loading && !data ? <DashboardSkeleton /> : data && (
          <>
            <section aria-labelledby="metrics-heading"><h2 id="metrics-heading" className="sr-only">Indexed activity metrics</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Gross transfer volume" value={formatUsd(data.metrics.grossTransferVolumeUsd)} sub="All indexed blockchain movement; may include both settlement legs" icon={Activity} />
              <MetricCard label="Inflow volume" value={formatUsd(data.metrics.inflowUsd)} sub="Value received by tracked wallets" icon={ArrowDownToLine} />
              <MetricCard label="Outflow volume" value={formatUsd(data.metrics.outflowUsd)} sub="Value sent from tracked wallets" icon={ArrowUpFromLine} />
              <MetricCard label="Indexed transactions" value={data.metrics.transferCount.toLocaleString()} sub="On-chain token movements stored" icon={Database} />
              <MetricCard label="Tracked wallets" value={data.metrics.activeWallets.toLocaleString()} sub={chain === "ALL" ? "Enabled across both chains" : `Enabled on ${CHAIN_METADATA[chain].label}`} icon={WalletCards} />
              <MetricCard label="BSC volume" value={formatUsd(data.metrics.bscUsd)} sub="Indexed BNB Smart Chain activity" icon={Database} />
              <MetricCard label="Solana volume" value={formatUsd(data.metrics.solanaUsd)} sub="Indexed Solana activity" icon={Database} />
              <MetricCard label="Estimated settled volume" value={formatUsd(data.metrics.estimatedSettledVolumeUsd)} sub="Reference-paired settlements using the conservative smaller leg" icon={Activity} />
            </div></section>

            {chain !== "SOLANA" && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 p-4 text-sm text-amber-100">BTCB values use a fixed operational estimate of $25,000 per BTCB. They are not historical market prices.</div>}

            <section className="mt-6 rounded-2xl border border-white/8 bg-white/[.035] p-4 sm:p-6" aria-labelledby="activity-heading"><div className="mb-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="activity-heading" className="font-semibold text-white">Transaction activity over time</h2><span className="rounded-full border border-white/8 bg-black/10 px-2.5 py-1 text-xs text-slate-400">Last 365 days</span></div><p className="mt-1 text-sm text-slate-500">Daily indexed inflow and outflow volume in USD</p></div><VolumeChart data={data.timeline} /></section>

            <section className="mt-7" aria-labelledby="transactions-heading"><div className="mb-4"><h2 id="transactions-heading" className="text-lg font-semibold text-white">Recent on-chain transactions</h2><p className="mt-1 text-sm text-slate-500">Newest indexed activity, with wallet context and verifiable explorer records.</p></div><TransferTable rows={data.transfers} /></section>
          </>
        )}
      </div>
    </main>
  );
}
