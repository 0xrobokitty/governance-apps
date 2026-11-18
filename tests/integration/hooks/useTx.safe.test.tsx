import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTx } from "@/lib/tx/useTx";
import { PendingSubmissionError, type TrackedCompletion, type TrackedSubmission } from "@/lib/tx/pending-transactions";

const mocks = vi.hoisted(() => ({
  identity: {} as { account?: string; chainId?: number },
  listeners: new Set<(value: TrackedCompletion) => void>(),
  find: vi.fn(), check: vi.fn(), rpcWait: vi.fn(), wagmiWait: vi.fn(),
  loading: vi.fn(() => "tx"), success: vi.fn(), error: vi.fn(), dismiss: vi.fn(),
}));
vi.mock("@/state/protocol", () => ({ useProtocol: () => ({ publicClient: { waitForTransactionReceipt: mocks.rpcWait } }) }));
vi.mock("wagmi/actions", () => ({ waitForTransactionReceipt: mocks.wagmiWait }));
vi.mock("@/web3/wagmi", () => ({ wagmiConfig: {} }));
vi.mock("@/lib/runtime/features", () => ({ isSimulationTransportFallbackEnabled: () => false }));
vi.mock("@/components/ui/Toast", () => ({ toast: mocks }));
vi.mock("@/lib/tx/tracked-write", () => ({
  checkTrackedSubmission: mocks.check,
  readConnectedIdentity: () => mocks.identity,
}));
vi.mock("@/lib/tx/pending-transactions", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/tx/pending-transactions")>(),
  findTrackedSubmission: mocks.find,
  subscribeTrackedCompletions: (listener: (value: TrackedCompletion) => void) => {
    mocks.listeners.add(listener);
    return () => { mocks.listeners.delete(listener); };
  },
}));

const account = `0x${"11".repeat(20)}` as const;
const otherAccount = `0x${"22".repeat(20)}` as const;
const proposal = `0x${"33".repeat(32)}` as const;
const otherProposal = `0x${"44".repeat(32)}` as const;
const executionHash = `0x${"55".repeat(32)}` as const;
const record: TrackedSubmission = {
  version: 1, id: "11111111-1111-4111-8111-111111111111", account, chainId: 1,
  connectorId: "safe", kind: "safe", hashKind: "safe-proposal", label: "Stake YFI",
  createdAt: 100, submittedBlock: "100", to: otherAccount, data: "0x1234", value: "0",
  status: "pending", submissionHash: proposal,
};
const otherRecord = { ...record, id: "22222222-2222-4222-8222-222222222222", submissionHash: otherProposal, data: "0x5678" as const };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function emit(outcome: TrackedCompletion["outcome"], submission = record, hash?: typeof executionHash) {
  for (const listener of mocks.listeners) listener({ submission, outcome, hash });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.listeners.clear();
  mocks.identity = { account, chainId: 1 };
  mocks.loading.mockReturnValue("tx");
  mocks.find.mockImplementation(hash => hash === proposal ? record : hash === otherProposal ? otherRecord : undefined);
  mocks.check.mockResolvedValue({ status: "pending" });
});

describe("Safe transaction ownership", () => {
  it("keeps a proposal pending without treating its identifier as an execution hash", async () => {
    const send = vi.fn(async () => proposal), onSuccess = vi.fn(), invalidate = vi.fn(), onSubmitted = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(send, { onSuccess, invalidate, onSubmitted }); });
    expect(result.current.state).toMatchObject({ status: "pending", pendingId: record.id, submissionHash: proposal });
    expect(result.current.state.hash).toBeUndefined();
    expect(onSubmitted).toHaveBeenCalledWith(proposal);
    expect(mocks.check).toHaveBeenCalledWith(record);
    expect(send).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(mocks.rpcWait).not.toHaveBeenCalled();
    expect(mocks.wagmiWait).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("applies only the matching completion and uses its canonical execution hash", async () => {
    const send = vi.fn(async () => proposal), onSuccess = vi.fn(), invalidate = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(send, { onSuccess, invalidate }); });
    await act(async () => emit("confirmed", otherRecord, executionHash));
    expect(result.current.state.status).toBe("pending");
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => emit("confirmed", record, executionHash));
    await waitFor(() => expect(result.current.state).toEqual({ status: "success", hash: executionHash }));
    expect(invalidate).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(executionHash);
    expect(send).toHaveBeenCalledOnce();
    expect(mocks.check).toHaveBeenCalledOnce();
  });

  it.each(["account", "network", "reset"] as const)("ignores a late completion after %s changes", async change => {
    const refresh = deferred<void>(), onSuccess = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => proposal, { onSuccess, invalidate: () => refresh.promise }); });
    await act(async () => emit("confirmed", record, executionHash));
    if (change === "account") mocks.identity.account = otherAccount;
    if (change === "network") mocks.identity.chainId = 10;
    if (change === "reset") act(() => result.current.reset());
    await act(async () => refresh.resolve());
    expect(result.current.state.status).toBe(change === "reset" ? "idle" : "pending");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("does not let an old completion overwrite a newer submission while refresh awaits", async () => {
    const refresh = deferred<void>(), firstSuccess = vi.fn(), secondSuccess = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => proposal, { invalidate: () => refresh.promise, onSuccess: firstSuccess }); });
    await act(async () => emit("confirmed", record, executionHash));
    await act(async () => { await result.current.execute(async () => otherProposal, { onSuccess: secondSuccess }); });
    await act(async () => refresh.resolve());
    expect(result.current.state).toMatchObject({ status: "pending", pendingId: otherRecord.id, submissionHash: otherProposal });
    expect(result.current.state.hash).toBeUndefined();
    expect(firstSuccess).not.toHaveBeenCalled();
    expect(secondSuccess).not.toHaveBeenCalled();
    await act(async () => emit("confirmed", otherRecord, executionHash));
    await waitFor(() => expect(secondSuccess).toHaveBeenCalledWith(executionHash));
  });

  it.each([
    ["failed", "revert", /reverted/],
    ["nonce-consumed", "unknown", /outcome was not verified/],
    ["reconciled", "unknown", /outcome remains unknown/],
  ] as const)("reports %s without invoking success", async (outcome, errorType, message) => {
    const onSuccess = vi.fn(), onError = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => proposal, { onSuccess, onError }); });
    await act(async () => emit(outcome, record, outcome === "nonce-consumed" ? undefined : executionHash));
    await waitFor(() => expect(result.current.state).toMatchObject({ status: "error", errorType, errorMessage: expect.stringMatching(message) }));
    expect(onError).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each([undefined, executionHash])("attaches to an uncertain submission and keeps reconciliation neutral with hash %s", async canonicalHash => {
    const uncertain = { ...record, submissionHash: undefined, status: "attention" as const };
    const send = vi.fn(async (): Promise<typeof proposal> => { throw new PendingSubmissionError(uncertain); });
    const onSuccess = vi.fn();
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(send, { onSuccess }); });
    expect(result.current.state).toMatchObject({ status: "pending", pendingId: record.id });
    expect(result.current.state.hash).toBeUndefined();
    expect(result.current.state.submissionHash).toBeUndefined();
    expect(mocks.check).not.toHaveBeenCalled();
    await act(async () => emit("reconciled", uncertain, canonicalHash));
    await waitFor(() => expect(result.current.state.errorMessage).toMatch(/outcome remains unknown/));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });

  it("does not lose a nonce-consumed completion while its initial check is pending", async () => {
    const check = deferred<{ status: "pending" }>(), onSuccess = vi.fn(), onError = vi.fn();
    mocks.check.mockReturnValue(check.promise);
    const { result } = renderHook(useTx);
    let running!: Promise<void>;
    await act(async () => { running = result.current.execute(async () => proposal, { onSuccess, onError }); });
    await act(async () => emit("nonce-consumed"));
    await act(async () => { check.resolve({ status: "pending" }); await running; });
    expect(result.current.state).toMatchObject({ status: "error", errorType: "unknown", errorMessage: expect.stringMatching(/outcome was not verified/) });
    expect(onError).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("handles completion during onSubmitted without restoring a deleted pending record", async () => {
    const submitted = deferred<void>(), onSuccess = vi.fn();
    const { result } = renderHook(useTx);
    let running!: Promise<void>;
    await act(async () => { running = result.current.execute(async () => proposal, { onSubmitted: () => submitted.promise, onSuccess }); });
    await act(async () => emit("confirmed", record, executionHash));
    mocks.check.mockRejectedValue(new Error("This submission is no longer pending."));
    await act(async () => { submitted.resolve(); await running; });
    expect(result.current.state).toEqual({ status: "success", hash: executionHash });
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(executionHash);
  });

  it("does not double-notify when its own receipt check publishes completion", async () => {
    const onSuccess = vi.fn(), invalidate = vi.fn();
    mocks.check.mockImplementation(async () => {
      emit("confirmed", record, executionHash);
      return { status: "confirmed", hash: executionHash };
    });
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => proposal, { onSuccess, invalidate }); });
    expect(result.current.state).toEqual({ status: "success", hash: executionHash });
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(executionHash);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it.each(["pending", "confirmed"] as const)("preserves domain-owned %s receipt tracking", async status => {
    const onSuccess = vi.fn();
    const waitForReceipt = vi.fn(async () => status === "pending" ? { pending: true as const } : executionHash);
    const { result } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => proposal, { tracking: "domain", waitForReceipt, onSuccess }); });
    expect(waitForReceipt).toHaveBeenCalledExactlyOnceWith(proposal);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.rpcWait).not.toHaveBeenCalled();
    if (status === "pending") {
      expect(result.current.state).toEqual({ status: "pending" });
      expect(onSuccess).not.toHaveBeenCalled();
    } else {
      expect(result.current.state).toEqual({ status: "success", hash: executionHash });
      expect(onSuccess).toHaveBeenCalledExactlyOnceWith(executionHash);
    }
  });

  it("does not expose a domain proposal as an Ethereum hash during a check or its error", async () => {
    const receipt = deferred<void>();
    const { result } = renderHook(useTx);
    let running!: Promise<void>;
    await act(async () => { running = result.current.execute(async () => proposal, { tracking: "domain", waitForReceipt: async () => { await receipt.promise; throw new Error("Network request failed"); } }); });
    expect(result.current.state.hash).toBeUndefined();
    expect(result.current.state.submissionHash).toBe(proposal);
    await act(async () => { receipt.resolve(); await running; });
    expect(result.current.state.status).toBe("error");
    expect(result.current.state.hash).toBeUndefined();
    expect(result.current.state.submissionHash).toBe(proposal);
  });
  it("unsubscribes from completions when the hook unmounts", async () => {
    const onSuccess = vi.fn();
    const { result, unmount } = renderHook(useTx);
    await act(async () => { await result.current.execute(async () => proposal, { onSuccess }); });
    unmount();
    expect(mocks.listeners.size).toBe(0);
    await act(async () => emit("confirmed", record, executionHash));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
