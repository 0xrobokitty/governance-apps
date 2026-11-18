import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionData, parseAbi, type Hash } from "viem";
import { safeExecTransactionAbi } from "@/lib/tx/safe-call";
import { checkTrackedCancellation, checkTrackedSubmission, reconcileTrackedSubmission, trackedContractWrite } from "@/lib/tx/tracked-write";
import { getTrackedSubmissions, PendingSubmissionError, subscribeTrackedCompletions, trackedSubmissionKey } from "@/lib/tx/pending-transactions";

const mocks = vi.hoisted(() => ({ context: vi.fn(), resolve: vi.fn(), cancel: vi.fn(), client: { getBlockNumber: vi.fn(), getTransaction: vi.fn(), getBlock: vi.fn(), getChainId: vi.fn() }, identity: {} as { address?: `0x${string}`; chainId?: number; connector?: { id: string } } }));
vi.mock("wagmi/actions", () => ({ getAccount: () => mocks.identity, getPublicClient: () => mocks.client }));
vi.mock("@/web3/wagmi", () => ({ wagmiConfig: {} }));
vi.mock("@/lib/tx/wallet-context", () => ({ readWalletSubmissionContext: mocks.context }));
vi.mock("@/lib/tx/wallet-receipt", () => ({ resolveWalletReceipt: mocks.resolve }));
vi.mock("@/lib/tx/safe-cancellation", () => ({ resolveSafeCancellation: mocks.cancel }));
const account = `0x${"11".repeat(20)}` as const;
const target = `0x${"22".repeat(20)}` as const;
const proposal = `0x${"33".repeat(32)}` as const;
const execution = `0x${"44".repeat(32)}` as const;
const blockHash = `0x${"55".repeat(32)}` as const;
const zero = `0x${"00".repeat(20)}` as const;
const abi = parseAbi(["function deposit(uint256 amount,address receiver)"]);
const request = { account, chainId: 1, address: target, abi, functionName: "deposit", args: [20n, account] } as const;
const data = encodeFunctionData(request);
const receipt = { transactionHash: execution, blockNumber: 101n, blockHash, status: "success" };
function mined(to = target, innerData = data) {
  mocks.resolve.mockResolvedValue({ status: "mined", receipt, failed: false, nonceConsumed: true, safeExecution: { safe: account, proposalHash: proposal } });
  mocks.client.getTransaction.mockResolvedValue({ hash: execution, from: target, to: account, chainId: 1, value: 0n, blockNumber: 101n, blockHash,
    input: encodeFunctionData({ abi: safeExecTransactionAbi, functionName: "execTransaction", args: [to, 0n, innerData, 0, 0n, 0n, 0n, zero, zero, "0x"] }) });
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  localStorage.clear();
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_key: string, _options: unknown, callback: (lock: object) => unknown) => callback({}) } });
  mocks.identity = { address: account, chainId: 1, connector: { id: "safe" } };
  mocks.context.mockResolvedValue({ account, chainId: 1, connectorId: "safe", kind: "safe", hashKind: "safe-proposal", walletType: "safe-app", safeDetection: "confirmed", provider: { request: vi.fn() }, submittedBlock: "100" });
  mocks.client.getBlockNumber.mockResolvedValue(100n);
  mocks.client.getChainId.mockResolvedValue(1);
  mocks.client.getBlock.mockResolvedValue({ number: 101n, hash: blockHash });
  mocks.resolve.mockResolvedValue({ status: "pending" });
});
async function submit() {
  await trackedContractWrite(request, async () => proposal, "Stake YFI");
  return getTrackedSubmissions(1, account)[0];
}
describe("durable smart-wallet submission", () => {
  it("saves exact call ownership before the wallet runs and keeps a queued proposal", async () => {
    const send = vi.fn(async () => {
      expect(getTrackedSubmissions(1, account)[0]).toMatchObject({ status: "submitting", to: target, data, value: "0" });
      expect(getTrackedSubmissions(1, account)[0].submissionHash).toBeUndefined();
      return proposal;
    });
    await trackedContractWrite(request, send, "Stake YFI");
    const pending = getTrackedSubmissions(1, account)[0];
    expect(pending.submissionHash).toBe(proposal);
    expect(await checkTrackedSubmission(pending)).toEqual({ status: "pending", error: undefined });
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
    await expect(trackedContractWrite(request, send, "Stake YFI")).rejects.toBeInstanceOf(PendingSubmissionError);
    expect(send).toHaveBeenCalledOnce();
  });
  it("retains unknown sends and blocks retry after module reload", async () => {
    const send = vi.fn(async (): Promise<Hash> => { throw new Error("Network request failed"); });
    await expect(trackedContractWrite(request, send, "Stake YFI")).rejects.toBeInstanceOf(PendingSubmissionError);
    expect(getTrackedSubmissions(1, account)[0]).toMatchObject({ status: "attention" });
    vi.resetModules();
    const reloaded = await import("@/lib/tx/tracked-write");
    await expect(reloaded.trackedContractWrite(request, send, "Stake YFI")).rejects.toThrow(/already|confirm whether/);
    expect(send).toHaveBeenCalledOnce();
  });
  it("removes a definite wallet rejection", async () => {
    await expect(trackedContractWrite(request, async () => { throw Object.assign(new Error("User rejected request"), { code: 4001 }); }, "Stake YFI")).rejects.toThrow(/rejected/);
    expect(getTrackedSubmissions(1, account)).toHaveLength(0);
  });
  it.each(["unavailable", "corrupt", "no-locks"])("does not send when coordination is %s", async mode => {
    if (mode === "unavailable") vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); });
    if (mode === "corrupt") localStorage.setItem(trackedSubmissionKey(1, account), "{invalid");
    if (mode === "no-locks") Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    const send = vi.fn(async () => proposal);
    await expect(trackedContractWrite(request, send, "Stake YFI")).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("keeps a returned proposal in memory if storage becomes unavailable after send", async () => {
    await trackedContractWrite(request, async () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
      return proposal;
    }, "Stake YFI");
    expect(getTrackedSubmissions(1, account)[0]).toMatchObject({ submissionHash: proposal, status: "attention" });
  });
  it("keeps a retained hash when another tab appends a pending record", async () => {
    await trackedContractWrite(request, async () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
      return proposal;
    }, "Stake YFI");
    vi.restoreAllMocks();
    const saved = JSON.parse(localStorage.getItem(trackedSubmissionKey(1, account))!);
    localStorage.setItem(trackedSubmissionKey(1, account), JSON.stringify([...saved, { ...saved[0], id: crypto.randomUUID(), data: "0x1234" }]));
    expect(getTrackedSubmissions(1, account)[0].submissionHash).toBe(proposal);
    expect(getTrackedSubmissions(1, account)).toHaveLength(2);
  });
  it("retains ambiguous relay errors containing rejected", async () => {
    await expect(trackedContractWrite(request, async () => { throw new Error("RPC rejected after submission"); }, "Stake YFI")).rejects.toBeInstanceOf(PendingSubmissionError);
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
  });
  it("rejects wallet changes before sending", async () => {
    mocks.identity.address = target;
    const send = vi.fn(async () => proposal);
    await expect(trackedContractWrite(request, send, "Stake YFI")).rejects.toThrow(/wallet changed/);
    expect(send).not.toHaveBeenCalled();
  });
  it("leaves ordinary account writes on the existing receipt path", async () => {
    mocks.context.mockResolvedValue({ account, chainId: 1, walletType: "externally-owned" });
    const send = vi.fn(async () => execution);
    await expect(trackedContractWrite(request, send, "Stake YFI")).resolves.toBe(execution);
    expect(getTrackedSubmissions(1, account)).toHaveLength(0);
  });
});
describe("canonical completion and recovery", () => {
  it("releases only the matching call after canonical success", async () => {
    const pending = await submit();
    mined();
    const completed = vi.fn(); const off = subscribeTrackedCompletions(completed);
    expect(await checkTrackedSubmission(pending)).toEqual({ status: "confirmed", hash: execution });
    expect(completed).toHaveBeenCalledWith({ submission: pending, outcome: "confirmed", hash: execution });
    expect(getTrackedSubmissions(1, account)).toHaveLength(0);
    off();
  });
  it("does not release a proposal for another inner call", async () => {
    const pending = await submit(); mined(account);
    await expect(checkTrackedSubmission(pending)).rejects.toThrow(/differs/);
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
  });
  it("rejects a reorg after transaction validation", async () => {
    const pending = await submit(); mined();
    mocks.client.getBlock.mockResolvedValue({ number: 101n, hash: proposal });
    await expect(checkTrackedSubmission(pending)).rejects.toThrow(/block changed/);
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
  });
  it("retains a retryable outer Safe failure and distinguishes an inner failure", async () => {
    const pending = await submit(); mined();
    mocks.resolve.mockResolvedValueOnce({ status: "mined", receipt, failed: true, nonceConsumed: false });
    expect(await checkTrackedSubmission(pending)).toMatchObject({ status: "pending" });
    mocks.resolve.mockResolvedValueOnce({ status: "mined", receipt, failed: true, nonceConsumed: true, safeExecution: { safe: account, proposalHash: proposal } });
    expect(await checkTrackedSubmission(pending)).toEqual({ status: "failed", hash: execution });
    expect(getTrackedSubmissions(1, account)).toHaveLength(0);
  });
  it("requires explicit queue reconciliation after a missing-hash exact-call match", async () => {
    await expect(trackedContractWrite(request, async () => { throw new Error("Network error"); }, "Stake YFI")).rejects.toThrow();
    const pending = getTrackedSubmissions(1, account)[0];
    mined(account);
    await expect(checkTrackedSubmission(pending, execution, proposal)).rejects.toThrow(/differs/);
    expect(getTrackedSubmissions(1, account)[0].submissionHash).toBeUndefined();
    mined();
    const completed = vi.fn(); const off = subscribeTrackedCompletions(completed);
    expect(await checkTrackedSubmission(pending, execution, proposal)).toEqual({ status: "reconciliation-required", hash: execution });
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
    expect(completed).not.toHaveBeenCalled();
    await expect(reconcileTrackedSubmission(pending, proposal, execution, false)).rejects.toThrow(/queue/);
    expect(await reconcileTrackedSubmission(pending, proposal, execution, true)).toBe(execution);
    expect(completed).toHaveBeenCalledWith({ submission: pending, outcome: "reconciled", hash: execution });
    off();
  });
  it("permits explicit neutral reconciliation when no submission or execution exists", async () => {
    await expect(trackedContractWrite(request, async () => { throw new Error("Lost wallet response"); }, "Stake YFI")).rejects.toThrow();
    const pending = getTrackedSubmissions(1, account)[0];
    const completed = vi.fn(); const off = subscribeTrackedCompletions(completed);
    await expect(reconcileTrackedSubmission(pending, undefined, undefined, false)).rejects.toThrow(/queue/);
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
    await expect(reconcileTrackedSubmission(pending, undefined, undefined, true)).resolves.toBeUndefined();
    expect(completed).toHaveBeenCalledWith({ submission: pending, outcome: "reconciled" });
    expect(mocks.resolve).not.toHaveBeenCalled();
    off();
  });
  it("rechecks the connected wallet inside the reconciliation lock", async () => {
    await expect(trackedContractWrite(request, async () => { throw new Error("Lost wallet response"); }, "Stake YFI")).rejects.toThrow();
    const pending = getTrackedSubmissions(1, account)[0];
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_key: string, _options: unknown, callback: (lock: object) => unknown) => {
      mocks.identity.address = target;
      return callback({});
    } } });
    await expect(reconcileTrackedSubmission(pending, undefined, undefined, true)).rejects.toThrow(/original wallet/);
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
  });
  it("cannot manually clear a proposal whose identity became known", async () => {
    const pending = await submit();
    await expect(reconcileTrackedSubmission(pending, undefined, undefined, true)).rejects.toThrow(/changed/);
    expect(getTrackedSubmissions(1, account)).toHaveLength(1);
  });
  it("retains a late original proposal when manual reconciliation proof becomes stale", async () => {
    await expect(trackedContractWrite(request, async () => { throw new Error("Lost wallet response"); }, "Stake YFI")).rejects.toThrow();
    const pending = getTrackedSubmissions(1, account)[0];
    mined();
    mocks.client.getBlock.mockImplementationOnce(async () => {
      const key = trackedSubmissionKey(1, account);
      const saved = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify([{ ...saved[0], submissionHash: blockHash, status: "pending" }]));
      return { number: 101n, hash: blockHash };
    });
    await expect(reconcileTrackedSubmission(pending, proposal, execution, true)).rejects.toThrow(/changed/);
    expect(getTrackedSubmissions(1, account)[0].submissionHash).toBe(blockHash);
  });
  it("keeps nonce consumption neutral", async () => {
    const pending = await submit();
    mocks.cancel.mockResolvedValue({ submissionHash: proposal });
    const completed = vi.fn(); const off = subscribeTrackedCompletions(completed);
    expect(await checkTrackedCancellation(pending)).toBe(true);
    expect(completed).toHaveBeenCalledWith({ submission: pending, outcome: "nonce-consumed" });
    off();
  });
});
