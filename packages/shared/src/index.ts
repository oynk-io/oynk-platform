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

export type UserStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DISABLED";
export type OrganizationType = "BUSINESS" | "SETTLEMENT_PARTNER" | "INTERNAL";
export type OrganizationStatus =
  | "DRAFT"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "COMPLIANCE_INCOMPLETE"
  | "COMPLIANCE_SUBMITTED"
  | "UNDER_REVIEW"
  | "ADDITIONAL_INFORMATION_REQUIRED"
  | "APPROVED"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED"
  | "CLOSED";
export type PlatformMode = "SANDBOX" | "TEST" | "LIVE";
export type OtpPurpose =
  | "SIGN_IN"
  | "EMAIL_VERIFICATION"
  | "PASSWORD_RESET"
  | "SENSITIVE_ACTION"
  | "PARTNER_ACTIVATION"
  | "BUSINESS_ACTIVATION";

export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
};

export type OrganizationSummary = {
  id: string;
  name: string;
  type: OrganizationType;
  status: OrganizationStatus;
  platformMode: PlatformMode;
  role: string;
  permissions: string[];
};

export type SessionResponse = {
  authenticated: true;
  user: AuthenticatedUser;
  organization: OrganizationSummary | null;
  organizations: OrganizationSummary[];
  expiresAt: string;
  csrfToken: string;
};

export type OtpChallengeResponse = {
  challengeId: string;
  purpose: OtpPurpose;
  expiresAt: string;
  resendAvailableAt: string;
  destinationHint: string;
  developmentCode?: string;
};

export type AuthErrorResponse = {
  error: string;
  code: string;
  requestId?: string;
  fieldErrors?: Record<string, string>;
};

export type BusinessComplianceProfile = {
  legalName: string;
  tradingName: string;
  organizationType: string;
  registrationNumber: string;
  registrationCountry: string;
  incorporationDate: string;
  taxIdentificationNumber: string;
  website: string;
  industry: string;
  businessDescription: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  addressCountry: string;
  expectedMonthlyVolume: string;
  expectedMonthlyTransactions: string;
  sourceOfFunds: string;
  status: "DRAFT" | "SUBMITTED";
  updatedAt: string | null;
};
