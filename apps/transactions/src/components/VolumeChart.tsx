import type { TimelinePoint } from "@oynk/shared";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactUsd, formatUsd } from "../lib/format";

const formatChartDate = (value: string): string =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export function VolumeChart({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="grid h-[300px] place-items-center rounded-xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
        <div>
          <p className="font-medium text-slate-300">No activity in this period</p>
          <p className="mt-1 text-sm text-slate-500">Indexed inflows and outflows will appear here.</p>
        </div>
      </div>
    );
  }

  const cashFlow = data.reduce(
    (totals, point) => ({
      inflowUsd: totals.inflowUsd + point.inflowUsd,
      outflowUsd: totals.outflowUsd + point.outflowUsd,
      totalUsd: totals.totalUsd + point.totalUsd,
    }),
    { inflowUsd: 0, outflowUsd: 0, totalUsd: 0 },
  );
  const netFlowUsd = cashFlow.inflowUsd - cashFlow.outflowUsd;

  return (
    <div>
      <dl className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/8 bg-black/10 p-3"><dt className="text-xs text-slate-500">Total moved</dt><dd className="mt-1 text-lg font-semibold text-white">{formatUsd(cashFlow.totalUsd)}</dd></div>
        <div className="rounded-xl border border-white/8 bg-black/10 p-3"><dt className="text-xs text-slate-500">Cash in</dt><dd className="mt-1 text-lg font-semibold text-emerald-300">{formatUsd(cashFlow.inflowUsd)}</dd></div>
        <div className="rounded-xl border border-white/8 bg-black/10 p-3"><dt className="text-xs text-slate-500">Cash out</dt><dd className="mt-1 text-lg font-semibold text-blue-300">{formatUsd(cashFlow.outflowUsd)}</dd></div>
        <div className="rounded-xl border border-white/8 bg-black/10 p-3"><dt className="text-xs text-slate-500">Net flow</dt><dd className={`mt-1 text-lg font-semibold ${netFlowUsd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatUsd(netFlowUsd)}</dd></div>
      </dl>
      <div className="h-[300px] w-full" aria-label="365-day total moved, cash in, and cash out chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatChartDate}
              minTickGap={30}
            />
            <YAxis
              width={62}
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatCompactUsd(value)}
            />
            <Tooltip
              contentStyle={{ background: "#0c1714", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12 }}
              labelFormatter={(value) => formatChartDate(String(value))}
              formatter={(value, name) => [formatUsd(Number(value)), name === "totalUsd" ? "Total moved" : name === "inflowUsd" ? "Cash in" : "Cash out"]}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={36}
              formatter={(value) => value === "totalUsd" ? "Total moved" : value === "inflowUsd" ? "Cash in" : "Cash out"}
            />
            <Bar dataKey="totalUsd" fill="#a78bfa" fillOpacity={0.7} radius={[3, 3, 0, 0]} minPointSize={3} />
            <Line type="monotone" dataKey="inflowUsd" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="outflowUsd" stroke="#60a5fa" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
