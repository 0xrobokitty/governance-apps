import type {
  StyfiAprInputs,
  StyfiAprPosition,
  StyfiAprSnapshot,
  StyfiAprValuation,
  StyfiParticipation,
  StyfiRewardScale,
  StyfiRewardScales,
} from "./apr-types";

const YFI_UNIT = 10n ** 18n;
const EPOCH_SECONDS = 14n * 24n * 60n * 60n;
const YEAR_SECONDS = 365n * 24n * 60n * 60n;
const PRECISION = 1_000_000n;

function fullBoostScale(scales: StyfiRewardScales): StyfiRewardScale | null {
  const { staking, voteBoost } = scales;
  if (!staking || staking.numerator <= 0n || staking.denominator <= 0n) return null;
  if (!voteBoost) return { numerator: 1n, denominator: 1n };
  if (voteBoost.numerator < 0n || voteBoost.denominator <= 0n) return null;
  const denominator = staking.numerator * voteBoost.denominator;
  return {
    numerator: denominator + voteBoost.numerator * staking.denominator,
    denominator,
  };
}

/** Reward-weight multiplier, not the ratio of historical APRs or a future APR forecast. */
export function deriveVoteBoostMultiplier(
  scales: StyfiRewardScales,
  participation?: StyfiParticipation,
): number | null {
  const full = fullBoostScale(scales);
  if (!full) return null;
  let numerator = full.numerator;
  let denominator = full.denominator;
  if (participation) {
    if (participation.proposals < 0n || participation.votes < 0n || participation.votes > participation.proposals) return null;
    // sync_total_weight returns zero when the rolling window has no proposals.
    if (participation.proposals === 0n) return 1;
    numerator = denominator * participation.proposals + (numerator - denominator) * participation.votes;
    denominator *= participation.proposals;
  }
  const multiplier = Number(numerator * PRECISION / denominator) / Number(PRECISION);
  return Number.isFinite(multiplier) ? multiplier : null;
}

export function unpackVoteBoostWeight(packed: bigint, epoch: number): bigint {
  return ((packed >> (BigInt(epoch % 5) * 50n)) & ((1n << 50n) - 1n)) * 10n ** 10n;
}

function share(rewards: bigint, weight: bigint, total: bigint): bigint {
  return total > 0n ? (rewards * weight) / total : 0n;
}

function annualize(epochRewards: bigint): bigint {
  return (epochRewards * YEAR_SECONDS) / EPOCH_SECONDS;
}

export function unavailableStyfiAprSnapshot(
  valuation: StyfiAprValuation = { yfiPriceCts: null, timestamp: null, stale: true },
): StyfiAprSnapshot {
  return {
    status: "unavailable",
    blockNumber: null,
    timestamp: null,
    currentEpoch: null,
    rewardEpoch: null,
    baseAprBps: null,
    maxAprBps: null,
    maxVoteBoostMultiplier: null,
    appliedMaxVoteBoostMultiplier: null,
    fullBoostEstimateAprBps: null,
    fullBoostStyfixEstimateAprBps: null,
    styfixAprBps: null,
    delegatedParticipation: null,
    valuation,
    account: null,
  };
}

/** Current reward streams, annualized at unchanged balances and token prices. */
export function deriveStyfiAprSnapshot(input: StyfiAprInputs): StyfiAprSnapshot {
  function apr(epochRewards: bigint, capital: bigint, scale: StyfiRewardScale = { numerator: 1n, denominator: 1n }): number | null {
    const price = input.valuation.yfiPriceCts;
    if (capital <= 0n || price === null || price <= 0n || input.rewardAssetsPerShare <= 0n) {
      return null;
    }
    const numerator = epochRewards * input.rewardAssetsPerShare * YFI_UNIT * 100n * 10_000n * YEAR_SECONDS * scale.numerator;
    const denominator = 10n ** BigInt(input.rewardDecimals) * 10n ** BigInt(input.rewardAssetDecimals) * capital * price * EPOCH_SECONDS * scale.denominator;
    const result = Number((numerator * PRECISION) / denominator) / Number(PRECISION);
    return Number.isFinite(result) ? result : null;
  }

  const baseIncome = (position: StyfiAprPosition) =>
    share(input.stakingEpochRewards, position.styfi, input.stakingWeight);
  const boostIncome = (position: StyfiAprPosition) =>
    share(input.boostEpochRewards, position.boostWeight, input.boostTotalWeight);
  const delegatedPoolIncome = baseIncome(input.delegatedPosition) + boostIncome(input.delegatedPosition);
  const delegatedIncome = (position: StyfiAprPosition) =>
    input.styfixSupply >= 10n ** 12n ? share(delegatedPoolIncome, position.styfix, input.styfixSupply) : 0n;
  const externalIncome = (position: StyfiAprPosition) =>
    position.liquidLockers.reduce((total, balance, index) => total + share(
      input.liquidLockerEpochRewards[index] ?? 0n,
      balance,
      (input.liquidLockerSupplies[index] ?? 0n) + 10n ** 12n,
    ), 0n) + share(input.veEpochRewards, position.veRewardWeight, input.veTotalWeight);

  const ybcPoolIncome = input.ybcRewardsEnabled && input.ybcSupply >= 10n ** 12n
    ? baseIncome(input.ybcPosition) + delegatedIncome(input.ybcPosition) + boostIncome(input.ybcPosition) + externalIncome(input.ybcPosition)
    : 0n;
  const oneYfiBaseIncome = share(input.stakingEpochRewards, YFI_UNIT, input.stakingWeight);
  // VoteBoost.weight is stake × proposal count, not a fraction or a governance weight.
  const oneYfiFullBoostIncome = share(
    input.boostEpochRewards,
    YFI_UNIT * input.rewardEpochProposals,
    input.boostTotalWeight,
  );
  const maximumScale = fullBoostScale(input.rewardScales);
  const appliedMaximum = input.rewardEpochScales ? deriveVoteBoostMultiplier(input.rewardEpochScales) : null;
  const snapshot: StyfiAprSnapshot = {
    status: "available",
    blockNumber: input.blockNumber,
    timestamp: input.timestamp,
    currentEpoch: input.currentEpoch,
    rewardEpoch: input.rewardEpoch,
    baseAprBps: apr(oneYfiBaseIncome, YFI_UNIT),
    maxAprBps: apr(oneYfiBaseIncome + oneYfiFullBoostIncome, YFI_UNIT),
    maxVoteBoostMultiplier: deriveVoteBoostMultiplier(input.rewardScales),
    appliedMaxVoteBoostMultiplier: appliedMaximum,
    fullBoostEstimateAprBps: maximumScale ? apr(oneYfiBaseIncome, YFI_UNIT, maximumScale) : null,
    fullBoostStyfixEstimateAprBps: maximumScale && input.styfixSupply >= 10n ** 12n
      ? apr(baseIncome(input.delegatedPosition), input.styfixSupply, maximumScale) : null,
    styfixAprBps: input.styfixSupply >= 10n ** 12n ? apr(delegatedPoolIncome, input.styfixSupply) : null,
    delegatedParticipation: input.delegatedParticipation,
    valuation: input.valuation,
    account: null,
  };

  if (input.account) {
    const { address, position, isYbcMember, ybcStake, participation } = input.account;
    const externalActive = position.liquidLockers.reduce((total, balance) => total + balance, 0n) + position.veYfi;
    const totalActive = position.styfi + position.styfix + externalActive;
    const base = baseIncome(position);
    const delegated = delegatedIncome(position);
    const boost = boostIncome(position);
    const external = externalIncome(position);
    const ybc = isYbcMember ? share(ybcPoolIncome, ybcStake, input.ybcSupply) : 0n;
    const total = base + delegated + boost + external + ybc;
    const directSnapshotWeight = position.styfi * input.account.rewardEpochVotes / 10n ** 10n * 10n ** 10n;
    const canAttributeDirect = externalActive === 0n && external === 0n && position.boostWeight === directSnapshotWeight;
    const rewardParticipation = { votes: input.account.rewardEpochVotes, proposals: input.rewardEpochProposals };
    const validRewardParticipation = rewardParticipation.votes >= 0n && rewardParticipation.votes <= rewardParticipation.proposals;
    const appliedVoteBoostMultiplier = !validRewardParticipation ? null
      : rewardParticipation.votes === 0n ? 1
        : input.rewardEpochScales ? deriveVoteBoostMultiplier(input.rewardEpochScales, rewardParticipation) : null;
    const collectiveActive = input.ybcPosition.styfi + input.ybcPosition.styfix + input.ybcPosition.veYfi +
      input.ybcPosition.liquidLockers.reduce((sum, amount) => sum + amount, 0n);
    snapshot.account = {
      address,
      styfiActive: position.styfi,
      styfixActive: position.styfix,
      externalActive,
      totalActive,
      isYbcMember,
      ybcMembership: isYbcMember ? {
        eligibleStakeYfi: ybcStake,
        totalEligibleStakeYfi: input.ybcSupply,
        rewardShareBps: share(10_000n, ybcStake, input.ybcSupply),
        rewardBackingYfi: share(collectiveActive, ybcStake, input.ybcSupply),
        annualRewardTokens: annualize(ybc),
        rewardsEnabled: input.ybcRewardsEnabled,
      } : null,
      // The historical boost weight combines positions. It cannot be split by current token balance.
      yourStyfiAprBps: canAttributeDirect ? apr(base + boost + ybc, position.styfi) : null,
      portfolioAprBps: apr(total, totalActive),
      baseAprBps: apr(base, totalActive),
      delegatedAprBps: apr(delegated, totalActive),
      voteBoostAprBps: apr(boost, totalActive),
      ybcAprBps: apr(ybc, totalActive),
      externalAprBps: apr(external, totalActive),
      annualRewards: annualize(total),
      participation,
      voteBoostMultiplier: deriveVoteBoostMultiplier(input.rewardScales, participation),
      rewardParticipation,
      appliedVoteBoostMultiplier,
    };
  }
  return snapshot;
}
