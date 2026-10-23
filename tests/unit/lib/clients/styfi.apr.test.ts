import { describe, expect, it } from "vitest";
import { deriveStyfiAprSnapshot, deriveVoteBoostMultiplier, unpackVoteBoostWeight } from "@/lib/clients/styfi/apr";
import type { StyfiAprInputs, StyfiAprPosition } from "@/lib/clients/styfi/apr-types";

const UNIT = 10n ** 18n;
const USER = "0x1111111111111111111111111111111111111111";
const empty: StyfiAprPosition = { styfi: 0n, styfix: 0n, liquidLockers: [0n, 0n, 0n], veYfi: 0n, veRewardWeight: 0n, boostWeight: 0n };

function inputs(): StyfiAprInputs {
  return {
    blockNumber: 100n, timestamp: 1_800_000_000, currentEpoch: 18, rewardEpoch: 17,
    rewardScales: { staking: { numerator: 4n, denominator: 1n }, voteBoost: { numerator: 6n, denominator: 1n } },
    rewardEpochScales: { staking: { numerator: 4n, denominator: 1n }, voteBoost: { numerator: 6n, denominator: 1n } },
    valuation: { yfiPriceCts: 100_000n, timestamp: 1_800_000_000, stale: false },
    rewardDecimals: 6, rewardAssetDecimals: 6, rewardAssetsPerShare: 1_000_000n,
    stakingEpochRewards: 1_000_000_000n, stakingWeight: 1000n * UNIT,
    styfixSupply: 100n * UNIT,
    delegatedPosition: { ...empty, styfi: 100n * UNIT, boostWeight: 200n * UNIT },
    boostEpochRewards: 1_500_000_000n, boostTotalWeight: 2000n * UNIT, rewardEpochProposals: 2n,
    delegatedParticipation: { votes: 6n, proposals: 6n },
    liquidLockerEpochRewards: [100_000_000n, 0n, 0n],
    liquidLockerSupplies: [10n * UNIT, 0n, 0n],
    veEpochRewards: 100_000_000n, veTotalWeight: 20n * UNIT,
    ybcPosition: { ...empty, styfi: 100n * UNIT, boostWeight: 200n * UNIT },
    ybcSupply: 500n * UNIT, ybcRewardsEnabled: true,
    account: { address: USER, position: { ...empty, styfi: 10n * UNIT, boostWeight: 20n * UNIT }, isYbcMember: false,
      ybcStake: 10n * UNIT, participation: { votes: 6n, proposals: 6n }, rewardEpochVotes: 2n },
  };
}

describe("stYFI current stream APR", () => {
  it("combines base and historical vote rewards with reward-token decimals and USD cents", () => {
    const result = deriveStyfiAprSnapshot(inputs());
    expect(result.baseAprBps).toBeCloseTo(260.714285, 5);
    expect(result.maxAprBps).toBeCloseTo(651.785714, 5);
    expect(result.styfixAprBps).toBeCloseTo(651.785714, 5);
    expect(result.account?.yourStyfiAprBps).toBeCloseTo(651.785714, 5);
    expect(result.account?.portfolioAprBps).toBeCloseTo(651.785714, 5);
    expect(result.account?.annualRewards).toBe(25_000_000n * 365n / 14n);
  });

  it("keeps current participation separate from the reward snapshot", () => {
    const source = inputs();
    source.account!.participation = { votes: 6n, proposals: 6n };
    source.account!.rewardEpochVotes = 0n;
    source.account!.position.boostWeight = 0n;
    const result = deriveStyfiAprSnapshot(source);
    expect(result.account?.voteBoostAprBps).toBe(0);
    expect(result.account?.portfolioAprBps).toBe(result.baseAprBps);
    expect(result.account?.participation.votes).toBe(6n);
    expect(result.account?.voteBoostMultiplier).toBe(2.5);
    expect(result.account?.appliedVoteBoostMultiplier).toBe(1);
    expect(result.account?.rewardParticipation).toEqual({ votes: 0n, proposals: 2n });
  });

  it("uses the actual delegated pool snapshot instead of assuming full participation", () => {
    const source = inputs();
    source.delegatedPosition.boostWeight = 100n * UNIT;
    const result = deriveStyfiAprSnapshot(source);
    expect(result.styfixAprBps).toBeCloseTo(456.25, 5);
    expect(result.styfixAprBps).toBeLessThan(result.maxAprBps!);
    expect(result.fullBoostStyfixEstimateAprBps).toBeCloseTo(651.785714, 5);
  });

  it("adds YBC income by member stake, without requiring the member to have voted", () => {
    const source = inputs();
    source.account!.isYbcMember = true;
    source.account!.rewardEpochVotes = 0n;
    source.account!.position.boostWeight = 0n;
    const result = deriveStyfiAprSnapshot(source);
    expect(result.account?.ybcAprBps).toBeCloseTo(130.357142, 5);
    expect(result.account?.portfolioAprBps).toBeCloseTo(391.071428, 5);
    source.ybcRewardsEnabled = false;
    expect(deriveStyfiAprSnapshot(source).account?.ybcAprBps).toBe(0);
  });

  it("includes external base income and adds the wallet boost only once", () => {
    const source = inputs();
    source.account!.position = { ...source.account!.position, liquidLockers: [UNIT, 0n, 0n], veYfi: UNIT, veRewardWeight: 2n * UNIT };
    const result = deriveStyfiAprSnapshot(source);
    const account = result.account!;
    expect(account.totalActive).toBe(12n * UNIT);
    expect(account.yourStyfiAprBps).toBeNull();
    expect(account.externalAprBps).toBeGreaterThan(0);
    expect(account.portfolioAprBps).toBeCloseTo(
      account.baseAprBps! + account.delegatedAprBps! + account.voteBoostAprBps! + account.ybcAprBps! + account.externalAprBps!, 4,
    );
  });

  it("does not attribute historical external boost or changed stake to today's stYFI", () => {
    const source = inputs();
    source.account!.position.boostWeight = 30n * UNIT;
    expect(deriveStyfiAprSnapshot(source).account?.yourStyfiAprBps).toBeNull();
    expect(deriveStyfiAprSnapshot(source).account?.portfolioAprBps).toBeGreaterThan(0);
    source.account!.position.boostWeight = 20n * UNIT;
    source.account!.position.styfi = 9n * UNIT;
    expect(deriveStyfiAprSnapshot(source).account?.yourStyfiAprBps).toBeNull();
  });

  it("keeps expired ve reward streams out of a standalone stYFI rate", () => {
    const source = inputs();
    source.account!.position.veRewardWeight = 2n * UNIT;
    expect(deriveStyfiAprSnapshot(source).account?.externalActive).toBe(0n);
    expect(deriveStyfiAprSnapshot(source).account?.externalAprBps).toBeGreaterThan(0);
    expect(deriveStyfiAprSnapshot(source).account?.yourStyfiAprBps).toBeNull();
  });

  it("returns nullable valuation-dependent rates, not a fallback feed APR", () => {
    const source = inputs();
    source.valuation.yfiPriceCts = null;
    const result = deriveStyfiAprSnapshot(source);
    expect(result.baseAprBps).toBeNull();
    expect(result.styfixAprBps).toBeNull();
    expect(result.account?.portfolioAprBps).toBeNull();
    expect(result.account?.annualRewards).toBeGreaterThan(0n);
  });

  it("handles zero proposals, empty balances, and inactive delegated supply", () => {
    const source = inputs();
    source.boostEpochRewards = 0n;
    source.boostTotalWeight = 0n;
    source.rewardEpochProposals = 0n;
    source.styfixSupply = 0n;
    source.account!.position = empty;
    const result = deriveStyfiAprSnapshot(source);
    expect(result.maxAprBps).toBe(result.baseAprBps);
    expect(result.styfixAprBps).toBeNull();
    expect(result.account?.portfolioAprBps).toBeNull();
  });

  it("unpacks each 50-bit epoch field and restores the contract's 1e10 scale", () => {
    const packed = 3n | (7n << 50n) | (9n << 200n);
    expect(unpackVoteBoostWeight(packed, 15)).toBe(3n * 10n ** 10n);
    expect(unpackVoteBoostWeight(packed, 16)).toBe(7n * 10n ** 10n);
    expect(unpackVoteBoostWeight(packed, 19)).toBe(9n * 10n ** 10n);
  });

  it("uses component scales for the nominal multiplier independently of historical APR ratios", () => {
    const source = inputs();
    source.stakingWeight = 1100n * UNIT;
    const result = deriveStyfiAprSnapshot(source);
    expect(result.maxVoteBoostMultiplier).toBe(2.5);
    expect(result.fullBoostEstimateAprBps).toBeCloseTo(result.baseAprBps! * 2.5, 4);
    expect(result.maxAprBps! / result.baseAprBps!).not.toBeCloseTo(2.5, 2);
  });

  it("uses delegated backing and active capital for its full-participation estimate", () => {
    const source = inputs();
    source.delegatedPosition.styfi = 80n * UNIT;
    const result = deriveStyfiAprSnapshot(source);
    expect(result.fullBoostStyfixEstimateAprBps).toBeCloseTo(result.fullBoostEstimateAprBps! * 0.8, 4);
  });

  it("supports fractional scale configurations and participation without assuming a 2.5 cap", () => {
    const scales = { staking: { numerator: 2n, denominator: 3n }, voteBoost: { numerator: 3n, denominator: 4n } };
    expect(deriveVoteBoostMultiplier(scales)).toBe(2.125);
    expect(deriveVoteBoostMultiplier(scales, { votes: 1n, proposals: 3n })).toBe(1.375);
  });

  it("shows 1× for no proposals or no votes, and exact intermediate participation", () => {
    const scales = inputs().rewardScales;
    expect(deriveVoteBoostMultiplier(scales, { votes: 0n, proposals: 0n })).toBe(1);
    expect(deriveVoteBoostMultiplier(scales, { votes: 0n, proposals: 6n })).toBe(1);
    expect(deriveVoteBoostMultiplier(scales, { votes: 3n, proposals: 6n })).toBe(1.75);
    expect(deriveVoteBoostMultiplier(scales, { votes: 6n, proposals: 6n })).toBe(2.5);
  });

  it("handles removed components and refuses invalid scales or participation", () => {
    const scales = inputs().rewardScales;
    expect(deriveVoteBoostMultiplier({ ...scales, voteBoost: null })).toBe(1);
    expect(deriveVoteBoostMultiplier({ ...scales, staking: null })).toBeNull();
    expect(deriveVoteBoostMultiplier({ ...scales, voteBoost: { numerator: 6n, denominator: 0n } })).toBeNull();
    expect(deriveVoteBoostMultiplier(scales, { votes: 7n, proposals: 6n })).toBeNull();
    expect(deriveVoteBoostMultiplier(scales, { votes: -1n, proposals: 6n })).toBeNull();
  });

  it("uses historical component scales for the applied multiplier after configuration changes", () => {
    const source = inputs();
    source.rewardScales.staking = { numerator: 8n, denominator: 1n };
    source.account!.rewardEpochVotes = 1n;
    const result = deriveStyfiAprSnapshot(source);
    expect(result.maxVoteBoostMultiplier).toBe(1.75);
    expect(result.appliedMaxVoteBoostMultiplier).toBe(2.5);
    expect(result.account?.appliedVoteBoostMultiplier).toBe(1.75);
    expect(result.account?.rewardParticipation).toEqual({ votes: 1n, proposals: 2n });
  });

  it("does not invent a historical scale when the epoch had no boost weight", () => {
    const source = inputs();
    source.rewardEpochScales = null;
    source.account!.rewardEpochVotes = 0n;
    expect(deriveStyfiAprSnapshot(source).appliedMaxVoteBoostMultiplier).toBeNull();
    expect(deriveStyfiAprSnapshot(source).account?.appliedVoteBoostMultiplier).toBe(1);
    source.account!.rewardEpochVotes = 1n;
    expect(deriveStyfiAprSnapshot(source).account?.appliedVoteBoostMultiplier).toBeNull();
    source.account!.rewardEpochVotes = 0n;
    source.rewardEpochProposals = 0n;
    expect(deriveStyfiAprSnapshot(source).account?.appliedVoteBoostMultiplier).toBe(1);
  });

  it("shows YBC income backing without adding collective assets to personal capital", () => {
    const source = inputs();
    source.account!.isYbcMember = true;
    source.ybcPosition.liquidLockers = [20n * UNIT, 0n, 0n];
    source.ybcPosition.styfix = 30n * UNIT;
    source.ybcPosition.veYfi = 50n * UNIT;
    const result = deriveStyfiAprSnapshot(source).account!;
    expect(result.ybcMembership).toMatchObject({
      eligibleStakeYfi: 10n * UNIT,
      totalEligibleStakeYfi: 500n * UNIT,
      rewardShareBps: 200n,
      rewardBackingYfi: 4n * UNIT,
      rewardsEnabled: true,
    });
    expect(result.ybcMembership?.annualRewardTokens).toBeGreaterThan(0n);
    expect(result.totalActive).toBe(10n * UNIT);
    source.account!.ybcStake = 0n;
    const afterExit = deriveStyfiAprSnapshot(source).account!;
    expect(afterExit.ybcMembership?.rewardShareBps).toBe(0n);
    expect(afterExit.ybcMembership?.rewardBackingYfi).toBe(0n);
    expect(afterExit.ybcAprBps).toBe(0);
    source.account!.isYbcMember = false;
    expect(deriveStyfiAprSnapshot(source).account?.ybcMembership).toBeNull();
  });
});
