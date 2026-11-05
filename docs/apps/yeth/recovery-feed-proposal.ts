// Proposal only. This file is not imported by the application.
// All Amount values use base units. SignedAmount permits negative differences.
export type Amount = string;
export type SignedAmount = string;
export type Address = `0x${string}`;
export type Hash = `0x${string}`;
export type BlockRef = { number: number; hash: Hash; timestamp: number };
export type UnavailableReason =
  | "not_indexed" | "insufficient_history" | "missing_interval" | "stale_source"
  | "unreconciled" | "unknown_routing" | "nonpositive_pace" | "unsupported_asset";

export type RateObservation = {
  value: number | null; // Decimal rate: 0.02 means 2%.
  kind: "apr" | "apy";
  basis: "historical" | "estimated";
  windowDays: number | null;
  netOfFees: boolean;
  includedFees: string[];
  observedAt: number;
  source: string;
  block: BlockRef | null;
  unavailableReason: UnavailableReason | null;
};

export type FlowKind =
  | "strategy_income" | "recurring_recovery_receipt" | "auction_funding"
  | "oneoff_donation" | "direct_redemption" | "auction_take"
  | "wrapper_redemption" | "recycled_proceeds" | "loss" | "other" | "unknown";

export type FlowEvidence = {
  id: string; // chainId:transactionHash:logIndex:classificationVersion
  economicFlowId: string;
  parentFlowIds: string[];
  block: BlockRef;
  transactionHash: Hash;
  logIndex: number;
  kind: FlowKind;
  asset: Address;
  from: Address;
  to: Address;
  assetsWei: Amount;
  sharesWei: Amount | null;
  recurring: boolean | null;
  classificationSource: string;
};

export type DailyRecovery = {
  day: string; // YYYY-MM-DD UTC
  openingBlock: BlockRef;
  closingBlock: BlockRef; // Finalized
  recoveryRateWad: Amount;
  opening: { assetsWei: Amount; sharesWei: Amount; assetsPerShareWad: Amount };
  closing: { assetsWei: Amount; sharesWei: Amount; assetsPerShareWad: Amount };
  flows: {
    strategyIncomeNetWei: SignedAmount | null;
    recurringToRecoveryWei: SignedAmount | null;
    recurringToAuctionsWei: Amount | null;
    donationsToRecoveryWei: Amount | null;
    donationsToAuctionsWei: Amount | null;
    directRedemptionAssetsWei: Amount;
    directRedemptionSharesWei: Amount;
    auctionWethPaidWei: Amount;
    auctionSharesSpentWei: Amount;
    wrapperRedeemedAssetsWei: Amount;
    wrapperRedeemedSharesWei: Amount;
    wrapperForwardedAssetsWei: Amount;
    recycledToRecoveryWei: Amount | null;
    recycledToYieldCapitalWei: Amount | null;
    realizedLossWei: Amount | null;
  };
  // Contribution based on the actual share supply at each receipt.
  recurringRecoveryGrowthWad: SignedAmount | null;
  reconciliation: {
    assetResidualWei: SignedAmount;
    shareResidualWei: SignedAmount;
    toleranceWei: Amount;
    status: "matched" | "within_tolerance" | "unreconciled";
  };
  complete: boolean;
  unavailableReason: UnavailableReason | null;
  evidenceRef: { url: string; sha256: string; eventCount: number };
};

export type TargetEstimate =
  | { targetBps: 5000 | 7500 | 10000; status: "reached"; days: 0 }
  | { targetBps: 5000 | 7500 | 10000; status: "estimated"; days: number }
  | { targetBps: 5000 | 7500 | 10000; status: "beyond_horizon"; horizonDays: number }
  | { targetBps: 5000 | 7500 | 10000; status: "unavailable"; reason: UnavailableReason };

export type RecoveryForecast = {
  method: "recurring-receipts-linear/v1";
  generatedAt: number;
  forecastFrom: number; // Timestamp of the current recovery observation, not a page refresh.
  basis: { from: number; to: number; completeDays: number; historySha256: string };
  dailyRecoveryGrowthWad: SignedAmount | null;
  assumptions: string[];
  excludedFlowKinds: FlowKind[];
  targets: TargetEstimate[];
  sensitivity: Array<{ windowDays: 30 | 90; dailyRecoveryGrowthWad: SignedAmount | null; targets: TargetEstimate[] }>;
};

export type YethRecoveryFeedV2 = {
  schema: "yeth-recovery/v2";
  chainId: 1;
  generatedAt: number;
  observedAt: number;
  block: BlockRef & { finality: "latest" };
  producer: { name: string; version: string; revision: string };
  indexedThrough: BlockRef & { finality: "finalized" };
  contracts: {
    claim: Address; recoveryVault: Address; yieldVault: Address;
    auctionWrapper: Address; underlyingAuction: Address; underlyingAsset: Address;
    assetDecimals: 18; shareDecimals: 18;
  };
  claim: { recoveryRateWad: Amount };
  recoveryVault: {
    assetsWei: Amount; sharesWei: Amount; assetsPerShareWad: Amount;
    verifiedLiquidAssetsWei: Amount | null;
  };
  yieldVault: { assetsWei: Amount; sharesWei: Amount; idleWei: Amount };
  strategies: Array<{
    address: Address; parent: Address; name: string; asset: Address;
    allocatedAssetsWei: Amount; parentAssetsWei: Amount; lastReport: number;
    rates: RateObservation[];
    sourceBlock: BlockRef;
  }>;
  routing: Array<{
    source: Address; destination: Address; effectiveFrom: BlockRef;
    authorizedRule: { fractionBps: number; evidence: string } | null;
  }>;
  auction: {
    wrapper: Address; auction: Address; from: Address; want: Address;
    receiver: Address; destination: Address;
    kickedAt: number; initialAvailableWei: Amount; balanceWei: Amount;
    availableWei: Amount; priceWad: Amount; minimumPriceWad: Amount;
    startingPriceWad: Amount; stepDurationSeconds: number;
    stepDecayRateBps: number; auctionLengthSeconds: number;
    state: "not_started" | "disabled" | "active" | "empty" | "expired";
  };
  quality: {
    snapshotMaxAgeSeconds: number;
    historyCompleteFrom: number | null;
    missingRanges: Array<{ fromBlock: number; toBlock: number }>;
    errors: Array<{ source: string; reason: UnavailableReason }>;
  };
  history: { url: string; schema: "yeth-recovery-history/v1"; revision: string; sha256: string };
  baseline: RecoveryBaseline | null;
  holders: { url: string; schema: "yeth-recovery-holders/v1"; revision: string; sha256: string } | null;
  auctionHistory: { url: string; schema: "yeth-recovery-auctions/v1"; revision: string; sha256: string } | null;
  funding: RecoveryFundingWindow | null;
  claimExitCohort: ClaimExitCohort | null;
  forecast: RecoveryForecast;
};

export type YethRecoveryHistoryV1 = {
  schema: "yeth-recovery-history/v1";
  chainId: 1;
  generatedAt: number;
  revision: string;
  indexedThrough: BlockRef & { finality: "finalized" };
  days: DailyRecovery[];
};


export type RecoveryBaseline = {
  block: BlockRef;
  normalizedRecoveryWad: Amount;
  evidence: { url: string; sha256: string };
};

export type HolderPosition = {
  address: Address;
  sharesWei: Amount;
  classification: "holder" | "protocol_custody" | "unclassified";
  classificationEvidence: string | null;
};

export type RecoveryHoldersV1 = {
  schema: "yeth-recovery-holders/v1";
  chainId: 1;
  revision: string;
  indexedFromBlock: number;
  block: BlockRef & { finality: "finalized" };
  complete: boolean;
  maxAgeSeconds: number;
  missingRanges: Array<{ fromBlock: number; toBlock: number }>;
  classificationVersion: string;
  recoveryRateWad: Amount;
  holderAccountCount: number;
  representedClaimWei: Amount;
  buckets: Array<{
    minClaimWei: Amount;
    maxClaimWeiExclusive: Amount | null;
    accounts: number;
    representedClaimWei: Amount;
  }>;
  totalSupplyWei: Amount;
  holderSharesWei: Amount;
  protocolCustodySharesWei: Amount;
  unclassifiedSharesWei: Amount;
  reconciliationResidualWei: SignedAmount;
  // Exactly one transport. Page hashes belong to this immutable revision.
  positions:
    | { kind: "inline"; values: HolderPosition[] }
    | { kind: "pages"; pages: Array<{ url: string; sha256: string; count: number }> };
};


export type AuctionFill = {
  id: string; // chainId:transactionHash:settlementLogIndex
  auction: Address;
  roundId: string; // Auction address plus verified kick event identity.
  kickEvidenceId: string;
  block: BlockRef;
  transactionHash: Hash;
  settlementLogIndex: number;
  transactionSender: Address;
  sharePayer: Address | null;
  outputRecipient: Address | null;
  attribution: "verified" | "unknown";
  sharesSpentWei: Amount;
  wethReceivedWei: Amount;
  recoveryRateWad: Amount; // Effective at the fill block.
  normalizedRecoveryWad: Amount; // floor(wethReceivedWei * recoveryRateWad / sharesSpentWei)
  classificationVersion: string;
  settlementEvidenceIds: string[];
};

export type RecoveryAuctionsV1 = {
  schema: "yeth-recovery-auctions/v1";
  chainId: 1;
  revision: string;
  generatedAt: number;
  indexedFromBlock: number;
  indexedThrough: BlockRef & { finality: "finalized" };
  complete: boolean;
  missingRanges: Array<{ fromBlock: number; toBlock: number }>;
  // All completed fills, newest first. Page references belong to this revision.
  fills:
    | { kind: "inline"; values: AuctionFill[] }
    | { kind: "pages"; pages: Array<{ url: string; sha256: string; count: number }> };
};


// An allocation credits original external funds once. Internal transfers reuse its
// economicFlowId and cannot create another credited amount.
export type RecoveryFundingAllocation = {
  id: string;
  economicFlowId: string;
  source: "recurring_yield" | "external_donation" | "recycled" | "unknown";
  sourceRecognizedAt: number | null;
  receivedAt: number;
  allocatedAt: number;
  destination: "recovery_vault" | "auction";
  amountWei: Amount;
  roundId: string | null;
  evidenceIds: string[];
};

export type AuctionFundingBreakdown = {
  roundId: string;
  kickBlock: BlockRef;
  openingInventoryWei: Amount;
  carriedInventoryWei: Amount;
  newYieldWei: Amount;
  newDonationsWei: Amount;
  recycledWei: Amount;
  unknownWei: Amount;
  reconciliationResidualWei: SignedAmount;
  allocationIds: string[];
};

export type RecoveryFundingWindow = {
  from: number; // Exclusive; selected by allocatedAt.
  to: number; // Inclusive.
  indexedThrough: BlockRef & { finality: "finalized" };
  complete: boolean;
  unavailableReason: UnavailableReason | null;
  vault: { yieldWei: Amount; donationsWei: Amount };
  auctions: { yieldWei: Amount; donationsWei: Amount };
  // Excluded from the new-funding split; retained for reconciliation.
  recycledWei: Amount;
  unknownWei: Amount;
  pendingAllocationWei: Amount;
  returnedWei: Amount;
  newlyFundedRounds: number;
  totalKickedRounds: number;
  vaultFractionWad: Amount | null; // Null when no new funds or incomplete.
  evidence: { url: string; sha256: string; revision: string };
};

export type ClaimExitCohort = {
  basis: "original-claim-window/v1";
  block: BlockRef & { finality: "finalized" };
  complete: boolean;
  unavailableReason: UnavailableReason | null;
  claimedPrincipalWei: Amount;
  exitedPrincipalWei: Amount;
  remainingHolderPrincipalWei: Amount;
  unsettledCustodyPrincipalWei: Amount;
  unresolvedPrincipalWei: SignedAmount;
  roundingResidualWei: SignedAmount;
  exitedFractionWad: Amount | null;
  // Auction settlement retires principal once; later wrapper burns are excluded.
  exitPrincipalByRoute: {
    claimAndExitWei: Amount;
    holderRedemptionWei: Amount;
    auctionSettlementWei: Amount;
  };
  manualClaimsIncluded: false;
  evidence: { url: string; sha256: string; revision: string };
};
