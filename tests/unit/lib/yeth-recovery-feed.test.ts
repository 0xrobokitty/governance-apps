import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseRecoveryFeed, referenceSchema, uint } from "@/lib/clients/yeth/recovery/feed-schema";
import { recoverySourceUrl, fetchRecoveryEnvelope } from "@/lib/clients/yeth/recovery/feed-server";
import { buildRecoverySnapshot } from "@/lib/clients/yeth/recovery/feed-adapter";
import { recoveryChoices, recoveryTarget } from "@/lib/clients/yeth/recovery/decisions";
import { recoveryFunding, exitedClaims, holderDistribution, poolProgress } from "@/lib/clients/yeth/recovery/journey";
import { recoveryProjectionYears, WAD } from "@/lib/clients/yeth/recovery/model";
import { YETH_CLAIM, YETH_RECOVERY_VAULT, YETH_YIELD_VAULT } from "@/lib/clients/yeth/deployment";
import { RECOVERY_WRAPPER, RECOVERY_AUCTION, RECOVERY_WETH } from "@/lib/clients/yeth/recovery/onchain";

const NOW = 1800000000;
const ADDRESS = "0x1111111111111111111111111111111111111111";
const block = { number: "100", hash: "0x" + "a".repeat(64), timestamp: NOW };
const amount = (n: number) => (BigInt(n) * WAD).toString();
function fixture() {
  const documents: Record<string, unknown> = {};
  const bodies: Record<string, string> = {};
  function add(schema: string, rest: object, count?: number) {
    const body = JSON.stringify({ schema, ...rest });
    const sha256 = createHash("sha256").update(body).digest("hex");
    const url = "yeth-recovery-snapshots/" + sha256 + ".json";
    documents[url] = JSON.parse(body); bodies[url] = body;
    return { schema, url, sha256, ...(count === undefined ? {} : { count }) };
  }
  const pages = (refs: unknown[]) => ({ kind: "pages", pages: refs });
  const history = add("yeth-recovery-history/v1", { chainId: 1, indexedThrough: block, days: pages([
    add("yeth-recovery-day-page/v1", { values: [{ dayIndex: 20000, closingBlock: { ...block, timestamp: NOW - 86400 }, closing: { assetsPerShareWad: amount(1) }, recoveryRateWad: "300000000000000000", complete: true }] }, 1),
  ]) });
  const holders = add("yeth-recovery-holders/v1", { block, complete: true, current: true, holderAccountCount: 1,
    totalSupplyWei: amount(100), holderSharesWei: amount(100), representedClaimWei: amount(400), protocolCustodySharesWei: "0", reconciliationResidualWei: "0",
    positions: pages([add("yeth-recovery-holder-page/v1", { values: [{ address: ADDRESS, sharesWei: amount(100), representedClaimWei: amount(400), classification: "holder" }] }, 1)]),
  });
  const auctionHistory = add("yeth-recovery-auctions/v1", { indexedThrough: block, complete: true, fills: pages([]), rounds: pages([]) });
  const head = {
    schema: "yeth-recovery/v3", mode: "live", chainId: 1, observedAt: NOW, generatedAt: NOW, block, indexedThrough: block,
    producer: { name: "gov-apps-yeth", version: "0.10.0", revision: "a".repeat(40) },
    contracts: { claim: YETH_CLAIM, recoveryVault: YETH_RECOVERY_VAULT, yieldVault: YETH_YIELD_VAULT, auctionWrapper: RECOVERY_WRAPPER, underlyingAuction: RECOVERY_AUCTION, underlyingAsset: RECOVERY_WETH, assetDecimals: 18, shareDecimals: 18 },
    claim: { recoveryRateWad: "300000000000000000" },
    recoveryVault: { assetsWei: amount(150), sharesWei: amount(100), assetsPerShareWad: "1500000000000000000", targetAssetsPerShareWad: amount(3), normalizedRecoveryWad: "450000000000000000" },
    yieldVault: { assetsWei: amount(1000) },
    capital: { complete: true, block },
    accounting: { complete: true, historyComplete: true },
    programme: { block, complete: true, current: true, source: { observedAt: NOW, maxAgeSeconds: 900 }, principal: { allocatedWei: amount(500), totalSettledWei: amount(100), activeHolderWei: amount(400), unsettledCustodyWei: "0", unclaimedEligibilityWei: "0", unattributedAdministrativeDebitsWei: "0", claimBookResidualWei: "0" } },
    quality: { snapshotMaxAgeSeconds: 300, historyMaxAgeSeconds: 1800, historyStatus: "current", finalizedHead: block, unindexedFinalizedBlocks: 0 },
    baseline: { block: { ...block, timestamp: NOW - 86400 }, normalizedRecoveryWad: "300000000000000000" },
    history, holders, auctionHistory,
    funding: { indexedThrough: block, basis: "all-time-first-allocation/v1", current: true, complete: true, vault: { yieldWei: amount(20), donationsWei: amount(5) }, auctions: { yieldWei: amount(3), donationsWei: amount(2) }, totalKickedRounds: 2, unknownWei: "0", pendingAllocationWei: "0" },
    kong: { status: "available", observedAt: NOW, rates: [{ value: .04, basis: "estimated", kind: "apy", windowDays: null, observedAt: NOW }], strategies: [] },
    auction: { kickedAt: 0, initialAvailableWei: "0", availableWei: "0", startingPriceWad: amount(1), minimumPriceWad: "300000000000000000", stepDurationSeconds: 225, stepDecayRateBps: 4, auctionLengthSeconds: 604800 },
    forecast: { method: "current-capital-net-recovery-income/v2", forecastFrom: NOW, basis: { windowDays: 90, historySha256: history.sha256 }, dailyAssetsPerShareGrowthWad: "1000000000000000", fullRecoveryWad: "900000000000000000", targets: [{ targetBps: 10000, status: "estimated", days: 1500 }] },
    performance: { basis: "observed-pps/v1", notAForecast: true, windows: [{ windowDays: 30, status: "measured", periodReturnWad: "10000000000000000", annualizedReturn: .128, closingBlock: block }] },
  };
  return { head, documents, bodies };
}
function chain() {
  return { address: ADDRESS, blockTimestamp: NOW, shares: 100n * WAD, allowance: 0n, wethBalance: 999n * WAD, directAssets: 150n * WAD, maxRedeem: 100n * WAD, vaultPps: 1500000000000000000n, recoveryRate: 300000000000000000n, auction: null, positionTransfersSinceIndexed: false };
}
const snapshot = () => buildRecoverySnapshot(parseRecoveryFeed(fixture(), NOW), { now: NOW, address: ADDRESS, chain: chain() });

describe("live recovery accounting", () => {
  it("uses remaining represented principal and never treats wallet WETH as paid recovery", () => {
    const s = snapshot();
    expect(s.originalClaimEth).toBe(400n * WAD);
    expect(recoveryChoices(s).accountRecovery).toBe(.375);
    expect(recoveryChoices(s).claimValue).toBe(400n * WAD);
    expect(holderDistribution(s)?.representedClaim).toBe(400n * WAD);
    expect(exitedClaims(s)?.fraction).toBe(.2);
  });
  it("uses producer net income rather than donation-inclusive history slope", () => {
    expect(recoveryProjectionYears(snapshot())).toBeCloseTo(1500 / 365);
    expect(recoveryTarget(snapshot(), 75).years).toBeCloseTo(1500 / 365);
    expect(recoveryTarget(snapshot(), 100).status).toBe("outside-claim");
  });
  it("retains all-time funding and measured performance as distinct data", () => {
    const s = snapshot();
    expect(recoveryFunding(s)).toMatchObject({ vault: 25n * WAD, auctions: 5n * WAD, donations: 7n * WAD, yieldReceived: 23n * WAD, rounds: 2 });
    expect(s.live?.measuredPerformance[0].periodReturn).toBe(.01);
  });
  it.each([true, undefined])("withholds principal when transfer proof is %s", positionTransfersSinceIndexed => {
    const s = buildRecoverySnapshot(parseRecoveryFeed(fixture(), NOW), { now: NOW, address: ADDRESS, chain: { ...chain(), positionTransfersSinceIndexed } });
    expect(s.live?.principalKnown).toBe(false);
    expect(recoveryChoices(s).accountRecovery).toBeNull();
    expect(recoveryChoices(s).directValue).toBe(150n * WAD);
  });
  it("keeps fresh chain exit amounts when feed accounting is stale", () => {
    const s = buildRecoverySnapshot(parseRecoveryFeed(fixture(), NOW + 400), { now: NOW + 400, address: ADDRESS, chain: { ...chain(), blockTimestamp: NOW + 400 } });
    expect(s.live?.feedFresh).toBe(false);
    expect(s.live?.chainFresh).toBe(true);
    expect(recoveryChoices(s).directValue).toBe(150n * WAD);
    expect(recoveryChoices(s).accountRecovery).toBeNull();
    expect(recoveryProjectionYears(s)).toBeNull();
    expect(poolProgress(s).current).toBe(.45);
    expect(s.live?.ppsHistory).toHaveLength(1);
  });
  it("does not claim a current observation is a missing recovery baseline", () => {
    const f = fixture();
    const missing = { ...f, head: { ...f.head, baseline: null } };
    const s = buildRecoverySnapshot(parseRecoveryFeed(missing, NOW), { now: NOW });
    expect(s.live?.baselineKnown).toBe(false);
    expect(s.live?.ppsHistory).toHaveLength(1);
  });
  it("rejects a zero contract recovery rate before calculating milestones", () => {
    const f = fixture(); f.head.claim.recoveryRateWad = "0";
    expect(() => parseRecoveryFeed(f,NOW)).toThrow();
  });
  it("keeps incomplete accounting unavailable rather than reporting zero settlement", () => {
    const f = fixture();
    f.head.accounting.complete = false;
    f.head.programme.complete = false;
    const s = buildRecoverySnapshot(parseRecoveryFeed(f, NOW), { now: NOW, address: ADDRESS, chain: chain() });
    expect(s.live?.principalKnown).toBe(false);
    expect(s.live?.fundingTotals).toBeNull();
    expect(exitedClaims(s)).toBeNull();
    expect(holderDistribution(s)).toBeNull();
    expect(recoveryChoices(s).directValue).toBe(150n * WAD);
  });
  it("withholds future-dated manual ledger observations", () => {
    const f = fixture(); f.head.programme.source.observedAt = NOW + 61;
    const s = buildRecoverySnapshot(parseRecoveryFeed(f, NOW), { now: NOW, address: ADDRESS, chain: chain() });
    expect(s.live?.programmeCurrent).toBe(false);
    expect(recoveryTarget(s,50).status).toBe("unavailable");
  });
  it("withholds programme/personal metrics for stale manual settlement evidence", () => {
    const f = fixture(); f.head.programme.source.observedAt = NOW - 901;
    const s = buildRecoverySnapshot(parseRecoveryFeed(f, NOW), { now: NOW, address: ADDRESS, chain: chain() });
    expect(s.live?.principalKnown).toBe(false);
    expect(exitedClaims(s)).toBeNull();
  });
  it("does not publish dates beyond the producer's 100-year horizon", () => {
    const s = snapshot(); s.live!.dailyAssetsPerShareGrowth = 1n;
    expect(recoveryProjectionYears(s)).toBeNull();
    expect(poolProgress(s).milestones.every(m => m.years === null)).toBe(true);
  });
  it("hides stale per-rate Kong APY independently of measured chain data", () => {
    const f = fixture(); f.head.kong.rates[0].observedAt = NOW - 86401;
    const s = buildRecoverySnapshot(parseRecoveryFeed(f,NOW),{now:NOW});
    expect(s.yieldApy).toBeNull(); expect(s.live?.measuredPerformance).toHaveLength(1);
  });
});
describe("recovery feed boundaries", () => {
  it.each(["1e18", "-1", "01", "9".repeat(100000)])("rejects malformed or oversized amounts", value => expect(uint.safeParse(value).success).toBe(false));
  it.each(["../secret", "//evil.test/a", "https://evil.test/a", "yeth-recovery-snapshots/" + "a".repeat(64) + ".json?x=1"])("rejects noncanonical references", url => expect(referenceSchema.safeParse({ url, sha256: "a".repeat(64), schema: "yeth-recovery-history/v1" }).success).toBe(false));
  it("rejects contract drift, future timestamps, and mismatched observations", () => {
    const f = fixture(); f.head.contracts.recoveryVault = ADDRESS as typeof YETH_RECOVERY_VAULT;
    expect(() => parseRecoveryFeed(f,NOW)).toThrow();
    const future = fixture(); future.head.generatedAt += 61;
    expect(() => parseRecoveryFeed(future,NOW)).toThrow();
    const mixed = fixture(); (mixed.documents[mixed.head.holders.url] as {block:typeof block}).block = { ...block, number: "99" };
    expect(() => parseRecoveryFeed(mixed,NOW)).toThrow();
  });
  it("rejects incomplete principal reconciliation", () => {
    const f = fixture(); f.head.programme.principal.totalSettledWei = amount(101);
    expect(() => parseRecoveryFeed(f,NOW)).toThrow();
  });
  it("allows only fixed production or explicit local preview sources", () => {
    expect(() => recoverySourceUrl("https://evil.test/yeth-recovery.json")).toThrow();
    expect(() => recoverySourceUrl("http://127.0.0.1/yeth-recovery.json",true)).toThrow();
    expect(recoverySourceUrl("http://127.0.0.1:9999/yeth-recovery.json",false).hostname).toBe("127.0.0.1");
  });
  it("checks every raw page hash before accepting the graph", async () => {
    const f = fixture();
    const fetcher = async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname.replace("/prod/","");
      return new Response(path === "yeth-recovery.json" ? JSON.stringify(f.head) : f.bodies[path]);
    };
    const envelope = await fetchRecoveryEnvelope(recoverySourceUrl(), fetcher as typeof fetch, NOW);
    expect(parseRecoveryFeed(envelope,NOW).positions).toHaveLength(1);
    const bad = async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname.replace("/prod/","");
      return new Response(path === "yeth-recovery.json" ? JSON.stringify(f.head) : f.bodies[path] + " ");
    };
    await expect(fetchRecoveryEnvelope(recoverySourceUrl(),bad as typeof fetch,NOW)).rejects.toThrow("digest");
  });
  it.skipIf(!process.env.YETH_AUDIT_JSON)("accepts the verified public production graph", () => {
    const raw = JSON.parse(readFileSync(process.env.YETH_AUDIT_JSON!,"utf8"));
    const data = parseRecoveryFeed(raw,raw.head.generatedAt);
    expect(data.head.accounting.complete).toBe(true);
    expect(data.days.length).toBeGreaterThan(250);
  });
});
