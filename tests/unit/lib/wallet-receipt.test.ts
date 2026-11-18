import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Hash, type PublicClient } from "viem";
import { resolveWalletReceipt, type WalletSubmission } from "@/lib/tx/wallet-receipt";
const account = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const proposal = ("0x" + "a".repeat(64)) as Hash;
const execution = ("0x" + "b".repeat(64)) as Hash;
const blockHash = ("0x" + "c".repeat(64)) as Hash;
const abi = parseAbi(["event ExecutionSuccess(bytes32 txHash,uint256 payment)"]);
function event() {
  return {
    address: account, transactionHash: execution, blockHash, blockNumber: 101n,
    topics: encodeEventTopics({ abi, eventName: "ExecutionSuccess" }),
    data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [proposal, 0n]),
  };
}
function fixture() {
  const receipt = {
    status: "success", transactionHash: execution, blockNumber: 101n, blockHash,
    from: other, logs: [event()],
  };
  const rpc = {
    getChainId: vi.fn().mockResolvedValue(1),
    getTransactionReceipt: vi.fn().mockResolvedValue(receipt),
    getBlock: vi.fn().mockResolvedValue({ number: 101n, hash: blockHash }),
  };
  const submission: WalletSubmission = { account, chainId: 1, kind: "safe", submissionHash: proposal, submittedBlock: "100" };
  return { rpc, receipt, submission, client: rpc as unknown as PublicClient };
}
describe("shared canonical wallet receipt proof", () => {
  it("verifies an explicit execution hash without a connected provider", async () => {
    const f = fixture();
    await expect(resolveWalletReceipt(f.client, f.submission, undefined, execution)).resolves.toMatchObject({
      status: "mined", failed: false, nonceConsumed: true, safeExecution: { safe: account, proposalHash: proposal },
    });
  });
  it("distinguishes a Safe wallet's actual Ethereum hash from a proposal hash", async () => {
    const f = fixture();
    await expect(resolveWalletReceipt(f.client, {
      ...f.submission, hashKind: "unknown", submissionHash: execution,
    })).resolves.toMatchObject({ status: "mined", safeExecution: { safe: account, proposalHash: proposal } });
  });
  it("never reinterprets an explicit proposal ID as a different proposal's execution", async () => {
    const f = fixture();
    await expect(resolveWalletReceipt(f.client, {
      ...f.submission, submissionHash: execution, hashKind: "safe-proposal",
    }, undefined, execution)).resolves.toMatchObject({ status: "pending" });
  });
  it("keeps a missing public candidate pending", async () => {
    const f = fixture();
    f.rpc.getTransactionReceipt.mockRejectedValue(Object.assign(new Error(), { name: "TransactionReceiptNotFoundError" }));
    await expect(resolveWalletReceipt(f.client, f.submission, undefined, execution)).resolves.toEqual({
      status: "pending", transactionHash: execution,
    });
  });
  it("keeps an outer reverted attempt pending even when its returned logs claim success", async () => {
    const f = fixture();
    f.receipt.status = "reverted";
    await expect(resolveWalletReceipt(f.client, f.submission, undefined, execution)).resolves.toMatchObject({ status: "pending" });
  });
  it("rejects duplicate exact-Safe proposal events", async () => {
    const f = fixture();
    f.receipt.logs.push(event());
    await expect(resolveWalletReceipt(f.client, f.submission, undefined, execution)).rejects.toThrow("conflicting Safe");
  });
  it.each(["transactionHash", "blockHash", "blockNumber"] as const)("rejects contradictory log %s", async field => {
    const f = fixture();
    const log = f.receipt.logs[0];
    if (field === "blockNumber") log.blockNumber = 102n;
    else log[field] = proposal;
    await expect(resolveWalletReceipt(f.client, f.submission, undefined, execution)).rejects.toThrow("canonical receipt");
  });
  it("rechecks the public chain after fetching the receipt", async () => {
    const f = fixture();
    f.rpc.getChainId.mockResolvedValueOnce(1).mockResolvedValueOnce(10);
    await expect(resolveWalletReceipt(f.client, f.submission, undefined, execution)).rejects.toThrow("network changed");
  });
  it("verifies actual Safe execution hashes from legacy unclassified wallet records", async () => {
    const f = fixture();
    await expect(resolveWalletReceipt(f.client, {
      ...f.submission, kind: "transaction", submissionHash: execution,
    })).resolves.toMatchObject({ status: "mined", safeExecution: { safe: account, proposalHash: proposal } });
  });
  it("does not consume a direct wallet submission using another sender's receipt", async () => {
    const f = fixture();
    f.receipt.logs = [];
    await expect(resolveWalletReceipt(f.client, {
      ...f.submission, kind: "transaction", submissionHash: execution,
    })).resolves.toMatchObject({ status: "pending" });
  });
  it("keeps an ordinary unmined hash pending without querying wallet-only status", async () => {
    const f = fixture();
    f.rpc.getTransactionReceipt.mockRejectedValue(Object.assign(new Error(), { name: "TransactionReceiptNotFoundError" }));
    const provider = { request: vi.fn() };
    await expect(resolveWalletReceipt(f.client, {
      ...f.submission, kind: "transaction", hashKind: "transaction", submissionHash: execution,
    }, provider)).resolves.toEqual({ status: "pending" });
    expect(provider.request).not.toHaveBeenCalled();
  });
  it("uses unsupported wallet status as a hint fallback, never proof of cancellation", async () => {
    const f = fixture();
    const provider = { request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "wallet_getCallsStatus") throw Object.assign(new Error(), { code: 4200 });
      return null;
    }) };
    await expect(resolveWalletReceipt(f.client, f.submission, provider)).resolves.toMatchObject({
      status: "pending", error: expect.stringContaining("execution transaction hash"),
    });
    expect(f.rpc.getTransactionReceipt).not.toHaveBeenCalled();
  });
});
