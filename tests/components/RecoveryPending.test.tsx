import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEther, type Hash } from "viem";
import { RecoveryDashboard, type RecoveryController } from "@/app/yeth/RecoveryPreviewClient";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import type { RecoveryPending } from "@/lib/clients/yeth/recovery/pending";

const proposal = ("0x" + "11".repeat(32)) as Hash;
const execution = ("0x" + "22".repeat(32)) as Hash;
const pending: RecoveryPending = {
  version: 1, id: "proposal", account: "0x1111111111111111111111111111111111111111",
  chainId: 1, connectorId: "safe", kind: "safe", action: "take", status: "awaiting-execution",
  submissionHash: proposal, createdAt: 1800000000, submittedBlock: "100", maxShares: "100",
  requestedWeth: "100", exitMode: "complete",
};
function controller(): RecoveryController {
  return {
    snapshot: new MockRecoveryPreviewClient().getSnapshot(),
    error: null, refresh: vi.fn(), approve: vi.fn(), take: vi.fn(), redeem: vi.fn(),
    tx: { state: { status: "pending", hash: proposal }, reset: vi.fn() } as unknown as RecoveryController["tx"],
    pendingExecution: pending, refreshPending: vi.fn().mockResolvedValue(null),
  };
}
afterEach(cleanup);
describe("pending recovery execution", () => {
  it("keeps proposal status available when the statistics feed is unavailable", () => {
    const c = controller();
    c.snapshot = null;
    c.error = "Statistics are unavailable";
    render(<RecoveryDashboard controller={c} mode="live" />);
    expect(screen.getByTestId("recovery-safe-pending")).toBeVisible();
    expect(screen.getByRole("button", { name: "Check Safe execution" })).toBeEnabled();
    expect(c.take).not.toHaveBeenCalled();
  });

  it("does not invent a payout or Ethereum receipt from a consumed proposal nonce", () => {
    const c = controller();
    c.pendingExecution = null;
    c.completion = { action: "take", status: "nonce-consumed", exitMode: "complete", intent: { kind: "safe" } };
    c.tx = { ...c.tx, state: { status: "pending" } };
    render(<RecoveryDashboard controller={c} mode="live" />);
    expect(screen.getByText(/This Safe proposal can no longer execute/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue remaining redemption" })).not.toBeInTheDocument();
    expect(document.querySelector('a[href*="/tx/"]')).toBeNull();
    expect(screen.queryByText("Transaction confirmed on Ethereum.")).not.toBeInTheDocument();
  });


  it("does not link a Safe proposal as an Ethereum transaction or permit duplicate exits", async () => {
    const c = controller();
    render(<RecoveryDashboard controller={c} mode="live" />);
    expect(screen.getByTestId("recovery-safe-pending")).toBeVisible();
    expect(screen.getByRole("button", { name: /Exit via auction/ })).toBeDisabled();
    expect(document.querySelector('a[href*="' + proposal + '"]')).toBeNull();
    expect(screen.queryByText("Transaction confirmed on Ethereum.")).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check Safe execution" })); });
    expect(c.refreshPending).toHaveBeenCalledWith();
    expect(c.take).not.toHaveBeenCalled();
    expect(c.redeem).not.toHaveBeenCalled();
  });

  it("restores a completed auction with a separate unchecked remaining-redemption review", async () => {
    const c = controller();
    c.pendingExecution = null;
    c.completion = {
      action: "take", status: "confirmed", exitMode: "complete", hash: execution,
      receipt: { hash: execution, blockNumber: 101n, wethReceived: parseEther("5"), sharesSpent: parseEther("4"), remainingShares: c.snapshot!.shares },
    };
    c.tx = { ...c.tx, state: { status: "idle" } };
    render(<RecoveryDashboard controller={c} mode="live" />);
    expect(screen.getByText("Auction complete. Finish your exit.")).toBeVisible();
    expect(c.redeem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue remaining redemption" }));
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Redeem shares" })).toBeDisabled();
    expect(document.querySelector('a[href*="' + execution + '"]')).not.toBeNull();
  });

  it("does not turn auction-only completion or a failed execution into a full exit", () => {
    const c = controller();
    c.pendingExecution = null;
    c.completion = { action: "take", status: "failed", exitMode: "complete", hash: execution };
    c.tx = { ...c.tx, state: { status: "success", hash: execution } };
    const view = render(<RecoveryDashboard controller={c} mode="live" />);
    expect(screen.getByRole("alert")).toHaveTextContent("executed but failed");
    expect(screen.queryByRole("button", { name: "Continue remaining redemption" })).not.toBeInTheDocument();
    expect(screen.queryByText("Transaction confirmed on Ethereum.")).not.toBeInTheDocument();
    c.completion = { ...c.completion, status: "confirmed", exitMode: "auction" };
    view.rerender(<RecoveryDashboard controller={c} mode="live" />);
    expect(screen.queryByRole("button", { name: "Continue remaining redemption" })).not.toBeInTheDocument();
  });
});
