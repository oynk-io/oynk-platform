export type Chain = "BSC" | "SOLANA";

export type TransferDirection = "INFLOW" | "OUTFLOW";

export type TransferStatus = "CONFIRMED" | "FAILED" | "PENDING";

export type DashboardMetrics = {
  grossTransferVolumeUsd: number;
  inflowVolumeUsd: number;
  outflowVolumeUsd: number;
  estimatedSettledVolumeUsd: number;
  pairedSettlementVolumeUsd: number;
  unmatchedTransferVolumeUsd: number;
  settlementCount: number;
  lastIndexedAt: string | null;
  latestIndexedBlock: string | null;
  chainLag: number | null;
  totalUsd: number;
  inflowUsd: number;
  outflowUsd: number;
  bscUsd: number;
  solanaUsd: number;
  transferCount: number;
  activeWallets: number;
  pairedTransferCount: number;
  lastSyncedAt: string | null;
  latestTransactionAt: string | null;
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
  pairedLeg: TransferLeg | null;
};

export type TransferLeg = {
  id: string;
  chain: Chain;
  walletAddress: string;
  txHash: string;
  timestamp: string;
  direction: TransferDirection;
  assetSymbol: string;
  amount: string;
  usdValue: string;
  counterparty: string;
  status: TransferStatus;
  explorerUrl: string;
};

export type DashboardResponse = {
  metrics: DashboardMetrics;
  timeline: TimelinePoint[];
  transfers: TransferRow[];
};

export type SyncState = "IDLE" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";

export type SynchronizationStatus = {
  state: SyncState;
  startedAt: string | null;
  completedAt: string | null;
  successfulChains: Chain[];
  failedChains: Chain[];
};

export type SynchronizationAcceptedResponse = {
  accepted: true;
  runId: string;
  status: SynchronizationStatus;
};
