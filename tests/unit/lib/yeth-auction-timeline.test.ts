import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { buildAuctionTimeline } from "@/lib/clients/yeth/recovery/auction-timeline";
import { auctionPrice, WAD } from "@/lib/clients/yeth/recovery/model";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import type { RecoveryLiveMetadata, RecoverySnapshot } from "@/lib/clients/yeth/recovery/types";

const start = 1_800_000_000;
function snapshot(): RecoverySnapshot {
  const value = new MockRecoveryPreviewClient(() => start + 50).getSnapshot();
  return { ...value, connected: false, now: start + 50, asOf: start + 50, recoveryRate: parseEther(".25"), shares: parseEther("10"),
    auction: { kickedAt: start, initialWeth: WAD, remainingWeth: WAD, startingPrice: WAD, minimumPrice: parseEther(".2"), stepDuration: 100, stepDecayBps: 5000, length: 1000 } };
}
function live(): RecoveryLiveMetadata {
  return { principalKnown: true, baselineKnown: true, principalUnavailableReason: null, historyCurrent: true,
    feedFresh: false, chainFresh: true, chainAsOf: start + 50, feedAsOf: start - 10000, indexedAt: start - 10000,
    directAssets: 0n, maxRedeem: 0n, targetAssetsPerShare: parseEther("4"), dailyAssetsPerShareGrowth: null,
    publicReferenceRecovery: .25, measuredPerformance: [], ppsHistory: [], fundingTotals: null, holderDataCurrent: true, holderPrincipalCurrent: true,
    auctionHistoryCurrent: false, programmeCurrent: true, producerVersion: "test" };
}

describe("exact auction timeline", () => {
  it("finds the first valid discrete offer for each milestone, including a shared step", () => {
    const s = snapshot(), data = buildAuctionTimeline(s);
    expect(data.basis).toBe("reference");
    expect(data.current?.recoveryWad).toBe(parseEther(".25"));
    expect(data.milestones.map(m => [m.target, m.at, m.status])).toEqual([
      [50, start + 100, "upcoming"], [75, start + 200, "upcoming"], [100, start + 200, "upcoming"],
    ]);
    expect(data.endAt).toBe(start + 300);
    expect(data.last?.at).toBe(start + 299);
    expect(data.last?.recoveryWad).toBe(WAD);
    expect(data.points.every(point => point.price > 0n)).toBe(true);
  });
  it("does not promise a floor plateau or extrapolate an unreachable 100% date", () => {
    const s = snapshot();
    s.recoveryRate = parseEther(".4999");
    s.auction.minimumPrice = s.recoveryRate;
    const data = buildAuctionTimeline(s);
    expect(data.endAt).toBe(start + 200);
    expect(data.last?.recoveryWad).toBe(parseEther(".9998"));
    expect(data.milestones.find(m => m.target === 100)).toEqual({ target: 100, status: "unreachable", at: null });
    expect(data.maxRecovery).toBe(1);
  });
  it("includes the exact hard-end second, then marks the round ended", () => {
    const s = snapshot();
    s.auction.length = 250;
    expect(buildAuctionTimeline(s).endAt).toBe(start + 251);
    s.now = s.asOf = start + 250;
    expect(buildAuctionTimeline(s).current?.price).toBe(parseEther(".25"));
    s.now = s.asOf = start + 251;
    const ended = buildAuctionTimeline(s);
    expect(ended.status).toBe("ended");
    expect(ended.current).toBeNull();
    expect(ended.last?.at).toBe(start + 250);
  });
  it("normalizes a fractional fork clock through the final valid contract second", () => {
    const s = snapshot(); s.auction.length = 250;
    s.now = start + 250.75; s.asOf = start + 250;
    const data = buildAuctionTimeline(s);
    expect(data.status).toBe("active");
    expect(data.now).toBe(start + 250);
    expect(data.current?.price).toBe(parseEther(".25"));
    s.now = start + 251.01;
    expect(buildAuctionTimeline(s).status).toBe("ended");
  });
  it("uses verified remaining principal for personal rates, independently of indexed price history", () => {
    const s = { ...snapshot(), connected: true, originalClaimEth: parseEther("20"), live: live() };
    const personal = buildAuctionTimeline(s);
    expect(personal.basis).toBe("personal");
    expect(personal.current?.recoveryWad).toBe(parseEther(".5"));
    expect(personal.milestones.find(m => m.target === 100)?.at).toBe(start + 100);
    expect(personal.milestones[0].status).toBe("reached");
    expect(buildAuctionTimeline({ ...s, walletWeth: parseEther("10000") }).milestones).toEqual(personal.milestones);
    const reference = buildAuctionTimeline({ ...s, live: { ...s.live, principalKnown: false } });
    expect(reference.basis).toBe("reference");
    expect(reference.current?.recoveryWad).toBe(parseEther(".25"));
    expect(reference.milestones.find(m => m.target === 100)?.at).toBe(start + 200);
  });
  it("marks reached milestones without hiding their actual first-offer time", () => {
    const s = snapshot(); s.now = s.asOf = start + 150;
    const data = buildAuctionTimeline(s);
    expect(data.milestones[0]).toEqual({ target: 50, at: start + 100, status: "reached" });
    expect(data.current?.at).toBe(start + 150);
    expect(data.current?.price).toBe(parseEther(".5"));
  });
  it("handles a constant price without inventing growth", () => {
    const s = snapshot(); s.auction.stepDecayBps = 0;
    expect(buildAuctionTimeline(s).milestones.every(m => m.at === null)).toBe(true);
    expect(buildAuctionTimeline(s).endAt).toBe(start + 1001);
  });
  it("fails closed for stale data, empty inventory, malformed intervals and excessive steps", () => {
    const s = snapshot();
    expect(buildAuctionTimeline({ ...s, asOf: s.now - 61 }).status).toBe("unavailable");
    expect(buildAuctionTimeline({ ...s, auction: { ...s.auction, remainingWeth: 0n } }).status).toBe("empty");
    for (const auction of [{ ...s.auction, stepDuration: 0 }, { ...s.auction, stepDecayBps: 4.5 }, { ...s.auction, length: 100_001, stepDuration: 1 }]) {
      expect(buildAuctionTimeline({ ...s, auction }).points).toEqual([]);
    }
  });
  it("matches the observed fork price and finds only milestones available before the deployed cutoff", () => {
    const s = snapshot();
    s.now = s.asOf = 1793958344;
    s.recoveryRate = parseEther(".3196079");
    s.auction = { kickedAt: 1793871504, initialWeth: parseEther("100"), remainingWeth: parseEther("100"),
      startingPrice: 93173175382546813117n, minimumPrice: s.recoveryRate, stepDuration: 225, stepDecayBps: 4, length: 604800 };
    const data = buildAuctionTimeline(s);
    expect(data.current?.price).toBe(798722956034260083n);
    for (const milestone of data.milestones) {
      const validSteps = Array.from({ length: Math.floor(s.auction.length / 225) + 1 }, (_, step) => s.auction.kickedAt + step * 225)
        .filter(at => at < data.endAt);
      const first = validSteps.find(at => s.recoveryRate * 100n >= BigInt(milestone.target) * auctionPrice(s.auction, at));
      expect(milestone.at).toBe(first ?? null);
    }
    expect(data.milestones[2].at).toBeNull();
    expect(data.last!.recoveryWad).toBeLessThan(WAD);
  });
});
