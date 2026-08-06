import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { ConsoleShell } from "../components/console/ConsoleShell";
import { TransferTable } from "../components/TransferTable";
import { CHAIN_METADATA } from "../lib/chains";
import { useDashboardData, type ChainFilter } from "../hooks/useDashboardData";

function TransactionsSkeleton() {
  return <div role="status" aria-label="Loading transaction operations" className="animate-pulse"><div className="h-10 rounded-lg bg-white/[.05]" /><div className="mt-4 h-[560px] rounded-xl border border-white/8 bg-white/[.035]" /><span className="sr-only">Loading transaction operations</span></div>;
}

export function TransactionsPage() {
  const [chain, setChain] = useState<ChainFilter>("ALL");
  const { data, loading, error, reload } = useDashboardData(chain);
  const actions = <label><span className="sr-only">Filter transactions by blockchain</span><select value={chain} onChange={(event) => setChain(event.target.value as ChainFilter)} className="control"><option value="ALL">All chains</option><option value="BSC">{CHAIN_METADATA.BSC.label}</option><option value="SOLANA">{CHAIN_METADATA.SOLANA.label}</option></select></label>;

  return <ConsoleShell title="Transactions" description="Search and verify indexed on-chain transfer activity across tracked settlement wallets." actions={actions}>
    <div className="console-data-notice" role="note"><strong>Indexed activity</strong><span>Search and filters apply to the most recent records returned by the dashboard API. Complete server-side ledger pagination is not connected yet.</span></div>
    {error && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-red-300/20 bg-red-300/8 p-4 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between"><span>{error}{data ? " Showing the most recently loaded records." : ""}</span><button type="button" onClick={() => void reload()} className="secondary-button inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2"><RotateCcw size={14} /> Retry</button></div>}
    {loading && !data ? <TransactionsSkeleton /> : data ? <TransferTable rows={data.transfers} /> : null}
  </ConsoleShell>;
}
