import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEther } from "viem";
import { RecoveryAuctionChart } from "@/app/yeth/components/RecoveryAuctionChart";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import { WAD } from "@/lib/clients/yeth/recovery/model";
import type { RecoverySnapshot } from "@/lib/clients/yeth/recovery/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const start = 1_800_000_000;
const snapshot = (): RecoverySnapshot => {
  const s = new MockRecoveryPreviewClient(() => start + 50).getSnapshot();
  return { ...s, connected: false, recoveryRate: parseEther(".25"),
    auction: { kickedAt: start, initialWeth: WAD, remainingWeth: WAD, startingPrice: WAD, minimumPrice: parseEther(".2"), stepDuration: 100, stepDecayBps: 5000, length: 1000 } };
};
describe("auction recovery inspection", () => {
  it("labels reference rates, the current offer, exact dates and a full target scale", () => {
    render(<RecoveryAuctionChart snapshot={snapshot()} />);
    expect(screen.getByTestId("auction-recovery-basis")).toHaveTextContent("Protocol reference");
    expect(screen.getByTestId("auction-current-rate")).toHaveTextContent("25%");
    expect(screen.getByTestId("auction-full-recovery-line")).toBeInTheDocument();
    expect(screen.getByTestId("auction-now-line")).toBeInTheDocument();
    expect(screen.getByTestId("auction-scheduled-line")).toHaveAttribute("stroke-dasharray", "7 6");
    expect(within(screen.getByTestId("auction-milestone-50")).getByRole("button")).toHaveTextContent("In 0m 50s");
    expect(within(screen.getByTestId("auction-milestone-50")).getByRole("button")).toHaveTextContent("08:01:40 UTC");
    expect(screen.getByTestId("auction-milestone-100").querySelector("time")).toHaveAttribute("datetime", new Date((start + 200) * 1000).toISOString());
  });
  it("supports arrow, home, end, escape and milestone inspection", () => {
    render(<RecoveryAuctionChart snapshot={snapshot()} />);
    const slider = screen.getByRole("slider", { name: "Inspect auction recovery" });
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuetext", expect.stringContaining("100%"));
    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    fireEvent.click(within(screen.getByTestId("auction-milestone-50")).getByRole("button"));
    expect(screen.getByTestId("auction-inspection")).toHaveTextContent("50%");
    fireEvent.keyDown(slider, { key: "Escape" });
    expect(screen.getByTestId("auction-inspection")).toHaveTextContent("25%");
  });
  it("supports pointer/touch inspection without requiring hover", () => {
    render(<RecoveryAuctionChart snapshot={snapshot()} />);
    const slider = screen.getByRole("slider");
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 220, width: 600, height: 220, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent(slider, new MouseEvent("pointerdown", { bubbles: true, clientX: 596 }));
    expect(screen.getByTestId("auction-inspection")).toHaveTextContent("100%");
  });
  it("never rounds a below-100% final offer into a full recovery or invents a date", () => {
    const s = snapshot(); s.recoveryRate = parseEther(".4999"); s.auction.minimumPrice = s.recoveryRate;
    render(<RecoveryAuctionChart snapshot={s} />);
    expect(screen.getByTestId("auction-highest-rate")).toHaveTextContent("99.98%");
    const milestone = screen.getByTestId("auction-milestone-100");
    expect(milestone).toHaveTextContent("Not reached this round");
    expect(milestone.querySelector("time")).toBeNull();
  });
  it("does not expose a forecast slider for stale or exhausted offers", () => {
    const s = snapshot();
    const view = render(<RecoveryAuctionChart snapshot={{ ...s, asOf: s.now - 61 }} />);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByText(/schedule is unavailable/)).toBeVisible();
    view.rerender(<RecoveryAuctionChart snapshot={{ ...s, auction: { ...s.auction, remainingWeth: 0n } }} />);
    expect(screen.getByText("No WETH remains in this auction.")).toBeVisible();
  });
});
