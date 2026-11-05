import { afterEach, describe, expect, it, vi } from "vitest";
import type { Custom, GatewayTransactionDetails, MultisigExecutionDetails } from "@safe-global/safe-apps-sdk";
import { zeroAddress, type Hash, type PublicClient } from "viem";
import { resolveSafeCancellation, type SafeProposalMetadataReader } from "@/lib/clients/yeth/recovery/safe-cancellation";
import type { RecoveryPending } from "@/lib/clients/yeth/recovery/pending";

const account = "0x1111111111111111111111111111111111111111";
const destination = "0x2222222222222222222222222222222222222222";
const submissionHash = ("0x" + "12".repeat(32)) as Hash;
const blockHash = ("0x" + "34".repeat(32)) as Hash;
const otherHash = ("0x" + "56".repeat(32)) as Hash;
function pending(): RecoveryPending {
  return {
    version: 1, id: "test-safe-proposal", account, chainId: 1, connectorId: "safe",
    kind: "safe", action: "take", status: "attention", submissionHash,
    createdAt: 1000, submittedBlock: "100", maxShares: "10", requestedWeth: "20",
  };
}
function metadata() {
  return {
    safeInfo: { safeAddress: account, chainId: 1, threshold: 2, owners: [account, destination], isReadOnly: false },
    transaction: {
      safeAddress: account, txId: "multisig_" + account + "_" + submissionHash, txStatus: "CANCELLED",
      txInfo: { type: "Custom", to: { value: destination }, dataSize: "2", value: "7", isCancellation: false },
      txData: { to: { value: destination }, value: "7", hexData: "0x1234", operation: 0, trustedDelegateCallTarget: false },
      detailedExecutionInfo: {
        type: "MULTISIG", submittedAt: 1000, nonce: 4, safeTxGas: "8", baseGas: "9", gasPrice: "10",
        gasToken: zeroAddress, refundReceiver: { value: destination }, safeTxHash: submissionHash,
        signers: [{ value: account }, { value: destination }], confirmationsRequired: 2, confirmations: [], trusted: true, proposer: null, proposedByDelegate: null,
      },
    },
  };
}
function rpc() {
  const getChainId = vi.fn().mockResolvedValue(1);
  const getBlock = vi.fn().mockResolvedValue({ number: 105n, hash: blockHash });
  const readContract = vi.fn().mockImplementation(async ({ functionName }) =>
    functionName === "getTransactionHash" ? submissionHash : 5n);
  return { getChainId, getBlock, readContract };
}
const client = (value: ReturnType<typeof rpc>) => value as unknown as PublicClient;

describe("Safe consumed nonce proof", () => {
  afterEach(() => vi.useRealTimers());

  it("binds every SDK transaction field to the on-chain proposal hash at one canonical block", async () => {
    const calls = rpc();
    const read = vi.fn().mockResolvedValue(metadata());
    const proof = await resolveSafeCancellation(client(calls), pending(), read);
    expect(proof).toEqual({ submissionHash, proposalNonce: 4n, currentNonce: 5n, blockNumber: 105n, blockHash });
    expect(read).toHaveBeenCalledWith(submissionHash);
    expect(calls.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: account, functionName: "getTransactionHash", blockNumber: 105n,
      args: [destination, 7n, "0x1234", 0, 8n, 9n, 10n, zeroAddress, destination, 4n],
    }));
    expect(calls.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: account, functionName: "nonce", blockNumber: 105n,
    }));
    expect(calls.getBlock).toHaveBeenLastCalledWith({ blockNumber: 105n });
    expect(proof).not.toHaveProperty("receipt");
    expect(proof).not.toHaveProperty("failed");
  });


  it("accepts a complete installed-SDK TransactionDetails fixture", async () => {
    const details = metadata();
    const transaction: GatewayTransactionDetails = {
      ...details.transaction,
      txStatus: details.transaction.txStatus as GatewayTransactionDetails["txStatus"],
      txInfo: { ...details.transaction.txInfo, type: "Custom" as Custom["type"] },
      txData: { ...details.transaction.txData, operation: 0 },
      detailedExecutionInfo: {
        ...details.transaction.detailedExecutionInfo, type: "MULTISIG" as MultisigExecutionDetails["type"],
      },
    };
    await expect(resolveSafeCancellation(client(rpc()), pending(), async () => ({ ...details, transaction }))).resolves.toMatchObject({ proposalNonce: 4n });
  });

  it.each([undefined, null])("normalizes absent empty Gateway value/data, while retaining hash verification (%s)", async empty => {
    const details = metadata();
    const transaction = { ...details.transaction, txData: { ...details.transaction.txData, value: empty, hexData: empty } };
    const calls = rpc();
    await resolveSafeCancellation(client(calls), pending(), async () => ({ ...details, transaction }));
    expect(calls.readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "getTransactionHash", args: [destination, 0n, "0x", 0, 8n, 9n, 10n, zeroAddress, destination, 4n],
    }));
    calls.readContract.mockImplementation(async ({ functionName }) => functionName === "getTransactionHash" ? otherHash : 5n);
    await expect(resolveSafeCancellation(client(calls), pending(), async () => ({ ...details, transaction }))).rejects.toThrow("reproduce");
  });

  it.each([3n, 4n])("does not resolve a proposal while current nonce is %s", async nonce => {
    const calls = rpc();
    calls.readContract.mockImplementation(async ({ functionName }) =>
      functionName === "getTransactionHash" ? submissionHash : nonce);
    await expect(resolveSafeCancellation(client(calls), pending(), async () => metadata())).resolves.toBeNull();
  });

  it("rejects an SDK nonce that does not reproduce the submitted Safe hash", async () => {
    const calls = rpc();
    calls.readContract.mockImplementation(async ({ functionName }) =>
      functionName === "getTransactionHash" ? otherHash : 500n);
    await expect(resolveSafeCancellation(client(calls), pending(), async () => metadata())).rejects.toThrow("reproduce");
  });

  it.each(["current-account", "current-chain", "proposal-account", "proposal-hash"] as const)(
    "rejects mismatched %s metadata before any contract read", async mismatch => {
      const details = metadata();
      if (mismatch === "current-account") details.safeInfo.safeAddress = destination;
      if (mismatch === "current-chain") details.safeInfo.chainId = 31337;
      if (mismatch === "proposal-account") details.transaction.safeAddress = destination;
      if (mismatch === "proposal-hash") details.transaction.detailedExecutionInfo.safeTxHash = otherHash;
      const calls = rpc();
      await expect(resolveSafeCancellation(client(calls), pending(), async () => details)).rejects.toThrow("do not match");
      expect(calls.readContract).not.toHaveBeenCalled();
    },
  );

  it.each(["nonce", "gas", "value", "data", "operation", "module", "missing-data"] as const)(
    "rejects malformed or incomplete %s fields", async invalid => {
      const details = metadata();
      if (invalid === "nonce") details.transaction.detailedExecutionInfo.nonce = Number.MAX_SAFE_INTEGER + 1;
      if (invalid === "gas") details.transaction.detailedExecutionInfo.safeTxGas = ((1n << 256n)).toString();
      if (invalid === "value") details.transaction.txData.value = "-1";
      if (invalid === "data") details.transaction.txData.hexData = "0x123";
      if (invalid === "operation") details.transaction.txData.operation = 2;
      if (invalid === "module") details.transaction.detailedExecutionInfo.type = "MODULE";
      if (invalid === "missing-data") delete (details.transaction as { txData?: unknown }).txData;
      const calls = rpc();
      await expect(resolveSafeCancellation(client(calls), pending(), async () => details)).rejects.toThrow();
      expect(calls.readContract).not.toHaveBeenCalled();
    },
  );

  it("rejects a wrong RPC network before requesting metadata", async () => {
    const calls = rpc();
    calls.getChainId.mockResolvedValue(31337);
    const read = vi.fn().mockResolvedValue(metadata());
    await expect(resolveSafeCancellation(client(calls), pending(), read)).rejects.toThrow("network");
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects a snapshot older than the submission", async () => {
    const calls = rpc();
    calls.getBlock.mockResolvedValue({ number: 99n, hash: blockHash });
    await expect(resolveSafeCancellation(client(calls), pending(), async () => metadata())).rejects.toThrow("predates");
    expect(calls.readContract).not.toHaveBeenCalled();
  });

  it.each(["block", "chain"] as const)("rejects a %s change during proof verification", async change => {
    const calls = rpc();
    if (change === "block") calls.getBlock.mockResolvedValueOnce({ number: 105n, hash: blockHash }).mockResolvedValueOnce({ number: 105n, hash: otherHash });
    if (change === "chain") calls.getChainId.mockResolvedValueOnce(1).mockResolvedValueOnce(31337);
    await expect(resolveSafeCancellation(client(calls), pending(), async () => metadata())).rejects.toThrow("snapshot changed");
  });

  it("bounds an unresponsive Safe metadata request without resolving the proposal", async () => {
    vi.useFakeTimers();
    const read: SafeProposalMetadataReader = () => new Promise(() => undefined);
    const result = resolveSafeCancellation(client(rpc()), pending(), read);
    const rejection = expect(result).rejects.toThrow("did not return");
    await vi.advanceTimersByTimeAsync(5001);
    await rejection;
  });

  it.each(["ordinary", "missing-hash", "corrupt"] as const)("does not infer a nonce for %s pending state", async invalid => {
    const record = pending();
    if (invalid === "ordinary") record.kind = "transaction";
    if (invalid === "missing-hash") delete record.submissionHash;
    if (invalid === "corrupt") record.corrupt = true;
    const calls = rpc();
    const read = vi.fn();
    await expect(resolveSafeCancellation(client(calls), record, read)).resolves.toBeNull();
    expect(calls.getChainId).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
