import { describe, it, expect } from "vitest";
import { parseEther } from "viem";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import { exitOffer, holderDistribution, poolProgress, reviewedAuctionQuote, recoveryFunding, exitedClaims } from "@/lib/clients/yeth/recovery/journey";
import { WAD } from "@/lib/clients/yeth/recovery/model";

const client = () => new MockRecoveryPreviewClient(() => 1800000000);
describe("one recovery exit offer", () => {
  it("promotes a full auction over direct redemption", () => {
    const s = client().getSnapshot(), offer = exitOffer(s, "complete");
    expect(offer.beneficial).toBe(true);
    expect(offer.coversPosition).toBe(true);
    expect(offer.payout).toBeGreaterThan(offer.directValue);
    expect(offer.rate).toBeCloseTo(.690066, 5);
    expect(offer.yearsAhead).toBeCloseTo(2.816, 2);
  });
  it("weights partial exits by the claim consumed", () => {
    const c = client(); c.setScenario("limited");
    const s = c.getSnapshot(), combined = exitOffer(s, "complete"), auction = exitOffer(s, "auction");
    expect(combined.coversPosition).toBe(false);
    expect(auction.payout).toBe(parseEther(".75"));
    expect(combined.payout).toBe(combined.quote!.weth + combined.remainingShares * s.vaultPps / WAD);
    expect(combined.rate).toBeCloseTo(.50684, 4);
    expect(auction.rate).toBeCloseTo(.690066, 5);
    expect(combined.yearsAhead).toBeCloseTo(auction.yearsAhead!);
    expect(combined.holdYears).toBeCloseTo(.306, 2);
    expect(auction.holdYears).toBeCloseTo(2.816, 2);
    expect(auction.soldFraction).toBeCloseTo(.1087, 3);
    expect(auction.keptFraction).toBeCloseTo(.8913, 3);
    expect(combined.keptFraction).toBe(0);
  });
  it("uses direct redemption when the auction pays less", () => {
    const s = client().getSnapshot(); s.auction.kickedAt = s.now; s.auction.startingPrice *= 2n;
    const offer = exitOffer(s, "auction");
    expect(offer.active).toBe(true);
    expect(offer.beneficial).toBe(false);
    expect(offer.quote).toBeNull();
    expect(offer.payout).toBe(offer.directValue);
  });
  it("does not promote rounding dust as a better offer", () => {
    const s = client().getSnapshot(); s.auction.kickedAt = s.now;
    expect(exitOffer(s, "complete").beneficial).toBe(false);
  });
  it("does not invent a time equivalent from flat or stale history", () => {
    const c = client(); c.setScenario("flat");
    expect(exitOffer(c.getSnapshot(), "complete").yearsAhead).toBeNull();
    c.setScenario("stale");
    expect(exitOffer(c.getSnapshot(), "complete").beneficial).toBe(false);
  });
});
describe("pool timeline and holders", () => {
  it("keeps pool milestones distinct from a previously exited account", () => {
    const s = client().getSnapshot(); s.shares = 0n; s.walletWeth = parseEther("6.9");
    const p = poolProgress(s);
    expect(p.baseline).toBe(.36);
    expect(p.change).toBeCloseTo(.1245);
    expect(p.milestones.map(m => m.years)).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(p.milestones[2].years).toBeCloseTo(7.06164, 3);
    expect(p.currentPosition).toBeCloseTo(19.453125);
    expect(p.milestones[0].position).toBeCloseTo(21.875);
    expect(p.milestones[2].position).toBe(100);
    expect(p.milestones[0].estimatedAt).toBe(s.now + 78 * 86400);
  });
  it("does not assign another holder’s position to the empty example account", () => {
    const c = client(); c.setScenario("no-position");
    expect(holderDistribution(c.getSnapshot())!.positions.some(p => p.id === "example-account")).toBe(false);
  });
  it("withholds stale and flat projections", () => {
    const c = client(); c.setScenario("stale");
    expect(poolProgress(c.getSnapshot()).current).toBeNull();
    expect(poolProgress(c.getSnapshot()).milestones.every(m => m.estimatedAt === null)).toBe(true);
    expect(poolProgress(c.getSnapshot()).milestones.every(m => m.years === null)).toBe(true);
    c.setScenario("flat");
    expect(c.getSnapshot().progressHistory.slice(-2).map(p => p.recovery)).toEqual([.4845, .4845]);
    expect(recoveryFunding(c.getSnapshot()).vault).toBe(0n);
    expect(poolProgress(c.getSnapshot()).milestones.every(m => m.years === null)).toBe(true);
  });
  it("reconciles holders and excludes protocol custody", () => {
    const s = client().getSnapshot(), data = holderDistribution(s)!;
    expect(data.accounts).toBe(48);
    expect(data.representedClaim).toBe(parseEther("1000"));
    expect(data.buckets).toEqual([24, 11, 9, 4]);
    expect(data.positions[0].shares).toBe(parseEther("162.75"));
    s.holders!.positions.push({ id: "wrapper", address: "0x26868F94684dEC5Ea6fF93ccc06aBde1015ce2CE", shares: parseEther("100"), kind: "system" });
    expect(holderDistribution(s)!.representedClaim).toBe(data.representedClaim);
    s.holders!.asOf -= 61;
    expect(holderDistribution(s)).toBeNull();
  });
});
describe("review and sequential redemption", () => {
  it("reprices within reviewed caps and rejects changed rounds or stale data", () => {
    const c = client(), s = c.getSnapshot(), offer = exitOffer(s, "complete");
    c.advanceStep();
    expect(reviewedAuctionQuote(c.getSnapshot(), offer.quote!.weth, offer.quote!.shares, s.auction.kickedAt)?.shares).toBeLessThan(offer.quote!.shares);
    expect(reviewedAuctionQuote(s, offer.quote!.weth, offer.quote!.shares - 1n, s.auction.kickedAt)).toBeNull();
    expect(reviewedAuctionQuote(s, offer.quote!.weth, offer.quote!.shares, s.auction.kickedAt + 1)).toBeNull();
    expect(reviewedAuctionQuote({ ...s, asOf: s.now - 61 }, offer.quote!.weth, offer.quote!.shares, s.auction.kickedAt)).toBeNull();
  });
  it("preserves an actual partial auction receipt when redemption fails, then retries only the remainder", async () => {
    const c = client(); c.setScenario("redeem-error");
    const s = c.getSnapshot(), offer = exitOffer(s, "complete"), q = offer.quote!;
    await c.prepareApprove(q.shares)();
    c.consumeLiquidity(parseEther(".25"));
    await c.prepareTake(q.weth, q.shares, s.auction.kickedAt)();
    const after = c.getSnapshot();
    expect(after.walletWeth).toBe(parseEther(".5"));
    expect(after.auctionHistory[0].weth).toBe(parseEther(".5"));
    expect(after.auctionHistory[0].transactionHash).toBeNull();
    expect(after.auctionHistory).toHaveLength(s.auctionHistory.length + 1);
    expect(after.shares).toBeGreaterThan(offer.remainingShares);
    await expect(c.prepareRedeem()()).rejects.toThrow("auction payout is safe");
    expect(c.getSnapshot().walletWeth).toBe(after.walletWeth);
    expect(c.getSnapshot().shares).toBe(after.shares);
    await c.prepareRedeem()();
    expect(c.getSnapshot().walletWeth).toBe(after.walletWeth + after.shares * after.vaultPps / WAD);
    expect(c.getSnapshot().shares).toBe(0n);
    expect(holderDistribution(c.getSnapshot())!.accounts).toBe(47);
    expect(s.holders!.positions.find(p => p.id === "example-account")!.shares).toBe(parseEther("4.25"));
  });
});


describe("observed recovery funding and completed claims", () => {
  it("separates donated funding from recurring yield and counts each allocation once", () => {
    const s = client().getSnapshot();
    s.funding.push({ ...s.funding[0] });
    const funding = recoveryFunding(s);
    expect(funding.yieldReceived).toBe(parseEther("23"));
    expect(funding.donations).toBe(parseEther("4"));
    expect(funding.vault).toBe(parseEther("6"));
    expect(funding.auctions).toBe(parseEther("21"));
    expect(funding.rounds).toBe(3);
    expect(funding.vaultPercent).toBeCloseTo(22.22);
  });
  it("shows all funding in the vault before the first auction and no split without receipts", () => {
    const c = client(); c.setScenario("waiting");
    const s = c.getSnapshot();
    expect(recoveryFunding(s).vaultPercent).toBe(100);
    expect(recoveryFunding(s).rounds).toBe(0);
    expect(s.auctionHistory).toEqual([]);
    s.funding = s.funding.map(flow => ({ ...flow, at: s.now - 31 * 86400 }));
    expect(recoveryFunding(s).vaultPercent).toBeNull();
    s.funding[0].at = s.now + 1;
    expect(recoveryFunding(s).total).toBe(0n);
  });
  it("tracks claim principal exited rather than WETH received", async () => {
    const c = client(); c.setScenario("limited");
    const s = c.getSnapshot(), q = exitOffer(s, "complete").quote!;
    expect(exitedClaims(s)?.fraction).toBe(.2);
    await c.prepareApprove(q.shares)();
    await c.prepareTake(q.weth, q.shares, s.auction.kickedAt)();
    expect(exitedClaims(c.getSnapshot())?.exited).toBe(parseEther("250") + q.fullClaimEth);
    await c.prepareRedeem()();
    const completed = exitedClaims(c.getSnapshot())!;
    expect(completed.exited).toBeGreaterThanOrEqual(parseEther("260") - 2n);
    expect(completed.exited).toBeLessThanOrEqual(parseEther("260"));
    expect(completed.total).toBe(parseEther("1250"));
    expect(completed.exited - parseEther("250")).not.toBe(c.getSnapshot().walletWeth);
  });
});
