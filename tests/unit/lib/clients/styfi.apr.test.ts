import { describe, expect, it } from "vitest";
import { deriveStyfiAprSnapshot, unpackVoteBoostWeight } from "@/lib/clients/styfi/apr";
import type { StyfiAprInputs, StyfiAprPosition } from "@/lib/clients/styfi/apr-types";

const UNIT = 10n ** 18n;
const USER = "0x1111111111111111111111111111111111111111";
const empty: StyfiAprPosition = { styfi: 0n, styfix: 0n, liquidLockers: [0n, 0n, 0n], veYfi: 0n, veRewardWeight: 0n, boostWeight: 0n };

function inputs(): StyfiAprInputs {
  return {
    blockNumber: 100n, timestamp: 1_800_000_000, currentEpoch: 18, rewardEpoch: 17,
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
  });

  it("uses the actual delegated pool snapshot instead of assuming full participation", () => {
    const source = inputs();
    source.delegatedPosition.boostWeight = 100n * UNIT;
    const result = deriveStyfiAprSnapshot(source);
    expect(result.styfixAprBps).toBeCloseTo(456.25, 5);
    expect(result.styfixAprBps).toBeLessThan(result.maxAprBps!);
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
});
