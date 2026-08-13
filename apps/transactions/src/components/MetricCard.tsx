import type { LucideIcon } from "lucide-react";

type MetricCardProps = {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
};

export function MetricCard({ label, value, sub, icon: Icon }: MetricCardProps) {
  return (
    <article className="metric-card rounded-2xl border border-white/8 bg-white/[.04] p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-400">{label}</span>
        <span className="rounded-lg border border-emerald-300/15 bg-emerald-300/8 p-2 text-emerald-300" aria-hidden="true">
          <Icon size={17} />
        </span>
      </div>
      <div className="mt-5 text-2xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
      <div className="mt-1.5 text-xs leading-5 text-slate-500">{sub}</div>
    </article>
  );
}
