export type TeamsMockExampleScenariosV1 = {
  version: 1;
  generatedAt: UnixTimestampSeconds;
  scenarios: TeamsMockScenario[];
};

export type TeamsMockScenario = {
  id: TeamsMockScenarioId;
  label: string;
  data: TeamsMockDataV1;
};

export type TeamsMockScenarioId =
  | "directory-observer"
  | "team-owner-funding"
  | "bonus-available"
  | "finance-operator-revenue"
  | "retired-read-only"
  | "operator-admin";

export type TeamsMockDataV1 = {
  version: 1;
  generatedAt: UnixTimestampSeconds;
  currentPeriod: PeriodNumber;
  financialData: TeamsFinancialDataState;
  viewer: TeamsViewerContext;
  selectedTeamId: TeamId | null;
  totals: TeamsTotals;
  teams: TeamRecord[];
  admin?: TeamsAdminRecord;
};

export type UnixTimestampSeconds = number;
export type PeriodNumber = number;
export type TeamId = string;
export type TeamsAddress = string;
export type DecimalString = string;
export type UsdDecimalString = string;
export type RawTokenAmountString = string;
export type ProtocolUsd18String = string & {
  readonly __protocolUsd18: unique symbol;
};
export type BasisPoints = number;

export type TeamsFinancialDataState =
  | {
      status: "available";
      source: "mock" | "feed";
      usdDecimals: 18;
    }
  | {
      status: "unavailable";
      source: "feed";
      reason: "incompatible-feed";
      feedVersion: number;
    };

export type TeamsViewerContext = {
  role: TeamsViewerRole;
  address: TeamsAddress | null;
  teamId: TeamId | null;
  walletStatus?: TeamsWalletStatus;
  actionStateTrusted?: boolean;
  revenueDepositsEnabled?: boolean;
  canDepositRevenue: boolean;
  canClaimFunding: boolean;
  canReturnFunding: boolean;
  canClaimBonus: boolean;
  canUseAdmin: boolean;
};

export type TeamsWalletStatus =
  | "disconnected"
  | "switch-mainnet"
  | "mainnet";

export type TeamsDepositReadiness = {
  state:
    | "untrusted"
    | "disconnected"
    | "switch-mainnet"
    | "restricted"
    | "unsupported"
    | "ready";
  canSubmit: boolean;
};

export type TeamsViewerRole =
  | "observer"
  | "team-owner"
  | "finance-operator"
  | "operator-admin";

export type TeamsTotals = {
  currentPeriod: TeamFinancials;
  lifetime: TeamFinancials;
  activeTeamCount: number;
  retiringTeamCount: number;
  retiredTeamCount: number;
};

export type TeamRecord = {
  id: TeamId;
  name: string;
  address: TeamsAddress;
  owner: TeamsAddress;
  pendingOwner: TeamsAddress | null;
  status: TeamLifecycleStatus;
  readOnlyReason: TeamReadOnlyReason | null;
  financialData: TeamsFinancialDataState;
  currentPeriod: TeamFinancials;
  financialPeriods: TeamFinancialPeriod[];
  lifetime: TeamFinancials;
  lifecycle: TeamLifecycleState;
  revenueOptions: RevenueOption[];
  revenueHistory: RevenueHistoryEntry[];
  fundingSummary: TeamFundingSummary;
  fundingApprovals: FundingApproval[];
  fundingReturns: FundingReturnEntry[];
  bonus: TeamBonusState;
};

export type TeamLifecycleStatus = "active" | "retiring" | "retired";
export type TeamReadOnlyReason = "retired" | "successor-active";

export type TeamFinancials = {
  revenueUsd: UsdDecimalString;
  costUsd: UsdDecimalString;
  profitUsd: UsdDecimalString;
  lossUsd: UsdDecimalString;
};

export type TeamFinancialPeriod = {
  period: PeriodNumber;
  startsAt: UnixTimestampSeconds | null;
  endsAt: UnixTimestampSeconds | null;
  financials: TeamFinancials;
};

export type TeamLifecycleState = {
  migrationReadiness: TeamMigrationReadiness;
  successorTeamId: TeamId | null;
  retirementAnnouncedAt: UnixTimestampSeconds | null;
  retirementEffectivePeriod: PeriodNumber | null;
};

export type TeamMigrationReadiness =
  | "not-needed"
  | "pending"
  | "ready"
  | "completed";

export type RevenueOption = {
  symbol: string;
  tokenAddress: TeamsAddress;
  decimals: number;
  isConvertible: boolean;
  converterAddress?: TeamsAddress | null;
  convertToSymbol: string | null;
  oraclePriceUsd: UsdDecimalString | null;
  previewAmount: DecimalString | null;
  estimatedCreditUsd: UsdDecimalString | null;
};

export type RevenueHistoryEntry = {
  id: string;
  txHash?: string;
  logIndex?: number;
  period: PeriodNumber;
  symbol: string;
  amount: DecimalString;
  creditedUsd: UsdDecimalString;
  converterAddress?: TeamsAddress | null;
  convertedToSymbol: string | null;
  depositedBy: TeamsAddress;
  createdAt: UnixTimestampSeconds;
};

export type TeamFundingSummary = {
  state: TeamFundingSummaryState;
  claimableUsd: UsdDecimalString | null;
  refundableUsd: UsdDecimalString | null;
};

export type TeamFundingSummaryState =
  | "no-approvals"
  | "has-claimable"
  | "partially-claimed"
  | "has-expired"
  | "current-unavailable"
  | "fully-used";

export type FundingApproval = {
  id: string;
  idx: number;
  approvedPeriod: PeriodNumber;
  symbol: string;
  tokenAddress: TeamsAddress;
  decimals: number;
  amountRaw: RawTokenAmountString;
  usedRaw: RawTokenAmountString;
  claimableRaw: RawTokenAmountString;
  claimedRaw: RawTokenAmountString;
  returnedRaw: RawTokenAmountString;
  returnableRaw: RawTokenAmountString;
  totalApproved: DecimalString;
  used: DecimalString;
  claimable: DecimalString;
  streamDurationDays: number;
  status: FundingApprovalStatus;
  recipient: TeamsAddress | null;
  claimedCostUsd: UsdDecimalString | null;
  refundValueUsd: UsdDecimalString | null;
  averageClaimPriceUsd: UsdDecimalString | null;
};

export type FundingApprovalStatus =
  | "claimable-current-period"
  | "partially-claimed"
  | "expired"
  | "scheduled"
  | "current-unavailable"
  | "fully-used";

export type FundingReturnEntry = {
  id: string;
  txHash?: string;
  logIndex?: number;
  approvalId: string;
  approvalIdx: number;
  period: PeriodNumber;
  symbol: string;
  decimals: number;
  amountRaw: RawTokenAmountString;
  amount: DecimalString;
  refundValueUsd: UsdDecimalString | null;
  returnedBy: TeamsAddress;
  createdAt: UnixTimestampSeconds;
};

export type TeamBonusState = {
  tokenSymbol: "YFI";
  tokenDecimals: number;
  status: TeamBonusStatus;
  totalClaimableRaw: RawTokenAmountString;
  totalClaimable: DecimalString;
  includedPeriodCount: number;
  periods: BonusPeriod[];
};

export type TeamBonusStatus =
  | "none"
  | "pending-finalization"
  | "claimable"
  | "claimed";

export type BonusPeriod = {
  period: PeriodNumber;
  status: BonusPeriodStatus;
  finalized: boolean;
  claimed: boolean;
  profitUsd: UsdDecimalString;
  adjustedPriceUsd: UsdDecimalString;
  bonusFactorBps: BasisPoints;
  ybcSplitBps: BasisPoints;
  claimableYfiRaw: RawTokenAmountString;
  claimableYfi: DecimalString;
};

export type BonusPeriodStatus =
  | "pending-finalization"
  | "finalized-claimable"
  | "finalized-zero"
  | "claimed";

export type TeamsAdminRecord = {
  registryStatus: TeamsRegistryStatus;
  periodFinalizationStatus: PeriodFinalizationStatus;
  rewardsBucket: BucketRecord;
  treasuryBucket: BucketRecord;
  recoveryBucket: BucketRecord;
  whitelistedRevenueTokens: RevenueTokenAdminRecord[];
  fundingQueue: AdminFundingQueueEntry[];
  bonusQueue: AdminBonusQueueEntry[];
};

export type TeamsRegistryStatus = "active" | "paused" | "deprecated";
export type PeriodFinalizationStatus = "open" | "ready" | "finalized";

export type BucketUnit =
  | {
      kind: "usd";
      symbol: "USD";
    }
  | {
      kind: "token";
      symbol: string;
      decimals: number;
    };

export type BucketRecord =
  | {
      sourceAvailable: true;
      unit: BucketUnit;
      budget: DecimalString;
      used: DecimalString;
      remaining: DecimalString;
      status: Exclude<BucketStatus, "unavailable">;
    }
  | {
      sourceAvailable: false;
      unit: null;
      budget: null;
      used: null;
      remaining: null;
      status: "unavailable";
    };

export type BucketStatus =
  | "healthy"
  | "watch"
  | "limit-reached"
  | "unavailable";

export type RevenueTokenAdminRecord = {
  symbol: string;
  tokenAddress: TeamsAddress;
  oracle: TeamsAddress;
  converter: TeamsAddress | null;
  status: RevenueTokenAdminStatus;
};

export type RevenueTokenAdminStatus = "active" | "paused";

export type AdminFundingQueueEntry = {
  approvalId: string;
  approvalIdx: number;
  teamId: TeamId;
  status: FundingApprovalStatus;
  requiresOperatorAttention: boolean;
};

export type AdminBonusQueueEntry = {
  teamId: TeamId;
  period: PeriodNumber;
  status: BonusPeriodStatus;
  requiresFinalization: boolean;
};
