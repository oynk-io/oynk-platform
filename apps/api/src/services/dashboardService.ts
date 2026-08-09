import type {
  Chain,
  DashboardFilter,
  DashboardResponse,
  OffchainTransferRow,
  OnchainTransferRow,
  TransferDirection,
  TransferRow,
  TransferStatus,
} from "@oynk/shared";

import { pool } from "../db/pool.js";

type MetricsRow = {
  total_usd: string;
  inflow_usd: string;
  outflow_usd: string;
  onchain_usd: string;
  offchain_usd: string;
  bsc_usd: string;
  solana_usd: string;
  transfer_count: string;
  active_wallets: string;
  paired_transfer_count: string;
  last_synced_at: Date | string | null;
  latest_transaction_at: Date | string | null;
  paired_settlement_usd: string;
  unmatched_transfer_usd: string;
  settlement_count: string;
  latest_indexed_block: string | null;
};

type TimelineRow = {
  date: Date | string;
  inflow_usd: string;
  outflow_usd: string;
  total_usd: string;
  transfer_count: string;
};

type OnchainDatabaseRow = {
  id: string;
  chain: Chain;
  wallet_address: string;
  tx_hash: string;
  block_number: string | null;
  block_time: Date | string;
  direction: TransferDirection;
  token_address: string;
  asset_symbol: string;
  decimals: number;
  raw_amount: string;
  amount: string;
  usd_value: string;
  counterparty: string;
  status: TransferStatus;
  explorer_url: string;
  pair_id: string | null;
  pair_explorer_url: string | null;
  pair_chain: Chain | null;
  pair_wallet_address: string | null;
  pair_tx_hash: string | null;
  pair_block_time: Date | string | null;
  pair_direction: TransferDirection | null;
  pair_asset_symbol: string | null;
  pair_amount: string | null;
  pair_usd_value: string | null;
  pair_counterparty: string | null;
  pair_status: TransferStatus | null;
};

type OffchainDatabaseRow = {
  id: string;
  occurred_at: Date | string;
  direction: TransferDirection;
  amount_usd: string;
  transaction_id: string | null;
  reference_id: string;
  transaction_type: string;
  description: string;
};

const MASKED_VALUE = "••••••••" as const;

function toIsoString(value: Date | string): string {
  return new Date(value).toISOString();
}

function sourceConditions(filter: DashboardFilter): {
  onchain: string;
  offchain: string;
  values: unknown[];
} {
  if (filter === "ALL") return { onchain: "TRUE", offchain: "TRUE", values: [] };
  if (filter === "OFFCHAIN") return { onchain: "FALSE", offchain: "TRUE", values: [] };
  return { onchain: "chain = $1", offchain: "FALSE", values: [filter] };
}

export async function getDashboardData(filter: DashboardFilter): Promise<DashboardResponse> {
  const conditions = sourceConditions(filter);
  const metricsResult = await pool.query<MetricsRow>(
    `
      WITH filtered_onchain AS (
        SELECT * FROM transfers WHERE ${conditions.onchain}
      ), filtered_offchain AS (
        SELECT * FROM offchain_transactions WHERE ${conditions.offchain}
      ), movements AS (
        SELECT direction, usd_value AS amount_usd, chain, 'ONCHAIN'::TEXT AS route, block_time AS occurred_at
        FROM filtered_onchain
        UNION ALL
        SELECT direction, amount_usd, NULL::TEXT AS chain, 'OFFCHAIN'::TEXT AS route, occurred_at
        FROM filtered_offchain
      ), paired_settlements AS (
        SELECT LEAST(a.usd_value, b.usd_value) AS settled_value
        FROM filtered_onchain a
        JOIN filtered_onchain b ON b.id = a.pair_id
        WHERE a.id < b.id AND a.pairing_method = 'REFERENCE'
      )
      SELECT
        COALESCE(SUM(amount_usd), 0)::TEXT AS total_usd,
        COALESCE(SUM(amount_usd) FILTER (WHERE direction = 'INFLOW'), 0)::TEXT AS inflow_usd,
        COALESCE(SUM(amount_usd) FILTER (WHERE direction = 'OUTFLOW'), 0)::TEXT AS outflow_usd,
        COALESCE(SUM(amount_usd) FILTER (WHERE route = 'ONCHAIN'), 0)::TEXT AS onchain_usd,
        COALESCE(SUM(amount_usd) FILTER (WHERE route = 'OFFCHAIN'), 0)::TEXT AS offchain_usd,
        COALESCE(SUM(amount_usd) FILTER (WHERE chain = 'BSC'), 0)::TEXT AS bsc_usd,
        COALESCE(SUM(amount_usd) FILTER (WHERE chain = 'SOLANA'), 0)::TEXT AS solana_usd,
        ((SELECT COUNT(*) FROM filtered_onchain) - (SELECT COUNT(*) FROM paired_settlements) + (SELECT COUNT(*) FROM filtered_offchain))::TEXT AS transfer_count,
        (SELECT (COUNT(*) FILTER (WHERE pair_id IS NOT NULL AND pairing_method = 'REFERENCE') / 2)::TEXT FROM filtered_onchain) AS paired_transfer_count,
        MAX(occurred_at) AS latest_transaction_at,
        (COALESCE((SELECT SUM(settled_value) FROM paired_settlements), 0) + COALESCE((SELECT SUM(amount_usd) FROM filtered_offchain), 0))::TEXT AS paired_settlement_usd,
        COALESCE((SELECT SUM(usd_value) FROM filtered_onchain WHERE pair_id IS NULL OR pairing_method IS DISTINCT FROM 'REFERENCE'), 0)::TEXT AS unmatched_transfer_usd,
        ((SELECT COUNT(*) FROM paired_settlements) + (SELECT COUNT(*) FROM filtered_offchain))::TEXT AS settlement_count,
        (SELECT MAX(block_number::NUMERIC)::TEXT FROM filtered_onchain) AS latest_indexed_block,
        (SELECT MAX(completed_at) FROM sync_runs WHERE status IN ('COMPLETED', 'PARTIAL')) AS last_synced_at,
        (SELECT COUNT(*)::TEXT FROM tracked_wallets WHERE enabled = TRUE AND ${filter === "ALL" ? "TRUE" : filter === "OFFCHAIN" ? "FALSE" : "chain = $1"}) AS active_wallets
      FROM movements
    `,
    conditions.values,
  );
  const metricsRow = metricsResult.rows[0];

  const timelineResult = await pool.query<TimelineRow>(
    `
      WITH movements AS (
        SELECT block_time AS occurred_at, direction, usd_value AS amount_usd
        FROM transfers
        WHERE ${conditions.onchain}
        UNION ALL
        SELECT occurred_at, direction, amount_usd
        FROM offchain_transactions
        WHERE ${conditions.offchain}
      )
      SELECT
        DATE_TRUNC('day', occurred_at) AS date,
        COALESCE(SUM(amount_usd) FILTER (WHERE direction = 'INFLOW'), 0)::TEXT AS inflow_usd,
        COALESCE(SUM(amount_usd) FILTER (WHERE direction = 'OUTFLOW'), 0)::TEXT AS outflow_usd,
        COALESCE(SUM(amount_usd), 0)::TEXT AS total_usd,
        COUNT(*)::TEXT AS transfer_count
      FROM movements
      WHERE occurred_at >= NOW() - INTERVAL '365 days'
      GROUP BY DATE_TRUNC('day', occurred_at)
      ORDER BY DATE_TRUNC('day', occurred_at)
    `,
    conditions.values,
  );

  const onchainRows = filter === "OFFCHAIN" ? [] : (await pool.query<OnchainDatabaseRow>(
    `
      SELECT
        transfer.id, transfer.chain, transfer.wallet_address, transfer.tx_hash, transfer.block_number,
        transfer.block_time, transfer.direction, transfer.token_address, transfer.asset_symbol,
        transfer.decimals, transfer.raw_amount::TEXT, transfer.amount::TEXT, transfer.usd_value::TEXT,
        transfer.counterparty, transfer.status, transfer.explorer_url,
        CASE WHEN transfer.pairing_method = 'REFERENCE' THEN transfer.pair_id ELSE NULL END AS pair_id,
        paired.explorer_url AS pair_explorer_url, paired.chain AS pair_chain,
        paired.wallet_address AS pair_wallet_address, paired.tx_hash AS pair_tx_hash,
        paired.block_time AS pair_block_time, paired.direction AS pair_direction,
        paired.asset_symbol AS pair_asset_symbol, paired.amount::TEXT AS pair_amount,
        paired.usd_value::TEXT AS pair_usd_value, paired.counterparty AS pair_counterparty,
        paired.status AS pair_status
      FROM transfers transfer
      LEFT JOIN transfers paired ON paired.id = transfer.pair_id AND transfer.pairing_method = 'REFERENCE'
      WHERE ${filter === "ALL" ? "TRUE" : "(transfer.chain = $1 OR paired.chain = $1)"}
        AND (transfer.pair_id IS NULL OR transfer.pairing_method IS DISTINCT FROM 'REFERENCE' OR transfer.direction = 'INFLOW')
      ORDER BY transfer.block_time DESC, transfer.chain, transfer.block_number::NUMERIC DESC NULLS LAST, transfer.log_index DESC
      LIMIT 500
    `,
    conditions.values,
  )).rows;

  const offchainRows = filter !== "ALL" && filter !== "OFFCHAIN" ? [] : (await pool.query<OffchainDatabaseRow>(
    `SELECT id, occurred_at, direction, amount_usd::TEXT, transaction_id, reference_id, transaction_type, description
     FROM offchain_transactions ORDER BY occurred_at DESC, reference_id DESC LIMIT 500`,
  )).rows;

  const onchainTransfers: OnchainTransferRow[] = onchainRows.map((row) => ({
    id: row.id,
    settlementRoute: "ONCHAIN",
    chain: row.chain,
    walletAddress: row.wallet_address,
    txHash: row.tx_hash,
    blockNumber: row.block_number,
    timestamp: toIsoString(row.block_time),
    direction: row.direction,
    tokenAddress: row.token_address,
    assetSymbol: row.asset_symbol,
    decimals: row.decimals,
    rawAmount: row.raw_amount,
    amount: row.amount,
    usdValue: row.usd_value,
    counterparty: row.counterparty,
    status: row.status,
    explorerUrl: row.explorer_url,
    pairId: row.pair_id,
    pairExplorerUrl: row.pair_explorer_url,
    pairedLeg: row.pair_id && row.pair_chain && row.pair_wallet_address && row.pair_tx_hash && row.pair_block_time && row.pair_direction && row.pair_asset_symbol && row.pair_amount && row.pair_usd_value && row.pair_counterparty && row.pair_status && row.pair_explorer_url ? {
      id: row.pair_id,
      chain: row.pair_chain,
      walletAddress: row.pair_wallet_address,
      txHash: row.pair_tx_hash,
      timestamp: toIsoString(row.pair_block_time),
      direction: row.pair_direction,
      assetSymbol: row.pair_asset_symbol,
      amount: row.pair_amount,
      usdValue: row.pair_usd_value,
      counterparty: row.pair_counterparty,
      status: row.pair_status,
      explorerUrl: row.pair_explorer_url,
    } : null,
  }));

  const offchainTransfers: OffchainTransferRow[] = offchainRows.map((row) => ({
    id: row.id,
    settlementRoute: "OFFCHAIN",
    timestamp: toIsoString(row.occurred_at),
    direction: row.direction,
    assetSymbol: "USD",
    amount: row.amount_usd,
    usdValue: row.amount_usd,
    status: "CONFIRMED",
    transactionId: row.transaction_id,
    referenceId: row.reference_id,
    transactionType: row.transaction_type,
    description: row.description,
    sender: MASKED_VALUE,
    recipient: MASKED_VALUE,
    accountName: MASKED_VALUE,
  }));

  const transfers: TransferRow[] = [...onchainTransfers, ...offchainTransfers]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 500);

  return {
    metrics: {
      grossTransferVolumeUsd: Number(metricsRow?.total_usd ?? 0),
      inflowVolumeUsd: Number(metricsRow?.inflow_usd ?? 0),
      outflowVolumeUsd: Number(metricsRow?.outflow_usd ?? 0),
      estimatedSettledVolumeUsd: Number(metricsRow?.paired_settlement_usd ?? 0),
      pairedSettlementVolumeUsd: Number(metricsRow?.paired_settlement_usd ?? 0),
      unmatchedTransferVolumeUsd: Number(metricsRow?.unmatched_transfer_usd ?? 0),
      settlementCount: Number(metricsRow?.settlement_count ?? 0),
      lastIndexedAt: metricsRow?.last_synced_at ? toIsoString(metricsRow.last_synced_at) : null,
      latestIndexedBlock: metricsRow?.latest_indexed_block ?? null,
      chainLag: null,
      totalUsd: Number(metricsRow?.total_usd ?? 0),
      inflowUsd: Number(metricsRow?.inflow_usd ?? 0),
      outflowUsd: Number(metricsRow?.outflow_usd ?? 0),
      bscUsd: Number(metricsRow?.bsc_usd ?? 0),
      solanaUsd: Number(metricsRow?.solana_usd ?? 0),
      onchainVolumeUsd: Number(metricsRow?.onchain_usd ?? 0),
      offchainVolumeUsd: Number(metricsRow?.offchain_usd ?? 0),
      transferCount: Number(metricsRow?.transfer_count ?? 0),
      activeWallets: Number(metricsRow?.active_wallets ?? 0),
      pairedTransferCount: Number(metricsRow?.paired_transfer_count ?? 0),
      lastSyncedAt: metricsRow?.last_synced_at ? toIsoString(metricsRow.last_synced_at) : null,
      latestTransactionAt: metricsRow?.latest_transaction_at ? toIsoString(metricsRow.latest_transaction_at) : null,
    },
    timeline: timelineResult.rows.map((row) => ({
      date: toIsoString(row.date).slice(0, 10),
      inflowUsd: Number(row.inflow_usd),
      outflowUsd: Number(row.outflow_usd),
      totalUsd: Number(row.total_usd),
      transferCount: Number(row.transfer_count),
    })),
    transfers,
  };
}
