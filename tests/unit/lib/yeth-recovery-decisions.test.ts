import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import { auctionEnd } from "@/lib/clients/yeth/recovery/model";
import { countdown, recoveryChoices, recoveryTarget } from "@/lib/clients/yeth/recovery/decisions";

const create = () => new MockRecoveryPreviewClient(() => 1_800_000_000);
describe("recovery decisions", () => {
  it("separates whole-account recovery from the auction rate on shares sold", () => {
    const client = create();
    const whole = recoveryChoices(client.getSnapshot());
    expect(whole.accountRecovery).toBe(.4845);
    expect(whole.auctionIsBetter).toBe(true);
    expect(whole.coversPosition).toBe(true);
    client.setScenario("limited");
    const part = recoveryChoices(client.getSnapshot());
    expect(part.quote?.weth).toBe(parseEther(".75"));
    expect(part.coversPosition).toBe(false);
    expect(part.positionFraction).toBeLessThan(.12);
    expect(part.auctionAccountRecovery).toBeLessThan(part.offerRecovery);
    expect(part.auctionAccountRecovery).toBeGreaterThan(part.accountRecovery!);
  });
  it.each(["waiting", "empty", "ended", "stale"] as const)("does not feature unavailable auction %s", scenario => {
    const client = create(); client.setScenario(scenario);
    expect(recoveryChoices(client.getSnapshot()).active).toBe(false);
    expect(recoveryChoices(client.getSnapshot()).quote).toBeNull();
  });
  it("does not prefer a worse auction offer", () => {
    const snapshot = create().getSnapshot();
    expect(recoveryChoices({ ...snapshot, vaultPps: parseEther("2") }).auctionIsBetter).toBe(false);
  });
  it("computes targets from a fixed original claim and positive example history", () => {
    const snapshot = create().getSnapshot();
    expect(recoveryTarget(snapshot, 50).years).toBeCloseTo(.2123, 4);
    expect(recoveryTarget(snapshot, 75).years).toBeCloseTo(3.637, 3);
    expect(recoveryTarget(snapshot, 100).years).toBeCloseTo(7.06164, 4);
    expect(recoveryTarget(snapshot, 40).status).toBe("reached");
    expect(recoveryTarget(snapshot, 75).targetEth).toBe(parseEther("7.5"));
    expect(recoveryTarget(snapshot, NaN).status).toBe("unavailable");
  });
  it.each(["flat", "stale", "disconnected", "no-position"] as const)("withholds target ETA for %s", scenario => {
    const client = create(); client.setScenario(scenario);
    expect(recoveryTarget(client.getSnapshot(), 75).years).toBeNull();
  });
  it("preserves completed recovery after redemption without promising future recovery", async () => {
    const client = create();
    await client.prepareRedeem()();
    expect(recoveryChoices(client.getSnapshot()).accountRecovery).toBe(.4845);
    expect(client.getSnapshot().originalClaimEth).toBe(parseEther("10"));
    expect(recoveryTarget(client.getSnapshot(), 75).status).toBe("outside-claim");
    expect(recoveryTarget(client.getSnapshot(), 40).status).toBe("reached");
  });
  it("recognizes the max-exit rounding remainder without discarding shares", async () => {
    const client = create();
    const before = client.getSnapshot();
    const quote = recoveryChoices(before).quote!;
    await client.prepareApprove(quote.shares)();
    await client.prepareTake(quote.weth, quote.shares, before.auction.kickedAt)();
    const after = recoveryChoices(client.getSnapshot());
    expect(client.getSnapshot().shares).toBe(1n);
    expect(after.roundingRemainder).toBe(true);
    expect(after.hasUsablePosition).toBe(false);
    expect(after.quote).toBeNull();
    expect(after.accountRecovery).toBeGreaterThan(.69);
    expect(recoveryChoices({ ...before, shares: 1n }).roundingRemainder).toBe(false);
  });
  it("labels the final countdown as the auction end instead of a promised increase", () => {
    const snapshot = create().getSnapshot();
    const now = auctionEnd(snapshot.auction) - 1;
    const choice = recoveryChoices({ ...snapshot, now, asOf: now });
    expect(choice.active).toBe(true);
    expect(choice.nextEvent).toBe("end");
    expect(choice.nextEventIn).toBe(1);
    expect(recoveryChoices(snapshot).nextEvent).toBe("increase");
  });
  it("formats second-level countdowns and clamps expired clocks", () => {
    expect(countdown(155)).toBe("00:02:35");
    expect(countdown(86401)).toBe("1d 00:00:01");
    expect(countdown(-1)).toBe("00:00:00");
  });
});
