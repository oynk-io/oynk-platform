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
  
          COUNT(*)
            FILTER (WHERE pair_id IS NOT NULL)::TEXT
            AS paired_transfer_count,
  
          MAX(block_time) AS last_synced_at,
  
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
      ? "WHERE block_time >= NOW() - INTERVAL '30 days'"
      : `
          WHERE block_time >= NOW() - INTERVAL '30 days'
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

  const transferWhere = chain === "ALL" ? "" : "WHERE transfer.chain = $1";

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
            transfer.pair_id,
            paired.explorer_url AS pair_explorer_url
          FROM transfers transfer
          LEFT JOIN transfers paired
            ON paired.id = transfer.pair_id
          ${transferWhere}
          ORDER BY transfer.block_time DESC
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
  }));

  return {
    metrics: {
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
