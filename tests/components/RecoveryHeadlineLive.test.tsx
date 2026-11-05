import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { RecoveryHeadline } from "@/app/yeth/components/RecoveryProgress";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import type { RecoverySnapshot } from "@/lib/clients/yeth/recovery/types";

afterEach(cleanup);
function position(principalKnown: boolean): RecoverySnapshot {
  const s = new MockRecoveryPreviewClient().getSnapshot();
  return { ...s, walletWeth: parseEther("999"), originalClaimEth: principalKnown ? parseEther("10") : 0n,
    live: {
      principalKnown, principalUnavailableReason: null, accountingComplete: true,
      historyCurrent: true, feedFresh: true, chainFresh: true, baselineKnown: true,
      chainAsOf: s.now, feedAsOf: s.now, indexedAt: s.now,
      directAssets: parseEther("4.85"), maxRedeem: s.shares,
      targetAssetsPerShare: parseEther("2"), dailyAssetsPerShareGrowth: 100000000000n,
      publicReferenceRecovery: 0.485, measuredPerformance: [], ppsHistory: [],
      fundingTotals: null, holderDataCurrent: true, programmeCurrent: true,
      producerVersion: "0.10.0", auctionHistoryCurrent: true,
    },
  };
}
describe("live recovery headline", () => {
  it("never counts unrelated wallet WETH as recovered principal", () => {
    render(<RecoveryHeadline snapshot={position(true)} />);
    expect(screen.getByTestId("recovery-headline")).toHaveTextContent("48.5%");
    expect(screen.getByText("Claim represented by your shares")).toBeVisible();
    expect(screen.queryByText("Received in this simulation")).not.toBeInTheDocument();
    expect(screen.queryByText(/999/)).not.toBeInTheDocument();
  });
  it("leads with the actual exit amount when personal principal is unverified", () => {
    render(<RecoveryHeadline snapshot={position(false)} />);
    expect(screen.getByText("Current exit value")).toBeVisible();
    expect(screen.getByTestId("recovery-headline")).toHaveTextContent("4.850WETH");
    expect(screen.getByTestId("recovery-headline")).not.toHaveTextContent("%");
  });
  it("does not invent a recovery start when the producer has no baseline", () => {
    const s = position(false);
    s.live!.baselineKnown = false;
    render(<RecoveryHeadline snapshot={s} />);
    expect(screen.queryByTestId("recovery-timeline")).not.toBeInTheDocument();
    expect(screen.getByText("The recovery baseline is not available yet.")).toBeVisible();
  });
  it("does not call the whole position available when redemption is limited", () => {
    const s = position(true);
    s.live!.maxRedeem = 0n;
    render(<RecoveryHeadline snapshot={s} />);
    expect(screen.getByText("Current share value")).toBeVisible();
    expect(screen.queryByText("Available to withdraw")).not.toBeInTheDocument();
  });
});
