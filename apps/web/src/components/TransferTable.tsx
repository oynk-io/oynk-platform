import type { TransferRow } from "@oynk/shared";
import { ExternalLink, ArrowDownLeft, ArrowUpRight, Link2 } from "lucide-react";
const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-5)}`;
const money = (v: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(v));
export function TransferTable({ rows }: { rows: TransferRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[.035]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead className="border-b border-white/8 bg-white/[.025] text-xs uppercase tracking-[.14em] text-slate-500">
            <tr>
              <th className="px-5 py-4">Date</th>
              <th>Flow</th>
              <th>Network</th>
              <th>Asset</th>
              <th>Amount</th>
              <th>USD value</th>
              <th>Counterparty</th>
              <th>Onchain records</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/6">
            {rows.map((r) => (
              <tr
                key={r.id}
                className="text-sm text-slate-300 transition hover:bg-white/[.025]"
              >
                <td className="px-5 py-4">
                  <div className="font-medium text-slate-200">
                    {new Date(r.timestamp).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(r.timestamp).toLocaleTimeString()}
                  </div>
                </td>
                <td>
                  {r.direction === "INFLOW" ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-300">
                      <ArrowDownLeft size={15} />
                      Inflow
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-blue-300">
                      <ArrowUpRight size={15} />
                      Outflow
                    </span>
                  )}
                </td>
                <td>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs">
                    {r.chain}
                  </span>
                </td>
                <td className="font-medium text-white">{r.assetSymbol}</td>
                <td>
                  {Number(r.amount).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="font-medium text-white">{money(r.usdValue)}</td>
                <td className="font-mono text-xs text-slate-400">
                  {short(r.counterparty)}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <a
                      href={r.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs hover:border-emerald-300/30 hover:text-emerald-300"
                    >
                      This leg <ExternalLink size={12} />
                    </a>
                    {r.pairExplorerUrl ? (
                      <a
                        href={r.pairExplorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs"
                      >
                        <Link2 size={12} />
                        Paired leg
                      </a>
                    ) : (
                      <span className="text-xs text-slate-600">Unpaired</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="p-14 text-center text-slate-500">
          No indexed stablecoin transfers yet. Start a sync after configuring
          the database and RPC endpoints.
        </div>
      )}
    </div>
  );
}
