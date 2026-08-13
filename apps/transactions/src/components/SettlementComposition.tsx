import type { DashboardMetrics } from "@oynk/shared";

import { formatUsd } from "../lib/format";

type Segment = {
  label: string;
  value: number;
  color: string;
};

function percentage(value: number, total: number): number {
  if (total <= 0 || value <= 0) return 0;
  return Math.min(100, (value / total) * 100);
}

function CompositionGroup({ title, description, segments }: { title: string; description: string; segments: readonly Segment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return <section aria-label={title} className="rounded-xl border border-white/8 bg-black/10 p-4 sm:p-5">
    <div><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
    <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
      {segments.map((segment) => <span key={segment.label} className={segment.color} style={{ width: `${percentage(segment.value, total)}%` }} />)}
    </div>
    <dl className="mt-5 grid gap-4 sm:grid-cols-2">
      {segments.map((segment) => <div key={segment.label} className="flex items-end justify-between gap-3"><div><dt className="flex items-center gap-2 text-xs text-slate-400"><i className={`h-2 w-2 rounded-full ${segment.color}`} aria-hidden="true" />{segment.label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-white">{formatUsd(segment.value)}</dd></div><span className="text-xs tabular-nums text-slate-500">{percentage(segment.value, total).toFixed(1)}%</span></div>)}
    </dl>
  </section>;
}

export function SettlementComposition({ metrics }: { metrics: DashboardMetrics }) {
  const total = metrics.grossTransferVolumeUsd ?? metrics.totalUsd;
  const routeSegments = [
    { label: "Offchain", value: metrics.offchainVolumeUsd ?? 0, color: "bg-sky-400" },
    { label: "Onchain", value: metrics.onchainVolumeUsd ?? metrics.totalUsd ?? 0, color: "bg-emerald-300" },
  ] as const;
  const directionSegments = [
    { label: "Cash in", value: metrics.inflowUsd, color: "bg-emerald-300" },
    { label: "Cash out", value: metrics.outflowUsd, color: "bg-amber-300" },
  ] as const;

  return <section className="mt-6 rounded-2xl border border-white/8 bg-white/[.035] p-4 sm:p-6" aria-labelledby="composition-heading">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="composition-heading" className="font-semibold text-white">Settlement activity composition</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">A current breakdown of recorded cross-border settlement activity across onchain rails and privacy-safe offchain fiat payment records.</p></div><div className="sm:text-right"><span className="block text-xs uppercase tracking-[.12em] text-slate-500">Recorded volume</span><strong className="mt-1 block text-xl tabular-nums text-white">{formatUsd(total)}</strong><span className="text-xs text-slate-500">{metrics.transferCount.toLocaleString()} transactions</span></div></div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <CompositionGroup title="Settlement route" description="How indexed value moved across partner and blockchain rails." segments={routeSegments} />
      <CompositionGroup title="Flow direction" description="Received and sent settlement value across the loaded scope." segments={directionSegments} />
    </div>
  </section>;
}
