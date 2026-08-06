import { useEffect, useMemo, useState } from "react";
import type { Chain, TransferDirection, TransferRow } from "@oynk/shared";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Search,
  X,
} from "lucide-react";
import { CHAIN_METADATA } from "../lib/chains";
import { formatDateTime, formatTokenAmount, formatUsd, shortenIdentifier } from "../lib/format";

type Filters = {
  search: string;
  direction: "ALL" | TransferDirection;
  asset: "ALL" | string;
  dateRange: "ALL" | "7" | "30" | "365";
};

const initialFilters: Filters = { search: "", direction: "ALL", asset: "ALL", dateRange: "365" };
const PAGE_SIZE = 25;

function ChainBadge({ chain }: { chain: Chain }) {
  const metadata = CHAIN_METADATA[chain];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${metadata.badgeClassName}`} title={metadata.label}>{metadata.shortLabel}</span>;
}

function DirectionBadge({ direction }: { direction: TransferDirection }) {
  const inflow = direction === "INFLOW";
  const Icon = inflow ? ArrowDownLeft : ArrowUpRight;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${inflow ? "border-emerald-300/20 bg-emerald-300/8 text-emerald-300" : "border-blue-300/20 bg-blue-300/8 text-blue-300"}`}><Icon size={13} aria-hidden="true" />{inflow ? "Inflow" : "Outflow"}</span>;
}

function Identifier({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs text-slate-400" title={value}>
      <span className="truncate">{shortenIdentifier(value)}</span>
      <button type="button" onClick={() => void copy()} className="icon-button shrink-0 rounded p-1 text-slate-500 hover:text-emerald-300" aria-label={`Copy ${label}`} title={`Copy ${label}`}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  );
}

function TransferActions({ row }: { row: TransferRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={row.explorerUrl} target="_blank" rel="noreferrer" className="secondary-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs" aria-label={`Open ${row.chain} transaction in explorer`}>
        {row.pairedLeg ? "Inflow leg" : "Explorer"} <ExternalLink size={12} aria-hidden="true" />
      </a>
      {row.pairedLeg && (
        <a href={row.pairedLeg.explorerUrl} target="_blank" rel="noreferrer" className="secondary-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs" aria-label={`Open ${row.pairedLeg.chain} outflow transaction in explorer`}>
          <Link2 size={12} aria-hidden="true" /> Outflow leg
        </a>
      )}
    </div>
  );
}

export function TransferTable({ rows, compact = false }: { rows: TransferRow[]; compact?: boolean }) {
  const [filters, setFilters] = useState<Filters>(() => compact ? { ...initialFilters, dateRange: "ALL" } : initialFilters);
  const [page, setPage] = useState(1);
  const assets = useMemo(() => [...new Set(rows.map((row) => row.assetSymbol))].sort(), [rows]);
  const filteredRows = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const earliest = filters.dateRange === "ALL"
      ? null
      : Date.now() - Number(filters.dateRange) * 24 * 60 * 60 * 1_000;
    return rows.filter((row) =>
      (query === "" ||
        row.walletAddress.toLowerCase().includes(query) ||
        row.counterparty.toLowerCase().includes(query) ||
        row.txHash.toLowerCase().includes(query) ||
        row.pairedLeg?.walletAddress.toLowerCase().includes(query) ||
        row.pairedLeg?.counterparty.toLowerCase().includes(query) ||
        row.pairedLeg?.txHash.toLowerCase().includes(query)) &&
      (filters.direction === "ALL" || row.direction === filters.direction || row.pairedLeg?.direction === filters.direction) &&
      (filters.asset === "ALL" || row.assetSymbol === filters.asset) &&
      (earliest === null || new Date(row.timestamp).getTime() >= earliest)
    );
  }, [filters, rows]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [filters, rows]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const hasFilters = Object.entries(filters).some(([key, value]) => value !== initialFilters[key as keyof Filters]);

  return (
    <div>
      {!compact && <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_repeat(3,150px)]">
          <label className="relative block sm:col-span-2 lg:col-span-1">
            <span className="sr-only">Search transactions</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search wallet or transaction hash" className="control w-full pl-10" />
          </label>
          <label><span className="sr-only">Direction</span><select value={filters.direction} onChange={(event) => setFilters((current) => ({ ...current, direction: event.target.value as Filters["direction"] }))} className="control w-full"><option value="ALL">All directions</option><option value="INFLOW">Inflows</option><option value="OUTFLOW">Outflows</option></select></label>
          <label><span className="sr-only">Asset</span><select value={filters.asset} onChange={(event) => setFilters((current) => ({ ...current, asset: event.target.value }))} className="control w-full"><option value="ALL">All assets</option>{assets.map((asset) => <option key={asset} value={asset}>{asset}</option>)}</select></label>
          <label><span className="sr-only">Transaction date range</span><select value={filters.dateRange} onChange={(event) => setFilters((current) => ({ ...current, dateRange: event.target.value as Filters["dateRange"] }))} className="control w-full"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="365">Last 365 days</option><option value="ALL">All loaded dates</option></select></label>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-slate-500 xl:justify-end">
          <span aria-live="polite">{filteredRows.length} of {rows.length} transactions</span>
          {hasFilters && <button type="button" onClick={() => setFilters(initialFilters)} className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white"><X size={14} /> Clear filters</button>}
        </div>
      </div>}

      <div className="hidden overflow-hidden rounded-2xl border border-white/8 bg-white/[.03] md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left">
            <thead className="border-b border-white/8 bg-white/[.025] text-[11px] uppercase tracking-[.12em] text-slate-500"><tr><th scope="col" className="px-5 py-4">Time</th><th scope="col">Flow</th><th scope="col">Chain</th><th scope="col">Asset / value</th><th scope="col">Tracked wallet</th><th scope="col">Counterparty</th><th scope="col">Transaction</th><th scope="col" className="pr-5">Links</th></tr></thead>
            <tbody className="divide-y divide-white/6">
              {visibleRows.map((row) => { const time = formatDateTime(row.timestamp); return (
                <tr key={row.id} className="text-sm text-slate-300 transition-colors hover:bg-white/[.025]">
                  <td className="px-5 py-4"><div className="font-medium text-slate-200">{time.date}</div><div className="mt-0.5 text-xs text-slate-500">{time.time}</div></td>
                  <td><DirectionBadge direction={row.direction} />{row.pairedLeg && <div className="my-1 ml-5 h-3 border-l border-white/15" />} {row.pairedLeg && <DirectionBadge direction={row.pairedLeg.direction} />}</td>
                  <td><ChainBadge chain={row.chain} />{row.pairedLeg && <div className="mt-2"><ChainBadge chain={row.pairedLeg.chain} /></div>}</td>
                  <td><div className="font-medium text-white tabular-nums">{formatTokenAmount(row.amount)} {row.assetSymbol}</div><div className="mt-0.5 text-xs text-slate-500 tabular-nums">{formatUsd(row.usdValue)} received</div>{row.pairedLeg && <><div className="mt-2 font-medium text-white tabular-nums">{formatTokenAmount(row.pairedLeg.amount)} {row.pairedLeg.assetSymbol}</div><div className="mt-0.5 text-xs text-slate-500 tabular-nums">{formatUsd(row.pairedLeg.usdValue)} sent</div></>}</td>
                  <td className="max-w-[155px]"><Identifier value={row.walletAddress} label="inflow wallet address" />{row.pairedLeg && <div className="mt-2"><Identifier value={row.pairedLeg.walletAddress} label="outflow wallet address" /></div>}</td>
                  <td className="max-w-[155px]"><Identifier value={row.counterparty} label="inflow counterparty address" />{row.pairedLeg && <div className="mt-2"><Identifier value={row.pairedLeg.counterparty} label="outflow counterparty address" /></div>}</td>
                  <td className="max-w-[155px]"><Identifier value={row.txHash} label="inflow transaction hash" />{row.pairedLeg && <div className="mt-2"><Identifier value={row.pairedLeg.txHash} label="outflow transaction hash" /></div>}</td>
                  <td className="pr-5"><TransferActions row={row} /></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {visibleRows.map((row) => { const time = formatDateTime(row.timestamp); return (
          <article key={row.id} className="rounded-2xl border border-white/8 bg-white/[.035] p-4">
            <div className="flex flex-wrap items-center gap-2"><DirectionBadge direction={row.direction} /><ChainBadge chain={row.chain} />{row.pairedLeg && <><span className="text-slate-600">→</span><DirectionBadge direction={row.pairedLeg.direction} /><ChainBadge chain={row.pairedLeg.chain} /></>}</div>
            <div className="mt-4 flex items-end justify-between gap-3"><div><div className="text-lg font-semibold text-white tabular-nums">{formatTokenAmount(row.amount)} {row.assetSymbol} <span className="text-sm font-normal text-slate-500">received</span></div>{row.pairedLeg && <div className="mt-1 text-lg font-semibold text-white tabular-nums">{formatTokenAmount(row.pairedLeg.amount)} {row.pairedLeg.assetSymbol} <span className="text-sm font-normal text-slate-500">sent</span></div>}<div className="text-sm text-slate-500 tabular-nums">{formatUsd(row.usdValue)}{row.pairedLeg ? ` → ${formatUsd(row.pairedLeg.usdValue)}` : ""}</div></div><div className="text-right text-xs text-slate-500"><div>{time.date}</div><div>{time.time}</div></div></div>
            <dl className="mt-4 grid gap-3 border-t border-white/8 pt-4 text-xs"><div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Inflow wallet</dt><dd className="min-w-0"><Identifier value={row.walletAddress} label="inflow wallet address" /></dd></div>{row.pairedLeg && <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Outflow wallet</dt><dd className="min-w-0"><Identifier value={row.pairedLeg.walletAddress} label="outflow wallet address" /></dd></div>}<div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Inflow transaction</dt><dd className="min-w-0"><Identifier value={row.txHash} label="inflow transaction hash" /></dd></div>{row.pairedLeg && <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Outflow transaction</dt><dd className="min-w-0"><Identifier value={row.pairedLeg.txHash} label="outflow transaction hash" /></dd></div>}</dl>
            <div className="mt-4"><TransferActions row={row} /></div>
          </article>
        ); })}
      </div>

      {filteredRows.length === 0 && <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/[.02] p-12 text-center"><p className="font-medium text-slate-300">{rows.length === 0 ? "No indexed transactions yet" : "No transactions match these filters"}</p><p className="mt-1 text-sm text-slate-500">{rows.length === 0 ? "Run synchronization after the indexer is configured." : "Adjust or clear the filters to see more activity."}</p>{rows.length > 0 && <button type="button" onClick={() => setFilters(initialFilters)} className="secondary-button mt-4 rounded-lg px-3 py-2 text-sm">Clear filters</button>}</div>}
      {!compact && filteredRows.length > 0 && pageCount > 1 && <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Transaction pages"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="secondary-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} aria-hidden="true" /> Previous</button><span className="text-xs text-slate-500" aria-live="polite">Page {page} of {pageCount}</span><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} className="secondary-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={15} aria-hidden="true" /></button></nav>}
    </div>
  );
}
