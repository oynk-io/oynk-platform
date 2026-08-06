import type { TimelinePoint } from "@oynk/shared";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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

  return (
    <div className="h-[300px] w-full" aria-label="365-day inflow and outflow volume chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="inflow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="outflow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.24} />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            formatter={(value, name) => [formatUsd(Number(value)), name === "inflowUsd" ? "Inflow" : "Outflow"]}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={36}
            formatter={(value) => (value === "inflowUsd" ? "Inflow" : "Outflow")}
          />
          <Area type="monotone" dataKey="inflowUsd" stroke="#34d399" fill="url(#inflow)" strokeWidth={2} />
          <Area type="monotone" dataKey="outflowUsd" stroke="#60a5fa" fill="url(#outflow)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
