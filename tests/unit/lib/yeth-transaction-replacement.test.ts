import { describe, expect, it, vi } from "vitest";
import { keccak256, parseTransaction, type Address, type Hash, type Hex, type PublicClient, type Transaction, type TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { captureRecoveryTransaction, isRecoverySignedTransaction, resolveRecoveryReplacement, resolveRecoveryTransactionNonce } from "@/lib/clients/yeth/recovery/transaction-replacement";
import type { RecoveryPending } from "@/lib/clients/yeth/recovery/pending";

// Public disposable fixture, never a production wallet.
const signer = privateKeyToAccount(("0x" + "01".padStart(64, "0")) as Hex);
const destination = "0x2222222222222222222222222222222222222222";
const blockHash = ("0x" + "34".repeat(32)) as Hash;
const otherHash = ("0x" + "56".repeat(32)) as Hash;
async function signed(options: { nonce?: number; chainId?: number; to?: Address; data?: Hex; value?: bigint; fee?: bigint; type?: "legacy" | "eip1559" | "eip7702" } = {}) {
  const type = options.type ?? "eip1559";
  const base = { chainId: options.chainId ?? 1, nonce: options.nonce ?? 4, to: options.to ?? destination, data: options.data ?? "0x1234", value: options.value ?? 0n, gas: 100000n };
  const fee = options.fee ?? 10n;
  const raw = type === "legacy"
    ? await signer.signTransaction({ ...base, type, gasPrice: fee })
    : type === "eip7702"
      ? await signer.signTransaction({ ...base, type, maxFeePerGas: fee, maxPriorityFeePerGas: 1n, authorizationList: [await signer.signAuthorization({ address: destination, chainId: base.chainId, nonce: 5 })] })
      : await signer.signTransaction({ ...base, type, maxFeePerGas: fee, maxPriorityFeePerGas: 1n });
  const parsed = parseTransaction(raw);
  const transaction = {
    ...parsed, value: parsed.value ?? 0n, input: parsed.data ?? "0x", to: parsed.to ?? null, from: signer.address,
    hash: keccak256(raw), blockNumber: null, blockHash: null, transactionIndex: null,
  } as Transaction;
  return { raw, transaction };
}
function pending(submissionHash: Hash): RecoveryPending {
  return {
    version: 1, id: "test-transaction", account: signer.address, chainId: 1, connectorId: "injected",
    kind: "transaction", action: "take", status: "mining", submissionHash,
    createdAt: 1000, submittedBlock: "100", maxShares: "10", requestedWeth: "20",
  };
}
function rpc(replacement: Transaction) {
  const transaction = { ...replacement, blockNumber: 105n, blockHash };
  const receipt = { transactionHash: transaction.hash, from: transaction.from, blockNumber: 105n, blockHash, status: "success", logs: [] } as unknown as TransactionReceipt;
  return {
    getChainId: vi.fn().mockResolvedValue(1),
    getBlock: vi.fn().mockResolvedValue({ number: 105n, hash: blockHash }),
    getTransaction: vi.fn().mockResolvedValue(transaction),
    getTransactionReceipt: vi.fn().mockResolvedValue(receipt),
    getTransactionCount: vi.fn().mockResolvedValue(5),
    transaction, receipt,
  };
}
const client = (value: ReturnType<typeof rpc>) => value as unknown as PublicClient;

describe("Ethereum replacement proofs", () => {
  it.each(["legacy", "eip1559", "eip7702"] as const)("captures signed %s bytes bound to the submitted hash and signer", async type => {
    const original = await signed({ type });
    expect(await captureRecoveryTransaction(original.transaction, pending(original.transaction.hash))).toBe(original.raw);
  });

  it("accepts a canonical same-call speed-up only as a candidate for token receipt validation", async () => {
    const original = await signed();
    const replacement = await signed({ fee: 20n });
    const calls = rpc(replacement.transaction);
    const result = await resolveRecoveryReplacement(client(calls), pending(original.transaction.hash), original.raw, replacement.transaction.hash);
    expect(result).toEqual({ status: "same-call", receipt: calls.receipt });
    expect(result).not.toHaveProperty("wethReceived");
    expect(calls.getTransactionReceipt).toHaveBeenCalledWith({ hash: replacement.transaction.hash });
    expect(calls.getBlock).toHaveBeenCalledWith({ blockNumber: 105n });
  });

  it.each(["destination", "data", "value"] as const)("resolves changed %s as neutral nonce-consumed, never payout", async changed => {
    const original = await signed();
    const replacement = await signed({ fee: 20n, ...(changed === "destination" ? { to: signer.address } : changed === "data" ? { data: "0x" as Hex } : { value: 1n }) });
    const calls = rpc(replacement.transaction);
    expect((await resolveRecoveryReplacement(client(calls), pending(original.transaction.hash), original.raw, replacement.transaction.hash)).status).toBe("nonce-consumed");
  });

  it("a reverted replacement still consumes the original nonce", async () => {
    const original = await signed();
    const replacement = await signed({ to: signer.address, data: "0x", fee: 20n });
    const calls = rpc(replacement.transaction);
    calls.receipt.status = "reverted";
    expect((await resolveRecoveryReplacement(client(calls), pending(original.transaction.hash), original.raw, replacement.transaction.hash)).status).toBe("nonce-consumed");
  });

  it.each(["hash", "account", "network", "tampered-bytes"] as const)("rejects untrusted original %s before receipt lookup", async invalid => {
    const original = await signed();
    const replacement = await signed({ fee: 20n });
    const record = pending(original.transaction.hash);
    if (invalid === "hash") record.submissionHash = otherHash;
    if (invalid === "account") record.account = destination;
    if (invalid === "network") record.chainId = 31337;
    const raw = invalid === "tampered-bytes" ? (original.raw.slice(0, -2) + "ff") as Hex : original.raw;
    const calls = rpc(replacement.transaction);
    if (invalid === "network") calls.getChainId.mockResolvedValue(31337);
    await expect(resolveRecoveryReplacement(client(calls), record, raw, replacement.transaction.hash)).rejects.toThrow();
    expect(calls.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it.each(["sender", "nonce", "block", "receipt-hash", "receipt-sender", "old-block"] as const)("rejects mismatched replacement %s", async invalid => {
    const original = await signed();
    const replacement = await signed({ fee: 20n });
    const calls = rpc(replacement.transaction);
    if (invalid === "sender") calls.transaction.from = destination;
    if (invalid === "nonce") calls.transaction.nonce++;
    if (invalid === "block") calls.transaction.blockHash = otherHash;
    if (invalid === "receipt-hash") calls.receipt.transactionHash = otherHash;
    if (invalid === "receipt-sender") calls.receipt.from = destination;
    if (invalid === "old-block") { calls.receipt.blockNumber = 99n; calls.transaction.blockNumber = 99n; }
    await expect(resolveRecoveryReplacement(client(calls), pending(original.transaction.hash), original.raw, replacement.transaction.hash)).rejects.toThrow("does not prove");
  });

  it("rejects canonical block changes", async () => {
    const original = await signed();
    const replacement = await signed({ fee: 20n });
    const calls = rpc(replacement.transaction);
    calls.getBlock.mockResolvedValue({ number: 105n, hash: otherHash });
    await expect(resolveRecoveryReplacement(client(calls), pending(original.transaction.hash), original.raw, replacement.transaction.hash)).rejects.toThrow("block changed");
  });

  it("reconstructs rather than trusts RPC original nonce fields", async () => {
    const original = await signed();
    original.transaction.nonce++;
    await expect(captureRecoveryTransaction(original.transaction, pending(original.transaction.hash))).rejects.toThrow("does not match");
  });

  it("proves a consumed EOA nonce after reload without inventing the unknown replacement outcome", async () => {
    const original = await signed();
    const calls = rpc(original.transaction);
    expect(await resolveRecoveryTransactionNonce(client(calls), pending(original.transaction.hash), original.raw)).toEqual({
      nonce: 4n, currentNonce: 5n, blockNumber: 105n, blockHash,
    });
    expect(calls.getTransactionCount).toHaveBeenCalledWith({ address: signer.address, blockNumber: 105n });
    expect(calls.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it.each([3, 4])("does not release an original whose nonce remains executable at %s", async count => {
    const original = await signed();
    const calls = rpc(original.transaction);
    calls.getTransactionCount.mockResolvedValue(count);
    await expect(resolveRecoveryTransactionNonce(client(calls), pending(original.transaction.hash), original.raw)).resolves.toBeNull();
  });

  it.each(["nonce", "block", "chain"] as const)("rejects an invalid nonce-proof %s", async invalid => {
    const original = await signed();
    const calls = rpc(original.transaction);
    if (invalid === "nonce") calls.getTransactionCount.mockResolvedValue(Number.MAX_SAFE_INTEGER + 1);
    if (invalid === "block") calls.getBlock.mockResolvedValueOnce({ number: 105n, hash: blockHash }).mockResolvedValueOnce({ number: 105n, hash: otherHash });
    if (invalid === "chain") calls.getChainId.mockResolvedValueOnce(1).mockResolvedValueOnce(31337);
    await expect(resolveRecoveryTransactionNonce(client(calls), pending(original.transaction.hash), original.raw)).rejects.toThrow();
  });

  it("bounds saved signed bytes before decoding", () => {
    expect(isRecoverySignedTransaction("0x12")).toBe(true);
    expect(isRecoverySignedTransaction("0x123")).toBe(false);
    expect(isRecoverySignedTransaction("0x" + "ff".repeat(131073))).toBe(false);
    expect(isRecoverySignedTransaction({ nonce: 4 })).toBe(false);
  });
});
