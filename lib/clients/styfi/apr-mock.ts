import { EPOCH_LENGTH, GENESIS, LIQUID_LOCKERS } from "@/lib/constants";
import type { StyfiAccountState } from "./types";
import type { VeyfiAccountState } from "@/lib/clients/veyfi/types";
import type { StyfiAprInputs, StyfiAprPosition } from "./apr-types";
import { deriveStyfiAprSnapshot } from "./apr";
import { getStyfiMockScenario, type StyfiMockScenario } from "./scenarios";
import { nowSeconds } from "@/lib/mocks/time";

const UNIT = 10n ** 18n;
const REWARD_UNIT = 10n ** 6n;
const YEAR = 365n * 24n * 60n * 60n;

const emptyPosition = (): StyfiAprPosition => ({
  styfi: 0n, styfix: 0n, liquidLockers: [0n, 0n, 0n],
  veYfi: 0n, veRewardWeight: 0n, boostWeight: 0n,
});

/** Deterministic scenarios use the same reward math as the live reader. */
export function createMockStyfiAprSnapshot(
  account?: StyfiAccountState | null,
  veyfi?: VeyfiAccountState | null,
  scenario: StyfiMockScenario = getStyfiMockScenario(),
) {
  const votes = scenario === "missed" ? 0n : scenario === "partial" ? 3n : 6n;
  const timestamp = nowSeconds();
  const currentEpoch = Math.max(1, Math.floor((timestamp - Number(GENESIS)) / EPOCH_LENGTH));
  const liquidLockers = LIQUID_LOCKERS.map((locker) =>
    (veyfi?.llyfiTokens.find((token) => token.symbol === locker.symbol)?.stakedBalance ?? 0n) / locker.scale);
  const veYfi = veyfi?.veYfi?.migrated && veyfi.veYfi.unlockTime > timestamp
    ? veyfi.veYfi.lockedAmount : 0n;
  const external = liquidLockers.reduce((sum, amount) => sum + amount, 0n);
  const styfi = account?.styfiActive ?? 0n;
  // The mock's previous epoch balances equal its current balances, while the
  // live reader obtains the historical combined weight from VoteBoost.
  const position: StyfiAprPosition = {
    styfi, styfix: account?.styfiX.assetsActive ?? 0n, liquidLockers, veYfi,
    veRewardWeight: veYfi * 2n,
    boostWeight: (styfi + external * 2n + veYfi * 2n) * votes,
  };
  const epochRewards = (annualUsd: bigint) => annualUsd * REWARD_UNIT * BigInt(EPOCH_LENGTH) / YEAR;
  const inputs: StyfiAprInputs = {
    blockNumber: 26_000_000n, timestamp, currentEpoch, rewardEpoch: currentEpoch - 1,
    rewardScales: {
      staking: { numerator: 4n, denominator: 1n },
      voteBoost: { numerator: 6n, denominator: 1n },
    },
    rewardEpochScales: {
      staking: { numerator: 4n, denominator: 1n },
      voteBoost: { numerator: 6n, denominator: 1n },
    },
    valuation: { yfiPriceCts: 200_000n, timestamp, stale: false },
    rewardDecimals: 6, rewardAssetDecimals: 6, rewardAssetsPerShare: REWARD_UNIT,
    stakingEpochRewards: epochRewards(160_000n), stakingWeight: 1000n * UNIT,
    styfixSupply: 200n * UNIT,
    delegatedPosition: { ...emptyPosition(), styfi: 200n * UNIT, boostWeight: 200n * UNIT * 6n },
    boostEpochRewards: epochRewards(240_000n), boostTotalWeight: 1000n * UNIT * 6n,
    rewardEpochProposals: 6n, delegatedParticipation: { votes: 6n, proposals: 6n },
    liquidLockerEpochRewards: [epochRewards(32_000n), epochRewards(32_000n), epochRewards(32_000n)],
    liquidLockerSupplies: [100n * UNIT, 100n * UNIT, 100n * UNIT],
    veEpochRewards: epochRewards(32_000n), veTotalWeight: 200n * UNIT,
    ybcPosition: { ...emptyPosition(), styfi: 100n * UNIT, boostWeight: 100n * UNIT * 6n },
    ybcSupply: 400n * UNIT, ybcRewardsEnabled: true,
    account: account ? {
      address: account.address, position, isYbcMember: scenario === "ybc",
      rewardEpochVotes: votes,
      ybcStake: scenario === "ybc" ? styfi + external : 0n,
      participation: { votes, proposals: 6n },
    } : undefined,
  };
  return deriveStyfiAprSnapshot(inputs);
}
