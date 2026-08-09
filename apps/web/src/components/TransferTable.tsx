import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { OffchainTransferRow, TransferDirection, TransferRow } from "@oynk/shared";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
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
  route: "ALL" | "ONCHAIN" | "OFFCHAIN";
  direction: "ALL" | TransferDirection;
  dateRange: "ALL" | "7" | "30" | "365";
};

const initialFilters: Filters = { search: "", route: "ALL", direction: "ALL", dateRange: "365" };
const PAGE_SIZE = 25;

function DirectionBadge({ direction }: { direction: TransferDirection }) {
  const inflow = direction === "INFLOW";
  const Icon = inflow ? ArrowDownLeft : ArrowUpRight;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${inflow ? "border-emerald-300/20 bg-emerald-300/8 text-emerald-300" : "border-blue-300/20 bg-blue-300/8 text-blue-300"}`}><Icon size={13} aria-hidden="true" />{inflow ? "Inflow" : "Outflow"}</span>;
}

function RouteBadge({ row }: { row: TransferRow }) {
  if (row.settlementRoute === "OFFCHAIN") {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-2.5 py-1 text-xs font-medium text-cyan-200"><Building2 size={13} />Offchain</span>;
  }
  const metadata = CHAIN_METADATA[row.chain];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${metadata.badgeClassName}`} title={`${metadata.label} · Onchain`}>{metadata.shortLabel}</span>;
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
  return <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs text-slate-400" title={value}><span className="truncate">{shortenIdentifier(value)}</span><button type="button" onClick={() => void copy()} className="icon-button shrink-0 rounded p-1 text-slate-500 hover:text-emerald-300" aria-label={`Copy ${label}`} title={`Copy ${label}`}>{copied ? <Check size={13} /> : <Copy size={13} />}</button></span>;
}

function OffchainDetailsModal({ row, onClose }: { row: OffchainTransferRow; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const time = formatDateTime(row.timestamp);
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="offchain-details-title" className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0c1714] p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><div className="mb-2"><RouteBadge row={row} /></div><h2 id="offchain-details-title" className="text-xl font-semibold text-white">Offchain settlement details</h2><p className="mt-1 text-sm text-slate-500">Public record with identity fields fully masked.</p></div><button type="button" autoFocus onClick={onClose} className="icon-button rounded-lg p-2 text-slate-400 hover:text-white" aria-label="Close transaction details"><X size={18} /></button></div>
        <dl className="mt-6 grid gap-4 text-sm">
          <div className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-wider text-slate-500">Transaction ID</dt><dd className="mt-1 font-mono text-slate-200">{row.transactionId ?? "Not provided"}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Reference ID</dt><dd className="mt-1"><Identifier value={row.referenceId} label="reference ID" /></dd></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-wider text-slate-500">Type</dt><dd className="mt-1 text-slate-200">{row.transactionType}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Flow amount</dt><dd className="mt-1 font-semibold text-white">{formatUsd(row.usdValue)}</dd></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-wider text-slate-500">Date</dt><dd className="mt-1 text-slate-200">{time.date}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Direction</dt><dd className="mt-1"><DirectionBadge direction={row.direction} /></dd></div></div>
          <div className="grid gap-4 rounded-xl border border-white/8 bg-white/[.025] p-4 sm:grid-cols-3"><div><dt className="text-xs text-slate-500">Sender</dt><dd className="mt-1 font-mono text-slate-300">{row.sender}</dd></div><div><dt className="text-xs text-slate-500">Recipient</dt><dd className="mt-1 font-mono text-slate-300">{row.recipient}</dd></div><div><dt className="text-xs text-slate-500">Account</dt><dd className="mt-1 font-mono text-slate-300">{row.accountName}</dd></div></div>
        </dl>
      </section>
    </div>,
    document.body,
  );
}

function TransferActions({ row, onDetails }: { row: TransferRow; onDetails: (row: OffchainTransferRow) => void }) {
  if (row.settlementRoute === "OFFCHAIN") return <button type="button" onClick={() => onDetails(row)} className="secondary-button rounded-lg px-2.5 py-1.5 text-xs">View details</button>;
  return <div className="flex flex-wrap items-center gap-2"><a href={row.explorerUrl} target="_blank" rel="noreferrer" className="secondary-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs">{row.pairedLeg ? "Inflow leg" : "Explorer"} <ExternalLink size={12} /></a>{row.pairedLeg && <a href={row.pairedLeg.explorerUrl} target="_blank" rel="noreferrer" className="secondary-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"><Link2 size={12} /> Outflow leg</a>}</div>;
}

function searchableValues(row: TransferRow): string[] {
  if (row.settlementRoute === "OFFCHAIN") return [row.transactionId ?? "", row.referenceId, row.transactionType, row.description];
  return [row.walletAddress, row.counterparty, row.txHash, row.pairedLeg?.walletAddress ?? "", row.pairedLeg?.counterparty ?? "", row.pairedLeg?.txHash ?? ""];
}

export function TransferTable({ rows, compact = false }: { rows: TransferRow[]; compact?: boolean }) {
  const [filters, setFilters] = useState<Filters>(() => compact ? { ...initialFilters, dateRange: "ALL" } : initialFilters);
  const [page, setPage] = useState(1);
  const [selectedOffchain, setSelectedOffchain] = useState<OffchainTransferRow | null>(null);
  const filteredRows = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const earliest = filters.dateRange === "ALL" ? null : Date.now() - Number(filters.dateRange) * 86_400_000;
    return rows.filter((row) =>
      (query === "" || searchableValues(row).some((value) => value.toLowerCase().includes(query))) &&
      (filters.route === "ALL" || row.settlementRoute === filters.route) &&
      (filters.direction === "ALL" || row.direction === filters.direction || (row.settlementRoute === "ONCHAIN" && row.pairedLeg?.direction === filters.direction)) &&
      (earliest === null || new Date(row.timestamp).getTime() >= earliest)
    );
  }, [filters, rows]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [filters, rows]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  return <div>
    {!compact && <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_repeat(3,150px)]"><label className="relative block sm:col-span-2 lg:col-span-1"><span className="sr-only">Search transactions</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search transaction or reference" className="control w-full pl-10" /></label><label><span className="sr-only">Settlement route</span><select value={filters.route} onChange={(event) => setFilters((current) => ({ ...current, route: event.target.value as Filters["route"] }))} className="control w-full"><option value="ALL">All routes</option><option value="ONCHAIN">Onchain</option><option value="OFFCHAIN">Offchain</option></select></label><label><span className="sr-only">Direction</span><select value={filters.direction} onChange={(event) => setFilters((current) => ({ ...current, direction: event.target.value as Filters["direction"] }))} className="control w-full"><option value="ALL">All flows</option><option value="INFLOW">Inflows</option><option value="OUTFLOW">Outflows</option></select></label><label><span className="sr-only">Date range</span><select value={filters.dateRange} onChange={(event) => setFilters((current) => ({ ...current, dateRange: event.target.value as Filters["dateRange"] }))} className="control w-full"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="365">Last 365 days</option><option value="ALL">All loaded dates</option></select></label></div><div className="flex items-center gap-3 text-xs text-slate-500"><span>{filteredRows.length} of {rows.length} transactions</span><button type="button" onClick={() => setFilters(initialFilters)} className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white"><X size={14} /> Clear filters</button></div></div>}

    <div className="hidden overflow-hidden rounded-2xl border border-white/8 bg-white/[.03] md:block"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="border-b border-white/8 bg-white/[.025] text-[11px] uppercase tracking-[.12em] text-slate-500"><tr><th className="px-5 py-4">Time</th><th>Flow</th><th>Route</th><th>Asset / value</th><th>Transaction record</th><th className="pr-5">Verification</th></tr></thead><tbody className="divide-y divide-white/6">{visibleRows.map((row) => { const time = formatDateTime(row.timestamp); return <tr key={row.id} className="text-sm text-slate-300 hover:bg-white/[.025]"><td className="px-5 py-4"><div className="font-medium text-slate-200">{time.date}</div><div className="mt-0.5 text-xs text-slate-500">{time.time}</div></td><td><DirectionBadge direction={row.direction} />{row.settlementRoute === "ONCHAIN" && row.pairedLeg && <div className="mt-1"><DirectionBadge direction={row.pairedLeg.direction} /></div>}</td><td><RouteBadge row={row} />{row.settlementRoute === "ONCHAIN" && row.pairedLeg && <div className="mt-1 text-xs text-slate-500">{CHAIN_METADATA[row.pairedLeg.chain].shortLabel} outflow</div>}</td><td><div className="font-medium text-white tabular-nums">{formatTokenAmount(row.amount)} {row.assetSymbol}</div><div className="text-xs text-slate-500">{formatUsd(row.usdValue)} {row.direction === "INFLOW" ? "received" : "sent"}</div>{row.settlementRoute === "ONCHAIN" && row.pairedLeg && <div className="mt-1 text-xs text-slate-400">{formatTokenAmount(row.pairedLeg.amount)} {row.pairedLeg.assetSymbol} · {formatUsd(row.pairedLeg.usdValue)} sent</div>}</td><td className="max-w-[260px]">{row.settlementRoute === "OFFCHAIN" ? <div className="text-xs text-slate-500">Ref {row.referenceId}</div> : <><Identifier value={row.txHash} label="transaction hash" />{row.pairedLeg && <div className="mt-1"><Identifier value={row.pairedLeg.txHash} label="outflow transaction hash" /></div>}</>}</td><td className="pr-5"><TransferActions row={row} onDetails={setSelectedOffchain} /></td></tr>; })}</tbody></table></div></div>

    <div className="grid gap-3 md:hidden">{visibleRows.map((row) => { const time = formatDateTime(row.timestamp); return <article key={row.id} className="rounded-2xl border border-white/8 bg-white/[.035] p-4"><div className="flex flex-wrap items-center gap-2"><DirectionBadge direction={row.direction} /><RouteBadge row={row} /></div><div className="mt-4 flex items-end justify-between gap-3"><div><div className="text-lg font-semibold text-white">{formatTokenAmount(row.amount)} {row.assetSymbol}</div><div className="text-sm text-slate-500">{formatUsd(row.usdValue)}</div></div><div className="text-right text-xs text-slate-500"><div>{time.date}</div><div>{time.time}</div></div></div><div className="mt-4 border-t border-white/8 pt-4">{row.settlementRoute === "OFFCHAIN" ? <><p className="mb-3 text-sm text-slate-300">Ref {row.referenceId}</p><TransferActions row={row} onDetails={setSelectedOffchain} /></> : <><Identifier value={row.txHash} label="transaction hash" /><div className="mt-3"><TransferActions row={row} onDetails={setSelectedOffchain} /></div></>}</div></article>; })}</div>

    {filteredRows.length === 0 && <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/[.02] p-12 text-center"><p className="font-medium text-slate-300">{rows.length === 0 ? "No transactions yet" : "No transactions match these filters"}</p></div>}
    {!compact && filteredRows.length > 0 && pageCount > 1 && <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Transaction pages"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="secondary-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm disabled:opacity-40"><ChevronLeft size={15} /> Previous</button><span className="text-xs text-slate-500">Page {page} of {pageCount}</span><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} className="secondary-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm disabled:opacity-40">Next <ChevronRight size={15} /></button></nav>}
    {selectedOffchain && <OffchainDetailsModal row={selectedOffchain} onClose={() => setSelectedOffchain(null)} />}
  </div>;
}
