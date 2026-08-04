import { useEffect, useState } from "react";
import type { DashboardResponse } from "@oynk/shared";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { getDashboard, requestSync } from "./lib/api";
import { MetricCard } from "./components/MetricCard";
import { VolumeChart } from "./components/VolumeChart";
import { TransferTable } from "./components/TransferTable";
const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
export default function App() {
  const [data, setData] = useState<DashboardResponse | null>(null),
    [chain, setChain] = useState("ALL"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function load() {
    setLoading(true);
    try {
      setData(await getDashboard(chain));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [chain]);
  async function sync() {
    await requestSync();
    setTimeout(() => void load(), 2500);
  }
  return (
    <main className="min-h-screen">
      <header className="border-b border-white/8 bg-[#07110e]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400 font-black text-[#07110e]">
              O
            </div>
            <div>
              <div className="font-semibold text-white">
                Oynk Settlement Intelligence
              </div>
              <div className="text-xs text-slate-500">
                Cross-border onchain operations
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 outline-none"
            >
              <option value="ALL">All networks</option>
              <option value="BSC">BNB Chain</option>
              <option value="SOLANA">Solana</option>
            </select>
            <button
              onClick={sync}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-[#07110e]"
            >
              <RefreshCw size={15} />
              Sync now
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1500px] px-6 py-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-emerald-300">
              Settlement overview
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Cross-border transaction flow
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Stablecoin settlement movements read directly from configured BNB
              Chain and Solana wallets. Values use the operational $1 stablecoin
              reporting assumption.
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            Last indexed
            <br />
            <span className="text-slate-300">
              {data?.metrics.lastSyncedAt
                ? new Date(data.metrics.lastSyncedAt).toLocaleString()
                : "Not yet synced"}
            </span>
          </div>
        </div>
        {error && (
          <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}
        {loading && !data ? (
          <div className="py-24 text-center text-slate-500">
            Loading settlement activity…
          </div>
        ) : (
          data && (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  label="Processed volume"
                  value={usd(data.metrics.totalUsd)}
                  sub={`${data.metrics.transferCount.toLocaleString()} token movements`}
                  icon={Activity}
                />
                <MetricCard
                  label="Crypto received"
                  value={usd(data.metrics.inflowUsd)}
                  sub="Across tracked settler wallets"
                  icon={ArrowDownToLine}
                />
                <MetricCard
                  label="Crypto distributed"
                  value={usd(data.metrics.outflowUsd)}
                  sub="Destination and payout flow"
                  icon={ArrowUpFromLine}
                />
                <MetricCard
                  label="Tracked wallets"
                  value={String(data.metrics.activeWallets)}
                  sub="BNB Chain and Solana"
                  icon={WalletCards}
                />
                <MetricCard
                  label="Indexed networks"
                  value="2"
                  sub={`BSC ${usd(data.metrics.bscUsd)} · SOL ${usd(
                    data.metrics.solanaUsd
                  )}`}
                  icon={Database}
                />
              </section>
              <section className="mt-6 rounded-2xl border border-white/8 bg-white/[.035] p-6">
                <div className="mb-4">
                  <h2 className="font-semibold text-white">
                    30-day processing timeline
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Daily stablecoin inflow and outflow in USD
                  </p>
                </div>
                <VolumeChart data={data.timeline} />
              </section>
              <section className="mt-6">
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <h2 className="font-semibold text-white">
                      Onchain transaction ledger
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Newest transactions first, with direct explorer evidence
                      for each settlement leg.
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">
                    Showing {data.transfers.length} records
                  </span>
                </div>
                <TransferTable rows={data.transfers} />
              </section>
            </>
          )
        )}
      </div>
    </main>
  );
}
