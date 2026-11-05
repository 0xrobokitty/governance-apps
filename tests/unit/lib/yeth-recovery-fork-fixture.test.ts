import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hash } from "viem";
import { buildRecoverySnapshot } from "@/lib/clients/yeth/recovery/feed-adapter";
import type { RecoveryFeedData } from "@/lib/clients/yeth/recovery/feed-schema";
import {
  buildRecoveryForkSnapshot,
  RECOVERY_FORK_ACCOUNT,
  RECOVERY_FORK_SEEDED_SHARES,
} from "@/lib/clients/yeth/recovery/fork-fixture";
import { recoveryChoices, recoveryTarget } from "@/lib/clients/yeth/recovery/decisions";
import { exitOffer } from "@/lib/clients/yeth/recovery/journey";
import { personalTargetYears, WAD } from "@/lib/clients/yeth/recovery/model";
import type { RecoveryAccountState } from "@/lib/clients/yeth/recovery/onchain";

const NOW = 1800000000;
const FORK_NOW = NOW + 86400;
const OTHER = "0x1111111111111111111111111111111111111111";
const BLOCK_HASH = ("0x" + "a".repeat(64)) as Hash;
const block = { number: "100", hash: BLOCK_HASH, timestamp: NOW };
const historyRef = {
  url: "yeth-recovery-snapshots/" + "a".repeat(64) + ".json",
  sha256: "a".repeat(64),
  schema: "yeth-recovery-history/v1",
};

function feed(): RecoveryFeedData {
  return {
    head: {
      schema: "yeth-recovery/v3", mode: "live", chainId: 1,
      observedAt: NOW, generatedAt: NOW, block, indexedThrough: block,
      producer: { name: "gov-apps-yeth", version: "0.10.0", revision: "a".repeat(40) },
      contracts: {
        claim: OTHER, recoveryVault: OTHER, yieldVault: OTHER,
        auctionWrapper: OTHER, underlyingAuction: OTHER, underlyingAsset: OTHER,
        assetDecimals: 18, shareDecimals: 18,
      },
      claim: { recoveryRateWad: String(WAD / 4n) },
      recoveryVault: {
        assetsWei: String(100n * WAD), sharesWei: String(100n * WAD),
        assetsPerShareWad: String(WAD), targetAssetsPerShareWad: String(4n * WAD),
        normalizedRecoveryWad: String(WAD / 4n),
      },
      yieldVault: { assetsWei: String(100n * WAD) },
      capital: { complete: true },
      accounting: { complete: true, historyComplete: true },
      programme: {
        complete: true, current: true,
        source: { observedAt: NOW, maxAgeSeconds: 900 },
      },
      quality: {
        snapshotMaxAgeSeconds: 300, historyMaxAgeSeconds: 1800,
        historyStatus: "current", finalizedHead: block, unindexedFinalizedBlocks: 0,
      },
      baseline: { block, normalizedRecoveryWad: String(WAD / 5n) },
      history: historyRef, holders: null, auctionHistory: null, funding: null,
      kong: { status: "unavailable" },
      auction: {
        kickedAt: 0, initialAvailableWei: "0", availableWei: "0",
        startingPriceWad: String(WAD), minimumPriceWad: String(WAD / 4n),
        stepDurationSeconds: 225, stepDecayRateBps: 4, auctionLengthSeconds: 604800,
      },
      forecast: {
        method: "current-capital-net-recovery-income/v2", forecastFrom: NOW,
        basis: { windowDays: 90, historySha256: historyRef.sha256 },
        dailyAssetsPerShareGrowthWad: String(WAD / 1000n),
        fullRecoveryWad: String(WAD), targets: [],
      },
      performance: { basis: "observed-pps/v1", notAForecast: true, windows: [] },
    },
    history: {
      schema: "yeth-recovery-history/v1", chainId: 1,
      indexedThrough: block, days: { kind: "pages", pages: [] },
    },
    days: [], holders: null, positions: [], auctions: null, fills: [], rounds: [],
  };
}

function chain(shares = RECOVERY_FORK_SEEDED_SHARES): RecoveryAccountState {
  return {
    address: RECOVERY_FORK_ACCOUNT as Address,
    chainId: 31337, blockNumber: 200n, blockHash: BLOCK_HASH,
    blockTimestamp: FORK_NOW, shares, allowance: 0n, wethBalance: 99n * WAD,
    directAssets: shares, maxRedeem: shares, vaultPps: WAD,
    recoveryRate: WAD / 4n, auctionPrice: WAD / 2n,
    positionTransfersSinceIndexed: true,
    auction: {
      kickedAt: FORK_NOW - 100, initialWeth: WAD, remainingWeth: WAD,
      startingPrice: WAD / 2n, minimumPrice: WAD / 4n,
      stepDuration: 225, stepDecayBps: 0, length: 604800,
    },
  };
}

function snapshot(observation = chain(), now = NOW, observedAt = NOW) {
  return buildRecoveryForkSnapshot(feed(), {
    now, observedAt, chain: observation,
    address: observation.address, chainId: observation.chainId,
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_YETH_FORK_RPC_URL", "http://127.0.0.1:18546");
  vi.stubEnv("NEXT_PUBLIC_E2E", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("fork-only personal recovery fixture", () => {
  it("uses synthetic contract-target principal for the documented seeded account", () => {
    const s = snapshot();
    expect(s.originalClaimEth).toBe(40n * WAD);
    expect(s.live?.principalKnown).toBe(true);
    expect(s.live?.principalUnavailableReason).toBeNull();
    expect(s.forkFixture).toEqual({
      kind: "synthetic-contract-target/v1", account: RECOVERY_FORK_ACCOUNT,
      seededShares: 10n * WAD, representedClaimEth: 40n * WAD,
      targetAssetsPerShare: 4n * WAD,
    });
    expect(recoveryChoices(s).accountRecovery).toBe(.25);
    expect(personalTargetYears(s, 40n * WAD)).toBeCloseTo(3000 / 365);
    expect(exitOffer(s, "complete").beneficial).toBe(true);
    expect(exitOffer(s, "complete").rate).toBe(.2625);
  });

  it("keeps the real rounded recovery rate within the published full-recovery target", () => {
    const data = feed();
    const target = 3128830000000000000n;
    const recoveryRate = 319607900000000000n;
    data.head.recoveryVault.targetAssetsPerShareWad = String(target);
    data.head.claim.recoveryRateWad = String(recoveryRate);
    const observation = { ...chain(), recoveryRate };
    const s = buildRecoveryForkSnapshot(data, {
      now: NOW, observedAt: NOW, chain: observation,
      address: RECOVERY_FORK_ACCOUNT, chainId: 31337,
    });
    expect(WAD * WAD / recoveryRate).toBeGreaterThan(target);
    expect(s.originalClaimEth).toBe(10n * target);
    expect(s.live?.targetAssetsPerShare).toBe(target);
    expect(s.forkFixture?.targetAssetsPerShare).toBe(target);
    expect(recoveryTarget(s, 100).status).toBe("estimated");
    expect(recoveryTarget(s, 100).years).toBeCloseTo(2128.83 / 365);
    const afterTake = buildRecoveryForkSnapshot(data, {
      now: NOW, observedAt: NOW, chain: { ...observation, shares: 7n * WAD, directAssets: 7n * WAD },
      address: RECOVERY_FORK_ACCOUNT, chainId: 31337,
    });
    expect(afterTake.originalClaimEth).toBe(7n * target);
    expect(recoveryTarget(afterTake, 100).status).toBe("estimated");
  });

  it("does not assign synthetic principal without a positive published target", () => {
    const data = feed();
    data.head.recoveryVault.targetAssetsPerShareWad = "0";
    const s = buildRecoveryForkSnapshot(data, {
      now: NOW, observedAt: NOW, chain: chain(),
      address: RECOVERY_FORK_ACCOUNT, chainId: 31337,
    });
    expect(s.forkFixture).toBeUndefined();
    expect(s.live?.principalKnown).toBe(false);
    expect(s.live?.targetAssetsPerShare).toBe(0n);
  });

  it("reduces remaining claim with actual shares and never counts wallet WETH", () => {
    const initial = snapshot();
    const afterTake = snapshot(chain(7n * WAD));
    const afterRedeem = snapshot(chain(0n));
    expect(afterTake.originalClaimEth).toBe(initial.originalClaimEth * 7n / 10n);
    expect(recoveryChoices(afterTake).accountRecovery).toBe(.25);
    expect(afterTake.walletWeth).toBe(99n * WAD);
    expect(afterRedeem.originalClaimEth).toBe(0n);
    expect(recoveryChoices(afterRedeem).accountRecovery).toBeNull();
  });

  it("keeps production history and forecast fresh after advancing the local auction clock", () => {
    const s = snapshot(chain(), NOW + 5);
    expect(s.now).toBe(FORK_NOW + 5);
    expect(s.live).toMatchObject({
      feedFresh: true, historyCurrent: true, programmeCurrent: true, chainFresh: true,
      feedAsOf: NOW, chainAsOf: FORK_NOW,
    });
    expect(s.live?.dailyAssetsPerShareGrowth).toBe(WAD / 1000n);
    const original = buildRecoverySnapshot(feed(), { now: NOW + 5, address: RECOVERY_FORK_ACCOUNT, chain: chain() });
    expect(original.live?.chainFresh).toBe(false);
    expect(original.live?.principalKnown).toBe(false);
    expect(original.now).toBe(NOW + 5);
  });

  it("still expires real Stats data against elapsed wall time", () => {
    const s = snapshot(chain(), NOW + 301, NOW + 301);
    expect(s.live?.feedFresh).toBe(false);
    expect(s.live?.chainFresh).toBe(true);
    expect(s.live?.dailyAssetsPerShareGrowth).toBeNull();
    expect(personalTargetYears(s, s.originalClaimEth)).toBeNull();
  });

  it("expires an unrefreshed chain observation without hiding usable public history", () => {
    const s = snapshot(chain(), NOW + 61);
    expect(s.live).toMatchObject({ feedFresh: true, chainFresh: false, principalKnown: false });
    expect(s.forkFixture).toBeUndefined();
    expect(s.originalClaimEth).toBe(0n);
  });

  it.each([0, NOW + 2, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects missing or invalid query receipt time %s", observedAt => {
      expect(snapshot(chain(), NOW, observedAt).live?.chainFresh).toBe(false);
      expect(snapshot(chain(), NOW, observedAt).forkFixture).toBeUndefined();
    },
  );

  it("keeps a failed refresh or stale receipt fallback disabled", () => {
    const s = snapshot({ ...chain(), blockTimestamp: 0 });
    expect(s.live?.chainFresh).toBe(false);
    expect(s.live?.directAssets).toBeNull();
    expect(s.forkFixture).toBeUndefined();
  });

  it.each([-1n, RECOVERY_FORK_SEEDED_SHARES + 1n])(
    "does not attribute unexpected fixture shares %s", shares => {
      const s = snapshot(chain(shares));
      expect(s.live?.principalKnown).toBe(false);
      expect(s.forkFixture).toBeUndefined();
    },
  );

  it("does not fabricate principal for another connected account", () => {
    const s = snapshot({ ...chain(), address: OTHER });
    expect(s.live?.chainFresh).toBe(true);
    expect(s.live?.principalKnown).toBe(false);
    expect(s.forkFixture).toBeUndefined();
    const mismatch = buildRecoveryForkSnapshot(feed(), {
      now: NOW, observedAt: NOW, address: OTHER, chainId: 31337, chain: chain(),
    });
    expect(mismatch.live?.chainFresh).toBe(false);
    expect(mismatch.forkFixture).toBeUndefined();
  });

  it("requires both the local environment and the actual account chain", () => {
    expect(snapshot({ ...chain(), chainId: 1 }).forkFixture).toBeUndefined();
    const wrongWallet = buildRecoveryForkSnapshot(feed(), {
      now: NOW, observedAt: NOW, address: RECOVERY_FORK_ACCOUNT, chainId: 1, chain: chain(),
    });
    expect(wrongWallet.forkFixture).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_YETH_FORK_RPC_URL", "");
    const s = snapshot({ ...chain(), blockTimestamp: NOW });
    expect(s.live?.chainFresh).toBe(true);
    expect(s.live?.principalKnown).toBe(false);
    expect(s.forkFixture).toBeUndefined();
  });

  it("fails closed for production, nonloopback RPC, and mock connector configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => snapshot()).toThrow("disabled in production");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_YETH_FORK_RPC_URL", "https://example.com");
    expect(() => snapshot()).toThrow("loopback");
    vi.stubEnv("NEXT_PUBLIC_YETH_FORK_RPC_URL", "http://127.0.0.1:18546");
    vi.stubEnv("NEXT_PUBLIC_E2E", "true");
    expect(() => snapshot()).toThrow("mock transaction connector");
  });

  it("does not modify public programme, holder, or historical evidence", () => {
    const data = feed();
    const before = structuredClone(data);
    const result = buildRecoveryForkSnapshot(data, {
      now: NOW, observedAt: NOW, chain: chain(),
      address: RECOVERY_FORK_ACCOUNT, chainId: 31337,
    });
    expect(data).toEqual(before);
    expect(result.holders).toBeNull();
    expect(result.claimedPrincipalEth).toBe(0n);
    expect(result.exitedPrincipalEth).toBe(0n);
    expect(result.live?.holderDataCurrent).toBe(false);
  });
});
