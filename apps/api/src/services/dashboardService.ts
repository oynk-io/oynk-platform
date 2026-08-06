import type {
  Chain,
  DashboardResponse,
  TransferDirection,
  TransferRow,
  TransferStatus,
} from "@oynk/shared";

import { pool } from "../db/pool.js";

type ChainFilter = "ALL" | "BSC" | "SOLANA";

type MetricsRow = {
  total_usd: string;
  inflow_usd: string;
  outflow_usd: string;
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

type TransferDatabaseRow = {
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

function chainCondition(
  chain: ChainFilter,
  column = "chain"
): {
  sql: string;
  values: unknown[];
} {
  if (chain === "ALL") {
    return {
      sql: "",
      values: [],
    };
  }

  return {
    sql: `WHERE ${column} = $1`,
    values: [chain],
  };
}

function toIsoString(value: Date | string): string {
  return new Date(value).toISOString();
}

export async function getDashboardData(
  chain: ChainFilter
): Promise<DashboardResponse> {
  const filter = chainCondition(chain);

  const metricsResult = await pool.query<MetricsRow>(
    `
        WITH filtered_transfers AS (
          SELECT *
          FROM transfers
          ${filter.sql}
        ), paired_settlements AS (
          SELECT LEAST(a.usd_value, b.usd_value) AS settled_value
          FROM filtered_transfers a
          JOIN filtered_transfers b ON b.id = a.pair_id
          WHERE a.id < b.id AND a.pairing_method = 'REFERENCE'
        )
        SELECT
          COALESCE(SUM(usd_value), 0)::TEXT AS total_usd,
  
          COALESCE(
            SUM(usd_value)
            FILTER (WHERE direction = 'INFLOW'),
            0
          )::TEXT AS inflow_usd,
  
          COALESCE(
            SUM(usd_value)
            FILTER (WHERE direction = 'OUTFLOW'),
            0
          )::TEXT AS outflow_usd,
  
          COALESCE(
            SUM(usd_value)
            FILTER (WHERE chain = 'BSC'),
            0
          )::TEXT AS bsc_usd,
  
          COALESCE(
            SUM(usd_value)
            FILTER (WHERE chain = 'SOLANA'),
            0
          )::TEXT AS solana_usd,
  
          COUNT(*)::TEXT AS transfer_count,
  
          (COUNT(*)
            FILTER (WHERE pair_id IS NOT NULL AND pairing_method = 'REFERENCE') / 2)::TEXT
            AS paired_transfer_count,
  
          MAX(block_time) AS latest_transaction_at,

          COALESCE((SELECT SUM(settled_value) FROM paired_settlements), 0)::TEXT AS paired_settlement_usd,
          COALESCE(SUM(usd_value) FILTER (WHERE pair_id IS NULL OR pairing_method IS DISTINCT FROM 'REFERENCE'), 0)::TEXT AS unmatched_transfer_usd,
          (SELECT COUNT(*) FROM paired_settlements)::TEXT AS settlement_count,
          MAX(block_number::NUMERIC)::TEXT AS latest_indexed_block,

          (
            SELECT MAX(completed_at)
            FROM sync_runs
            WHERE status IN ('COMPLETED', 'PARTIAL')
          ) AS last_synced_at,
  
          (
            SELECT COUNT(*)::TEXT
            FROM tracked_wallets
            WHERE enabled = TRUE
            ${chain === "ALL" ? "" : "AND chain = $1"}
          ) AS active_wallets
        FROM filtered_transfers
      `,
    filter.values
  );

  const metricsRow = metricsResult.rows[0];

  const timelineWhere =
    chain === "ALL"
      ? "WHERE block_time >= NOW() - INTERVAL '365 days'"
      : `
          WHERE block_time >= NOW() - INTERVAL '365 days'
            AND chain = $1
        `;

  const timelineResult = await pool.query<TimelineRow>(
    `
        SELECT
          DATE_TRUNC('day', block_time) AS date,
  
          COALESCE(
            SUM(usd_value)
            FILTER (WHERE direction = 'INFLOW'),
            0
          )::TEXT AS inflow_usd,
  
          COALESCE(
            SUM(usd_value)
            FILTER (WHERE direction = 'OUTFLOW'),
            0
          )::TEXT AS outflow_usd,
  
          COALESCE(SUM(usd_value), 0)::TEXT AS total_usd,
  
          COUNT(*)::TEXT AS transfer_count
        FROM transfers
        ${timelineWhere}
        GROUP BY DATE_TRUNC('day', block_time)
        ORDER BY DATE_TRUNC('day', block_time) ASC
      `,
    filter.values
  );

  const transferWhere =
    chain === "ALL"
      ? "WHERE (transfer.pair_id IS NULL OR transfer.pairing_method IS DISTINCT FROM 'REFERENCE' OR transfer.direction = 'INFLOW')"
      : `
          WHERE (transfer.chain = $1 OR paired.chain = $1)
            AND (transfer.pair_id IS NULL OR transfer.pairing_method IS DISTINCT FROM 'REFERENCE' OR transfer.direction = 'INFLOW')
        `;

  const transfersResult = await pool.query<TransferDatabaseRow>(
    `
          SELECT
            transfer.id,
            transfer.chain,
            transfer.wallet_address,
            transfer.tx_hash,
            transfer.block_number,
            transfer.block_time,
            transfer.direction,
            transfer.token_address,
            transfer.asset_symbol,
            transfer.decimals,
            transfer.raw_amount::TEXT,
            transfer.amount::TEXT,
            transfer.usd_value::TEXT,
            transfer.counterparty,
            transfer.status,
            transfer.explorer_url,
            CASE WHEN transfer.pairing_method = 'REFERENCE' THEN transfer.pair_id ELSE NULL END AS pair_id,
            paired.explorer_url AS pair_explorer_url,
            paired.chain AS pair_chain,
            paired.wallet_address AS pair_wallet_address,
            paired.tx_hash AS pair_tx_hash,
            paired.block_time AS pair_block_time,
            paired.direction AS pair_direction,
            paired.asset_symbol AS pair_asset_symbol,
            paired.amount::TEXT AS pair_amount,
            paired.usd_value::TEXT AS pair_usd_value,
            paired.counterparty AS pair_counterparty,
            paired.status AS pair_status
          FROM transfers transfer
          LEFT JOIN transfers paired
            ON paired.id = transfer.pair_id
           AND transfer.pairing_method = 'REFERENCE'
          ${transferWhere}
          ORDER BY transfer.block_time DESC,
                   transfer.chain ASC,
                   transfer.block_number::NUMERIC DESC NULLS LAST,
                   transfer.log_index DESC
          LIMIT 500
        `,
    filter.values
  );

  const transfers: TransferRow[] = transfersResult.rows.map((row) => ({
    id: row.id,
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
    pairedLeg:
      row.pair_id &&
      row.pair_chain &&
      row.pair_wallet_address &&
      row.pair_tx_hash &&
      row.pair_block_time &&
      row.pair_direction &&
      row.pair_asset_symbol &&
      row.pair_amount &&
      row.pair_usd_value &&
      row.pair_counterparty &&
      row.pair_status &&
      row.pair_explorer_url
        ? {
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
          }
        : null,
  }));

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
      transferCount: Number(metricsRow?.transfer_count ?? 0),
      activeWallets: Number(metricsRow?.active_wallets ?? 0),
      pairedTransferCount: Number(metricsRow?.paired_transfer_count ?? 0),
      lastSyncedAt: metricsRow?.last_synced_at
        ? toIsoString(metricsRow.last_synced_at)
        : null,
      latestTransactionAt: metricsRow?.latest_transaction_at
        ? toIsoString(metricsRow.latest_transaction_at)
        : null,
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
