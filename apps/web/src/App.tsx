import { useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import { CHAIN_METADATA } from "./lib/chains";
import { formatRelativeTime, formatUsd } from "./lib/format";
import { MetricCard } from "./components/MetricCard";
import { TransferTable } from "./components/TransferTable";
import { VolumeChart } from "./components/VolumeChart";
import { ConsoleShell } from "./components/console/ConsoleShell";
import { useDashboardData, type ChainFilter } from "./hooks/useDashboardData";


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
  const [chain, setChain] = useState<ChainFilter>("ALL");
  const { data, loading, error, syncStatus, syncError, reload } = useDashboardData(chain);

  const syncing = syncStatus?.state === "RUNNING";
  const syncMessage = syncError
    ? syncError
    : syncStatus?.state === "PARTIAL"
      ? `Synchronization completed with errors on ${syncStatus.failedChains.join(", ")}.`
      : syncStatus?.state === "FAILED"
        ? "Synchronization failed. Indexed data was not refreshed."
        : "";
  const syncIndicatorClass = syncing
    ? "animate-pulse bg-amber-300"
    : syncStatus?.state === "FAILED" || syncStatus?.state === "PARTIAL"
      ? "bg-red-300"
      : "bg-emerald-300";

  const pageActions = <><div className="console-sync-summary"><span className={`h-2 w-2 rounded-full ${syncIndicatorClass}`} /><span>{syncing ? "Indexing in progress" : syncStatus?.state === "PARTIAL" ? "Latest run was partial" : syncStatus?.state === "FAILED" ? "Latest run failed" : data?.metrics.lastIndexedAt ? `Indexed ${formatRelativeTime(data.metrics.lastIndexedAt)}` : "Awaiting first index"}</span></div><label><span className="sr-only">Filter overview by blockchain</span><select value={chain} onChange={(event) => setChain(event.target.value as ChainFilter)} className="control"><option value="ALL">All chains</option><option value="BSC">{CHAIN_METADATA.BSC.label}</option><option value="SOLANA">{CHAIN_METADATA.SOLANA.label}</option></select></label></>;

  return (
    <ConsoleShell title="Overview" description="Monitor indexed settlement movement, synchronization health, and recent on-chain activity." actions={pageActions}>
      <div className="console-overview-meta"><div><span>Last index update</span><strong>{data?.metrics.lastIndexedAt ? new Date(data.metrics.lastIndexedAt).toLocaleString() : "Not available"}</strong></div><div><span>Latest transaction</span><strong>{data?.metrics.latestTransactionAt ? new Date(data.metrics.latestTransactionAt).toLocaleString() : "None indexed"}</strong></div><div><span>Network scope</span><strong>{chain === "ALL" ? "BSC and Solana" : CHAIN_METADATA[chain].label}</strong></div></div>

        {syncMessage && <div role="status" aria-live="polite" className={`mb-5 rounded-xl border p-4 text-sm ${syncError || syncStatus?.state === "FAILED" ? "border-red-300/20 bg-red-300/8 text-red-200" : syncStatus?.state === "PARTIAL" ? "border-amber-300/20 bg-amber-300/8 text-amber-100" : "border-emerald-300/20 bg-emerald-300/8 text-emerald-200"}`}>{syncMessage}</div>}
        {error && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-red-300/20 bg-red-300/8 p-4 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between"><span>{error}{data ? " Showing the most recently loaded data." : ""}</span><button type="button" onClick={() => void reload()} className="secondary-button inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2"><RotateCcw size={14} /> Retry</button></div>}

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

            <section className="mt-7" aria-labelledby="transactions-heading"><div className="mb-4 flex items-end justify-between gap-4"><div><h2 id="transactions-heading" className="text-lg font-semibold text-white">Recent on-chain transactions</h2><p className="mt-1 text-sm text-slate-500">A concise view of the latest indexed activity.</p></div><a href="/dashboard/transactions" className="secondary-button rounded-lg px-3 py-2 text-sm">View all loaded transactions</a></div><TransferTable rows={data.transfers.slice(0, 5)} compact /></section>
          </>
        )}
    </ConsoleShell>
  );
}
