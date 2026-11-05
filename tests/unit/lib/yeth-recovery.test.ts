import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import { auctionEnd, auctionPrice, auctionRecovery, isSnapshotFresh, maxTake, normalizedRecovery, parseWethInput, projectionYears, quoteTake, recoveryMetrics, WAD } from "@/lib/clients/yeth/recovery/model";
import { isYethRecoveryPreviewEnabled } from "@/lib/runtime/features";
const eth = parseEther;
const create = () => new MockRecoveryPreviewClient(() => 1_800_000_000);

describe("recovery auction domain", () => {
  it("normalizes raw share value using the original claim recovery rate", () => {
    expect(normalizedRecovery(eth("1.14"), eth("0.425"))).toBeCloseTo(0.4845);
    expect(auctionRecovery(eth("0.425"), eth("0.425"))).toBe(1);
    expect(auctionRecovery(0n, eth("0.425"))).toBe(0);
  });
  it("matches discrete 4bps decay and the minimum-price boundary", () => {
    const a = { ...create().getSnapshot().auction, initialWeth: WAD, startingPrice: WAD, kickedAt: 1000, minimumPrice: eth("0.9995") };
    expect(auctionPrice(a, 1224)).toBe(WAD);
    expect(auctionPrice(a, 1225)).toBe(eth("0.9996"));
    expect(auctionPrice(a, 1450)).toBe(0n);
    expect(auctionEnd(a)).toBe(1450);
    expect(auctionPrice({ ...a, minimumPrice: eth("0.9996") }, 1225)).toBe(eth("0.9996"));
  });
  it("expires strictly after seven days even when the floor is not reached", () => {
    const a = { ...create().getSnapshot().auction, kickedAt: 1000, minimumPrice: 1n, stepDecayBps: 0 };
    expect(auctionPrice(a, 1000 + 7 * 86400)).toBeGreaterThan(0n);
    expect(auctionPrice(a, 1001 + 7 * 86400)).toBe(0n);
    expect(auctionEnd(a)).toBe(1001 + 7 * 86400);
    expect(auctionPrice({ ...a, kickedAt: 0 }, 1000)).toBe(0n);
  });
  it("uses WETH output and floors share cost without exceeding inventory or balance", () => {
    const s = create().getSnapshot();
    const quote = quoteTake(s, WAD)!;
    expect(quote.shares).toBe(auctionPrice(s.auction, s.now));
    expect(quote.fullClaimEth).toBe(quote.shares * WAD / s.recoveryRate);
    expect(quoteTake(s, 0n)).toBeNull();
    expect(quoteTake(s, eth("100"))).toBeNull();
    expect(quoteTake(s, maxTake(s))).not.toBeNull();
    expect(quoteTake({ ...s, shares: 0n }, WAD)).toBeNull();
  });
  it.each(["-1", "1e3", "NaN", "Infinity", "", "0.1234567890123456789", " 1", "1,2"])("rejects invalid amount %s", input => {
    expect(parseWethInput(input)).toBeNull();
  });
  it("accepts exact 18-decimal input without rounding", () => {
    expect(parseWethInput("0.000000000000000001")).toBe(1n);
    expect(parseWethInput("1.")).toBe(WAD);
  });
  it("withholds forecasts for missing, short, flat or falling history", () => {
    expect(projectionYears([], 0.5)).toBeNull();
    expect(projectionYears([{ day: 0, recovery: .4 }, { day: 7, recovery: .5 }], .5)).toBeNull();
    expect(projectionYears([{ day: 0, recovery: .5 }, { day: 30, recovery: .4 }], .4)).toBeNull();
    expect(projectionYears([{ day: 0, recovery: .5 }, { day: 30, recovery: .5 }], .5)).toBeNull();
    expect(projectionYears(create().getSnapshot().history, .4845)).toBeCloseTo(7.06164, 4);
  });
  it("requires a fresh snapshot and fails closed on future timestamps", () => {
    const s = create().getSnapshot();
    expect(isSnapshotFresh(s)).toBe(true);
    expect(isSnapshotFresh({ ...s, asOf: s.now - 61 })).toBe(false);
    expect(isSnapshotFresh({ ...s, asOf: s.now + 1 })).toBe(false);
  });
});

describe("preview transaction lifecycle", () => {
  it("has no executable offer before governance starts an auction", () => {
    const client = create();
    client.setScenario("waiting");
    const snapshot = client.getSnapshot();
    expect(auctionPrice(snapshot.auction, snapshot.now)).toBe(0n);
    expect(quoteTake(snapshot, WAD)).toBeNull();
    expect(recoveryMetrics(snapshot).directValue).toBe(eth("4.845"));
  });
  it("requires approval, consumes shares and credits only filled WETH", async () => {
    const client = create();
    const s = client.getSnapshot();
    const quote = quoteTake(s, WAD)!;
    await expect(client.prepareTake(WAD, quote.shares, s.auction.kickedAt)()).rejects.toThrow("offer changed");
    await client.prepareApprove(quote.shares)();
    await client.prepareTake(WAD, quote.shares, s.auction.kickedAt)();
    expect(client.getSnapshot().shares).toBe(s.shares - quote.shares);
    expect(client.getSnapshot().walletWeth).toBe(WAD);
    expect(client.getSnapshot().allowance).toBe(0n);
  });
  it("allows a partial fill when inventory changes after quote preparation", async () => {
    const client = create();
    const s = client.getSnapshot();
    const quote = quoteTake(s, WAD)!;
    await client.prepareApprove(quote.shares)();
    const prepared = client.prepareTake(WAD, quote.shares, s.auction.kickedAt);
    client.consumeLiquidity(s.auction.remainingWeth - eth("0.25"));
    await prepared();
    expect(client.getSnapshot().walletWeth).toBe(eth("0.25"));
    expect(client.getSnapshot().shares).toBe(s.shares - quote.shares / 4n);
  });
  it("rejects expired rounds and stale data at execution", async () => {
    const client = create();
    const s = client.getSnapshot();
    await expect(client.prepareTake(WAD, WAD, s.auction.kickedAt - 1)()).rejects.toThrow("auction changed");
    client.setScenario("stale");
    await expect(client.prepareRedeem()()).rejects.toThrow("Refresh");
    client.setScenario("ended");
    await expect(client.prepareTake(WAD, WAD, client.getSnapshot().auction.kickedAt)()).rejects.toThrow("offer changed");
  });
  it("direct redemption reduces assets and shares proportionally", async () => {
    const client = create();
    const s = client.getSnapshot();
    await client.prepareRedeem()();
    expect(client.getSnapshot().shares).toBe(0n);
    expect(client.getSnapshot().walletWeth).toBe(eth("4.845"));
    expect(client.getSnapshot().totalShares).toBe(s.totalShares - s.shares);
    expect(client.getSnapshot().vaultPps).toBe(s.vaultPps);
  });
});

describe("preview gate", () => {
  it("requires mock selection and the explicit flag outside production", () => {
    const env = { NEXT_PUBLIC_RUNTIME_MODE: "development", NEXT_PUBLIC_USE_MOCKS: "true", NEXT_PUBLIC_YETH_RECOVERY_PREVIEW: "true" };
    expect(isYethRecoveryPreviewEnabled(env)).toBe(true);
    expect(isYethRecoveryPreviewEnabled({ ...env, NEXT_PUBLIC_RUNTIME_MODE: "production" })).toBe(false);
    expect(isYethRecoveryPreviewEnabled({ ...env, NEXT_PUBLIC_USE_MOCKS: "false" })).toBe(false);
    expect(isYethRecoveryPreviewEnabled({ ...env, NEXT_PUBLIC_YETH_RECOVERY_PREVIEW: "false" })).toBe(false);
    expect(isYethRecoveryPreviewEnabled({ NODE_ENV: "production", NEXT_PUBLIC_USE_MOCKS: "true", NEXT_PUBLIC_YETH_RECOVERY_PREVIEW: "true" })).toBe(false);
  });
});
