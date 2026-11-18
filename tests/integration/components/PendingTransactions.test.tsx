import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingTransactions } from "@/components/PendingTransactions";
import { getTrackedSubmissions, trackedSubmissionKey, type TrackedSubmission } from "@/lib/tx/pending-transactions";

const mocks = vi.hoisted(() => ({
  account: {} as { address?: `0x${string}`; chainId?: number },
  check: vi.fn(), cancel: vi.fn(), reconcile: vi.fn(), send: vi.fn(),
}));
vi.mock("wagmi", () => ({ useAccount: () => mocks.account }));
vi.mock("@/lib/tx/tracked-write", () => ({
  checkTrackedSubmission: mocks.check,
  checkTrackedCancellation: mocks.cancel,
  reconcileTrackedSubmission: mocks.reconcile,
  trackedContractWrite: mocks.send,
}));
const account = `0x${"11".repeat(20)}` as const;
const otherAccount = `0x${"22".repeat(20)}` as const;
const proposal = `0x${"33".repeat(32)}` as const;
const executionHash = `0x${"44".repeat(32)}` as const;
const otherExecutionHash = `0x${"55".repeat(32)}` as const;
const record: TrackedSubmission = {
  version: 1, id: "11111111-1111-4111-8111-111111111111", account, chainId: 1,
  connectorId: "safe", kind: "safe", hashKind: "safe-proposal", label: "Stake YFI",
  createdAt: 100, submittedBlock: "100", to: otherAccount, data: "0x1234", value: "0",
  status: "pending", submissionHash: proposal,
};
function save(records: TrackedSubmission[], owner = account as string, chainId = 1) {
  localStorage.setItem(trackedSubmissionKey(chainId, owner), JSON.stringify(records));
  window.dispatchEvent(new StorageEvent("storage", { key: trackedSubmissionKey(chainId, owner) }));
}
function remove(value: TrackedSubmission) {
  save(getTrackedSubmissions(value.chainId, value.account).filter(item => item.id !== value.id), value.account, value.chainId);
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const view = render(<QueryClientProvider client={client}><PendingTransactions /></QueryClientProvider>);
  return { ...view, invalidate, rerenderPanel: () => view.rerender(<QueryClientProvider client={client}><PendingTransactions /></QueryClientProvider>) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  getTrackedSubmissions(1, account);
  getTrackedSubmissions(1, otherAccount);
  getTrackedSubmissions(10, account);
  mocks.account = { address: account, chainId: 1 };
  mocks.check.mockResolvedValue({ status: "pending" });
  mocks.cancel.mockResolvedValue(false);
});

describe("pending wallet transaction panel", () => {
  it("restores a stored proposal after remount without checking or sending it", () => {
    save([record]);
    const first = mount();
    expect(screen.getByText(`Safe proposal: ${proposal}`)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    first.unmount();
    mount();
    expect(screen.getByRole("heading", { name: "Pending wallet transactions" })).toBeInTheDocument();
    expect(screen.getByText(record.label)).toBeInTheDocument();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(["account", "network", "disconnect"] as const)("shows only the current wallet scope after %s changes", change => {
    save([record]);
    const view = mount();
    if (change === "account") mocks.account.address = otherAccount;
    if (change === "network") mocks.account.chainId = 10;
    if (change === "disconnect") mocks.account = {};
    view.rerenderPanel();
    expect(screen.queryByRole("region", { name: "Wallet transaction status" })).not.toBeInTheDocument();
    mocks.account = { address: account, chainId: 1 };
    view.rerenderPanel();
    expect(screen.getByText(record.label)).toBeInTheDocument();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps pending proposals unlinked and disables competing checks while waiting", async () => {
    save([record]);
    const check = deferred<{ status: "pending" }>();
    mocks.check.mockReturnValue(check.promise);
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Check execution" }));
    expect(screen.getByRole("button", { name: "Check execution" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check replaced or cancelled proposal" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Check execution" }));
    await act(async () => check.resolve({ status: "pending" }));
    expect(screen.getByRole("status")).toHaveTextContent("Execution is still pending");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(mocks.check).toHaveBeenCalledExactlyOnceWith(record, undefined, undefined);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(view.invalidate).not.toHaveBeenCalled();
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
  });

  it.each(["confirmed", "failed"] as const)("shows the canonical %s execution instead of the proposal hash", async status => {
    save([record]);
    mocks.check.mockImplementation(async () => { remove(record); return { status, hash: executionHash }; });
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Check execution" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(`Stake YFI: execution ${status}.`));
    expect(screen.getByRole("link", { name: "View execution" })).toHaveAttribute("href", `https://etherscan.io/tx/${executionHash}`);
    expect(screen.queryByText(`Safe proposal: ${proposal}`)).not.toBeInTheDocument();
    expect(view.invalidate).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("hides a late result after the wallet account changes", async () => {
    save([record]);
    const checked = deferred<{ status: "confirmed"; hash: typeof executionHash }>();
    mocks.check.mockImplementation(async () => { const result = await checked.promise; remove(record); return result; });
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Check execution" }));
    mocks.account.address = otherAccount;
    view.rerenderPanel();
    await act(async () => checked.resolve({ status: "confirmed", hash: executionHash }));
    expect(screen.queryByRole("region", { name: "Wallet transaction status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    mocks.account.address = account;
    view.rerenderPanel();
    expect(screen.getByRole("status")).toHaveTextContent("Stake YFI: execution confirmed.");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps a proposal until nonce consumption is proved and then reports a neutral result", async () => {
    save([record]);
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Check replaced or cancelled proposal" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("The proposal can still execute"));
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
    expect(view.invalidate).not.toHaveBeenCalled();
    mocks.cancel.mockImplementation(async () => { remove(record); return true; });
    fireEvent.click(screen.getByRole("button", { name: "Check replaced or cancelled proposal" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("its action outcome was not verified"));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/execution confirmed/)).not.toBeInTheDocument();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(view.invalidate).toHaveBeenCalledOnce();
  });

  it("requires a fresh queue acknowledgment before neutral missing-hash reconciliation", async () => {
    const uncertain = { ...record, submissionHash: undefined, status: "attention" as const };
    save([uncertain]);
    mocks.check.mockResolvedValue({ status: "reconciliation-required", hash: executionHash });
    mocks.reconcile.mockImplementation(async () => { remove(uncertain); return executionHash; });
    const view = mount();
    fireEvent.click(screen.getByText("Recover wallet identifiers"));
    fireEvent.change(screen.getByLabelText("Wallet submission hash"), { target: { value: proposal } });
    fireEvent.change(screen.getByLabelText("Execution transaction hash (optional)"), { target: { value: executionHash } });
    fireEvent.click(screen.getByRole("button", { name: "Check execution" }));
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeInTheDocument());
    const finish = screen.getByRole("button", { name: "Finish queue reconciliation" });
    expect(finish).toBeDisabled();
    fireEvent.click(finish);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.check).toHaveBeenCalledWith(uncertain, executionHash, proposal);
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(finish).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Execution transaction hash (optional)"), { target: { value: otherExecutionHash } });
    expect(screen.queryByRole("button", { name: "Finish queue reconciliation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check execution" }));
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(screen.getByRole("button", { name: "Finish queue reconciliation" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Finish queue reconciliation" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("the original submission outcome remains unknown"));
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(uncertain, proposal, otherExecutionHash, true);
    expect(screen.queryByText(/execution confirmed/)).not.toBeInTheDocument();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(view.invalidate).toHaveBeenCalledOnce();
  });

  it("requires explicit queue review to clear an unidentified submission without claiming success", async () => {
    const uncertain = { ...record, submissionHash: undefined, status: "attention" as const };
    save([uncertain]);
    mocks.reconcile.mockImplementation(async () => { remove(uncertain); return undefined; });
    const view = mount();
    fireEvent.click(screen.getByText("Review original call"));
    expect(screen.getByText(record.to)).toBeInTheDocument();
    expect(screen.getByText(record.value)).toBeInTheDocument();
    expect(screen.getByText(record.data)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish queue reconciliation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review uncertain submission" }));
    expect(screen.getByText(/It does not cancel a wallet proposal/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    const finish = screen.getByRole("button", { name: "Finish queue reconciliation" });
    expect(finish).toBeDisabled();
    fireEvent.click(finish);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(finish);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("The original submission outcome remains unknown. The local retry block was removed."));
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(uncertain, undefined, undefined, true);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/execution confirmed|matching execution was verified/i)).not.toBeInTheDocument();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(view.invalidate).toHaveBeenCalledOnce();
  });

  it("keeps a failed status check available for retry without sending again", async () => {
    save([record]);
    mocks.check.mockRejectedValue(new Error("The execution block changed. Check again."));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Check execution" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("The execution block changed"));
    expect(screen.getByRole("button", { name: "Check execution" })).toBeEnabled();
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
