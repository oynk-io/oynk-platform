export type Chain = "BSC" | "SOLANA";

export type TransferDirection = "INFLOW" | "OUTFLOW";

export type TransferStatus = "CONFIRMED" | "FAILED" | "PENDING";

export type DashboardMetrics = {
  totalUsd: number;
  inflowUsd: number;
  outflowUsd: number;
  bscUsd: number;
  solanaUsd: number;
  transferCount: number;
  activeWallets: number;
  pairedTransferCount: number;
  lastSyncedAt: string | null;
};

export type TimelinePoint = {
  date: string;
  inflowUsd: number;
  outflowUsd: number;
  totalUsd: number;
  transferCount: number;
};

export type TransferRow = {
  id: string;
  chain: Chain;
  walletAddress: string;
  txHash: string;
  blockNumber: string | null;

  /**
   * ISO-8601 blockchain timestamp returned to the web app.
   */
  timestamp: string;

  direction: TransferDirection;
  tokenAddress: string;
  assetSymbol: string;
  decimals: number;
  rawAmount: string;
  amount: string;
  usdValue: string;
  counterparty: string;
  status: TransferStatus;
  explorerUrl: string;

  pairId: string | null;
  pairExplorerUrl: string | null;
};

export type DashboardResponse = {
  metrics: DashboardMetrics;
  timeline: TimelinePoint[];
  transfers: TransferRow[];
};
