import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { fetchStyfiAprSnapshot } from "@/lib/clients/styfi/apr-onchain";
import { STYFI_GOVERNANCE } from "@/lib/clients/styfi/deployment";
import { EPOCH_LENGTH, GENESIS, LIQUID_LOCKERS, REWARD_CLAIMER_ADDRESS, STYFI_ADDRESS, STYFI_REWARD_DISTRIBUTOR_ADDRESS, STYFIX_ADDRESS } from "@/lib/constants";
import type { GlobalData } from "@/lib/schemas/global";

const UNIT = 10n ** 18n;
const USER = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"ab".repeat(32)}` as const;
const NOW = GENESIS + 18n * BigInt(EPOCH_LENGTH) + 123n;

type Call = { address: Address; functionName: string; args?: readonly unknown[] };

function fixture(options: { chain?: number; unfinalized?: boolean; reorg?: boolean; ve?: "early" | "expired"; installedLlRewards?: bigint; fail?: boolean; oracleUnavailable?: boolean; scaleChange?: boolean; currentStakeChange?: boolean; ybcMember?: boolean } = {}) {
  const globalData = {
    meta: { timestamp: Number(NOW), version: 2, epoch: 18, blockNumber: 100 },
    global: { yfi: { priceCts: "100000" } },
  } as GlobalData;
  const read = ({ address, functionName, args = [] }: Call): unknown => {
    if (options.fail) throw new Error("RPC unavailable");
    switch (functionName) {
      case "last_epoch": return options.unfinalized ? 17n : 18n;
      case "total_weight_cursor": return { count: 2n, last: 0n };
      case "total_weight_entries": return { epoch: args[0] === 0n ? 17n : 18n, weight: (args[0] === 1n && options.currentStakeChange ? 1100n : 1000n) * UNIT };
      case "decimals": return address.toLowerCase() === "0xa027702dbb89fbd58938e4324ac03b58d812b0e1" ? 8 : 6;
      case "description": return "YFI / USD";
      case "latestRoundData": {
        if (options.oracleUnavailable) throw new Error("Oracle unavailable");
        return [1n, 100000000000n, 0n, NOW, 1n];
      }
      case "asset": return "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
      case "convertToAssets": return 1_000_000n;
      case "distributor": return STYFI_GOVERNANCE.delegatedRewardClaimer;
      case "killed": return false;
      case "claim_from": return REWARD_CLAIMER_ADDRESS;
      case "supply": return 500n * UNIT;
      case "rewards": return args[0] === STYFI_REWARD_DISTRIBUTOR_ADDRESS ? 1_000_000_000n : args[0] === STYFI_GOVERNANCE.voteBoost ? 1_500_000_000n : 100_000_000n;
      case "components": return { next: USER, epoch: 18n, numerator: args[0] === STYFI_REWARD_DISTRIBUTOR_ADDRESS ? options.scaleChange ? 8n : 4n : 6n, denominator: 1n };
      case "epoch_weights": return args[0] === STYFI_REWARD_DISTRIBUTOR_ADDRESS ? 4000n * UNIT : 6000n * UNIT;
      case "packed_total_weights": return (2000n * UNIT / 10n ** 10n) << 100n;
      case "num_proposals": return args[0] === 17n ? 2n : 6n;
      case "num_votes": return args[0] === 17n ? 2n : 6n;
      case "totalSupply": return address === STYFIX_ADDRESS ? 100n * UNIT : 10n * UNIT;
      case "total_weights": return { weight: 20n * UNIT, slope: 0n };
      case "normalized_weights": return args[0] === 0n ? UNIT : 0n;
      case "current_rewards": return {
        timestamp: options.installedLlRewards !== undefined ? 18n * BigInt(EPOCH_LENGTH) : 17n * BigInt(EPOCH_LENGTH),
        rewards: args[0] === 0n ? options.installedLlRewards ?? 0n : 0n,
      };
      case "balanceOf": {
        if (address === STYFI_ADDRESS) return args[0] === USER ? 10n * UNIT : 100n * UNIT;
        if (address === LIQUID_LOCKERS[0].depositor && args[0] === USER && options.installedLlRewards !== undefined) return UNIT;
        return 0n;
      }
      case "locks":
      case "ve_locks": return args[0] === USER && options.ve ? {
        amount: UNIT,
        boost_epochs: 104n,
        unlock_time: GENESIS + BigInt(options.ve === "early" ? 25 : 18) * BigInt(EPOCH_LENGTH),
      } : { amount: 0n, boost_epochs: 0n, unlock_time: 0n };
      case "check_lock": return [0n, 0n];
      case "last_claimed": return address === STYFI_GOVERNANCE.voteBoost || (args[0] === USER && options.ve) ? GENESIS + 17n * BigInt(EPOCH_LENGTH) : 0n;
      case "ve_migrated": return args[0] === USER && Boolean(options.ve);
      case "weight": return args[1] === USER ? 20n * UNIT : 200n * UNIT;
      case "members": return options.ybcMember ?? false;
      case "staked": return options.ybcMember ? 10n * UNIT : 0n;
      default: throw new Error(`Unexpected read ${functionName}`);
    }
  };
  const multicall = vi.fn(async ({ contracts }: { contracts: Call[] }) => contracts.map(read));
  const getBlock = vi.fn(async (args: { blockNumber?: bigint }) => ({ number: 100n, timestamp: NOW, hash: options.reorg && args.blockNumber ? `0x${"cd".repeat(32)}` : HASH }));
  const getChainId = vi.fn(async () => options.chain ?? 1);
  const client = { multicall, getBlock, getChainId } as unknown as PublicClient;
  return { client, multicall, getBlock, getChainId, globalData };
}

describe("stYFI APR onchain snapshot", () => {
  it("pins all reads, separates reward and participation epochs, and verifies the final block", async () => {
    const { client, multicall, getBlock, globalData } = fixture();
    const result = await fetchStyfiAprSnapshot(client, globalData, USER);
    expect(result.status).toBe("available");
    expect(result.rewardEpoch).toBe(17);
    expect(result.currentEpoch).toBe(18);
    expect(result.styfixAprBps).toBeCloseTo(651.785714, 5);
    expect(result.account?.participation).toEqual({ votes: 6n, proposals: 6n });
    expect(result.account?.yourStyfiAprBps).toBeCloseTo(651.785714, 5);
    expect(result.maxVoteBoostMultiplier).toBe(2.5);
    expect(result.account?.voteBoostMultiplier).toBe(2.5);
    expect(result.account?.rewardParticipation).toEqual({ votes: 2n, proposals: 2n });
    expect(result.account?.appliedVoteBoostMultiplier).toBe(2.5);
    expect(result.fullBoostStyfixEstimateAprBps).toBeCloseTo(651.785714, 5);
    expect(getBlock).toHaveBeenLastCalledWith({ blockNumber: 100n });
    for (const [call] of multicall.mock.calls) expect(call).toMatchObject({ blockNumber: 100n, allowFailure: false });
  });

  it("does not turn unfinalized reward allocations into a zero APR", async () => {
    const { client, globalData } = fixture({ unfinalized: true });
    expect((await fetchStyfiAprSnapshot(client, globalData)).status).toBe("unavailable");
  });

  it("rejects another chain and mixed reads after a reorg", async () => {
    const wrongChain = fixture({ chain: 10 });
    expect((await fetchStyfiAprSnapshot(wrongChain.client, wrongChain.globalData)).status).toBe("unavailable");
    expect(wrongChain.multicall).not.toHaveBeenCalled();
    const reorg = fixture({ reorg: true });
    expect((await fetchStyfiAprSnapshot(reorg.client, reorg.globalData)).status).toBe("unavailable");
  });

  it("preserves stale-price metadata even when feed publication is recent", async () => {
    const { client, globalData } = fixture({ oracleUnavailable: true });
    globalData.global.yfi.priceStale = true;
    let result = await fetchStyfiAprSnapshot(client, globalData);
    expect(result.valuation.stale).toBe(true);
    expect(result.baseAprBps).toBeGreaterThan(0);
    globalData.global.yfi.priceStale = false;
    globalData.global.yfi.priceUpdatedAt = Number(NOW) - 86_401;
    result = await fetchStyfiAprSnapshot(client, globalData);
    expect(result.valuation.stale).toBe(true);
    expect(result.valuation.timestamp).toBe(Number(NOW) - 86_401);
  });

  it("withholds forfeitable streams after an early exit until reporting resolves them", async () => {
    const { client, globalData } = fixture({ ve: "early" });
    expect((await fetchStyfiAprSnapshot(client, globalData, USER)).status).toBe("unavailable");
  });

  it("preserves the final ve reward stream after a normal unlock and withdrawal", async () => {
    const { client, globalData } = fixture({ ve: "expired" });
    const result = await fetchStyfiAprSnapshot(client, globalData, USER);
    expect(result.status).toBe("available");
    expect(result.account?.externalActive).toBe(0n);
    expect(result.account?.externalAprBps).toBeGreaterThan(0);
    expect(result.account?.yourStyfiAprBps).toBeNull();
  });

  it("uses the installed LL stream after a mid-epoch normalized-weight change", async () => {
    const { client, globalData } = fixture({ installedLlRewards: 50_000_000n });
    const result = await fetchStyfiAprSnapshot(client, globalData, USER);
    // 50 reward tokens × 1/(10 + 1e-6) LL share, spread over 11 YFI capital.
    expect(result.account?.externalAprBps).toBeCloseTo(118.506469, 4);
    expect(result.account?.yourStyfiAprBps).toBeNull();
  });

  it("does not substitute stale feed APR values after RPC failure", async () => {
    const { client, globalData } = fixture({ fail: true });
    globalData.styfi = { current: { aprBps: 99999 } } as GlobalData["styfi"];
    const result = await fetchStyfiAprSnapshot(client, globalData, USER);
    expect(result.status).toBe("unavailable");
    expect(result.baseAprBps).toBeNull();
    expect(result.account).toBeNull();
  });

  it("recovers applied scales from finalized weights after current balances and configuration change", async () => {
    const { client, globalData } = fixture({ scaleChange: true, currentStakeChange: true });
    const result = await fetchStyfiAprSnapshot(client, globalData, USER);
    expect(result.appliedMaxVoteBoostMultiplier).toBe(2.5);
    expect(result.account?.appliedVoteBoostMultiplier).toBe(2.5);
    expect(result.account?.voteBoostMultiplier).toBe(1.75);
    expect(result.baseAprBps).toBeCloseTo(237.01275, 5);
  });

  it("includes a verified member's current reward share without adding collective capital", async () => {
    const { client, globalData } = fixture({ ybcMember: true });
    const result = await fetchStyfiAprSnapshot(client, globalData, USER);
    expect(result.account?.ybcMembership).toMatchObject({ eligibleStakeYfi: 10n * UNIT, rewardShareBps: 200n, rewardBackingYfi: 2n * UNIT });
    expect(result.account?.totalActive).toBe(10n * UNIT);
    expect(result.account?.ybcAprBps).toBeGreaterThan(0);
  });
});
