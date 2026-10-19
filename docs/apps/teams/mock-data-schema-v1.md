# Team Finances Mock Data Schema v1

Purpose: a stable mock data contract for design, prototypes, and mock-backed implementation.

`mock-data.example.json` is a scenario set. Each scenario contains one complete
`TeamsMockDataV1` payload so later prototypes can swap user context without changing
the field contract. The follow-on debug-runtime alignment work uses these scenarios as
seed presets behind the debug panel and E2E bridge rather than as visible route-local
controls.

The TypeScript mirror for this contract lives in `lib/clients/teams/types.ts`.
Update this document, that type mirror, and `examples/mock-data.example.json` together.

## Type shape

```ts
type TeamsMockExampleScenariosV1 = {
  version: 1;
  generatedAt: UnixTimestampSeconds;
  scenarios: TeamsMockScenario[];
};

type TeamsMockScenario = {
  id:
    | "directory-observer"
    | "team-owner-funding"
    | "bonus-available"
    | "finance-operator-revenue"
    | "retired-read-only"
    | "operator-admin";
  label: string;
  data: TeamsMockDataV1;
};

type TeamsMockDataV1 = {
  version: 1;
  generatedAt: UnixTimestampSeconds;
  currentPeriod: PeriodNumber;
  viewer: TeamsViewerContext;
  selectedTeamId: TeamId | null;
  totals: TeamsTotals;
  teams: TeamRecord[];
  admin?: TeamsAdminRecord;
};

type UnixTimestampSeconds = number;
type PeriodNumber = number;
type TeamId = string;
type Address = string;
type DecimalString = string;
type UsdDecimalString = string;
type BasisPoints = number;

type TeamsViewerContext = {
  role: "observer" | "team-owner" | "finance-operator" | "operator-admin";
  address: Address | null;
  teamId: TeamId | null;
  canDepositRevenue: boolean;
  canClaimFunding: boolean;
  canReturnFunding: boolean;
  canClaimBonus: boolean;
  canUseAdmin: boolean;
};

type TeamsTotals = {
  currentPeriod: TeamFinancials;
  lifetime: TeamFinancials;
  activeTeamCount: number;
  retiringTeamCount: number;
  retiredTeamCount: number;
};

type TeamRecord = {
  id: TeamId;
  name: string;
  address: Address;
  owner: Address;
  pendingOwner: Address | null;
  status: TeamLifecycleStatus;
  readOnlyReason: "retired" | "successor-active" | null;
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

type TeamLifecycleStatus = "active" | "retiring" | "retired";

type TeamFinancials = {
  revenueUsd: UsdDecimalString;
  costUsd: UsdDecimalString;
  profitUsd: UsdDecimalString;
  lossUsd: UsdDecimalString;
};

type TeamFinancialPeriod = {
  period: PeriodNumber;
  startsAt: UnixTimestampSeconds | null;
  endsAt: UnixTimestampSeconds | null;
  financials: TeamFinancials;
};

type TeamLifecycleState = {
  migrationReadiness: "not-needed" | "pending" | "ready" | "completed";
  successorTeamId: TeamId | null;
  retirementAnnouncedAt: UnixTimestampSeconds | null;
  retirementEffectivePeriod: PeriodNumber | null;
};

type RevenueOption = {
  symbol: string;
  tokenAddress: Address;
  decimals: number;
  isConvertible: boolean;
  convertToSymbol: string | null;
  oraclePriceUsd: UsdDecimalString;
  previewAmount: DecimalString;
  estimatedCreditUsd: UsdDecimalString;
};

type RevenueHistoryEntry = {
  id: string;
  period: PeriodNumber;
  symbol: string;
  amount: DecimalString;
  creditedUsd: UsdDecimalString;
  convertedToSymbol: string | null;
  depositedBy: Address;
  createdAt: UnixTimestampSeconds;
};

type TeamFundingSummary = {
  state:
    | "no-approvals"
    | "has-claimable"
    | "partially-claimed"
    | "late-liquid-available"
    | "fully-used";
  claimableUsd: UsdDecimalString;
  refundableUsd: UsdDecimalString;
};

type FundingApproval = {
  id: string;
  idx: number;
  approvedPeriod: PeriodNumber;
  symbol: string;
  tokenAddress: Address;
  totalApproved: DecimalString;
  used: DecimalString;
  claimable: DecimalString;
  streamDurationDays: number;
  status: FundingApprovalStatus;
  recipient: Address | null;
  claimedCostUsd: UsdDecimalString;
  refundValueUsd: UsdDecimalString;
  averageClaimPriceUsd: UsdDecimalString | null;
};

type FundingApprovalStatus =
  | "claimable-current-period"
  | "partially-claimed"
  | "late-liquid"
  | "not-current-period"
  | "fully-used";

type FundingReturnEntry = {
  id: string;
  approvalId: string;
  period: PeriodNumber;
  symbol: string;
  amount: DecimalString;
  refundValueUsd: UsdDecimalString;
  returnedBy: Address;
  createdAt: UnixTimestampSeconds;
};

type TeamBonusState = {
  tokenSymbol: "YFI";
  status: TeamBonusStatus;
  totalClaimable: DecimalString;
  includedPeriodCount: number;
  periods: BonusPeriod[];
};

type TeamBonusStatus = "none" | "pending-finalization" | "claimable" | "claimed";

type BonusPeriod = {
  period: PeriodNumber;
  status: BonusPeriodStatus;
  finalized: boolean;
  claimed: boolean;
  profitUsd: UsdDecimalString;
  adjustedPriceUsd: UsdDecimalString;
  bonusFactorBps: BasisPoints;
  ybcSplitBps: BasisPoints;
  claimableYfi: DecimalString;
};

type BonusPeriodStatus =
  | "pending-finalization"
  | "finalized-claimable"
  | "finalized-zero"
  | "claimed";

type TeamsAdminRecord = {
  registryStatus: "active" | "paused" | "deprecated";
  periodFinalizationStatus: "open" | "ready" | "finalized";
  rewardsBucket: BucketRecord;
  treasuryBucket: BucketRecord;
  recoveryBucket: BucketRecord;
  whitelistedRevenueTokens: RevenueTokenAdminRecord[];
  fundingQueue: AdminFundingQueueEntry[];
  bonusQueue: AdminBonusQueueEntry[];
};

type BucketRecord = {
  budget: UsdDecimalString;
  used: UsdDecimalString;
  remaining: UsdDecimalString;
  status: "healthy" | "watch" | "limit-reached";
};

type RevenueTokenAdminRecord = {
  symbol: string;
  tokenAddress: Address;
  oracle: Address;
  converter: Address | null;
  status: "active" | "paused";
};

type AdminFundingQueueEntry = {
  approvalId: string;
  teamId: TeamId;
  status: FundingApprovalStatus;
  requiresOperatorAttention: boolean;
};

type AdminBonusQueueEntry = {
  teamId: TeamId;
  period: PeriodNumber;
  status: BonusPeriodStatus;
  requiresFinalization: boolean;
};
```

## State enums

### Team lifecycle

- `active`: normal workspace state.
- `retiring`: team is still visible, with a migration or successor state surfaced.
- `retired`: read-only workspace state.

### Funding approvals

- `claimable-current-period`: approval belongs to the current period and still has claimable balance.
- `partially-claimed`: approval has both used and claimable balance.
- `late-liquid`: approval is no longer stream-backed and remaining balance is liquid immediately.
- `not-current-period`: approval is visible but not claimable in the current period.
- `fully-used`: approval has no remaining claimable balance.

### Bonus

- `none`: team has no current or historical claimable bonus.
- `pending-finalization`: at least one bonus period is present but not finalized.
- `claimable`: at least one finalized period has unclaimed YFI.
- `claimed`: included finalized periods have already been claimed.

## Rules

- Token amounts are decimal strings in display units, never wei integers.
- USD values are decimal strings with no currency symbol or thousands separators.
- Basis-point fields are integers. YBC splits use `0` to `10000`; bonus factors use
  `0` to `20000`, as bounded by `BonusDistributor`.
- All timestamps are Unix seconds.
- Period fields are non-negative protocol period numbers.
- Aggregate totals are period-scoped. `totals.currentPeriod` and `totals.lifetime` must
  remain distinct and must reconcile with the teams included in that scenario payload.
- Team ids and record ids are stable lowercase strings suitable for mock routing and tests.
- `selectedTeamId` is `null` for directory-only scenarios.
- Revenue deposit is permissionless. `viewer.canDepositRevenue` may be true even when the
  viewer is not the team owner.
- Bonus periods with `pending-finalization` status must keep `claimableYfi` at `"0"`.
- `claimableYfi` is unclaimed gross YFI, including the YBC share. Claimed periods
  show zero; finalized unclaimed periods use the distributor's profit, factor, and
  adjusted-price formula.
- Retired teams must set a non-null `readOnlyReason`.
