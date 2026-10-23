import type { Address } from "viem";

export type StyfiParticipation = {
  votes: bigint;
  proposals: bigint;
};

export type StyfiAprValuation = {
  yfiPriceCts: bigint | null;
  timestamp: number | null;
  stale: boolean;
};

export type StyfiAccountApr = {
  address: Address;
  styfiActive: bigint;
  styfixActive: bigint;
  externalActive: bigint;
  totalActive: bigint;
  isYbcMember: boolean;
  /** Only attributable to stYFI when the wallet has no external positions. */
  yourStyfiAprBps: number | null;
  portfolioAprBps: number | null;
  /** Additive contributions to portfolio APR, using the same total-active denominator. */
  baseAprBps: number | null;
  delegatedAprBps: number | null;
  voteBoostAprBps: number | null;
  ybcAprBps: number | null;
  externalAprBps: number | null;
  /** Current stream annualized, in native reward-token units. */
  annualRewards: bigint;
  participation: StyfiParticipation;
};

export type StyfiAprSnapshot = {
  status: "available" | "unavailable";
  blockNumber: bigint | null;
  timestamp: number | null;
  currentEpoch: number | null;
  rewardEpoch: number | null;
  baseAprBps: number | null;
  /** Hypothetical fully participating stYFI rate at the observed pool rates. */
  maxAprBps: number | null;
  /** Actual current rate of the delegated pool, including its historical boost. */
  styfixAprBps: number | null;
  delegatedParticipation: StyfiParticipation | null;
  valuation: StyfiAprValuation;
  account: StyfiAccountApr | null;
};

export type StyfiAprPosition = {
  styfi: bigint;
  styfix: bigint;
  liquidLockers: readonly bigint[];
  veYfi: bigint;
  veRewardWeight: bigint;
  boostWeight: bigint;
};

export type StyfiAprInputs = {
  blockNumber: bigint;
  timestamp: number;
  currentEpoch: number;
  rewardEpoch: number;
  valuation: StyfiAprValuation;
  rewardDecimals: number;
  rewardAssetDecimals: number;
  rewardAssetsPerShare: bigint;
  stakingEpochRewards: bigint;
  stakingWeight: bigint;
  styfixSupply: bigint;
  delegatedPosition: StyfiAprPosition;
  boostEpochRewards: bigint;
  boostTotalWeight: bigint;
  rewardEpochProposals: bigint;
  delegatedParticipation: StyfiParticipation;
  liquidLockerEpochRewards: readonly bigint[];
  liquidLockerSupplies: readonly bigint[];
  veEpochRewards: bigint;
  veTotalWeight: bigint;
  ybcPosition: StyfiAprPosition;
  ybcSupply: bigint;
  ybcRewardsEnabled: boolean;
  account?: {
    address: Address;
    position: StyfiAprPosition;
    isYbcMember: boolean;
    ybcStake: bigint;
    participation: StyfiParticipation;
    rewardEpochVotes: bigint;
  };
};
