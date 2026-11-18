import type { Address, Hex, TransactionReceipt, Transaction } from "viem";
import { getPublicClient } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import { isDaoSmartWalletSubmission } from "./wallet-submission";
import type { DaoTransactionCall } from "./writes";
import type { DaoTransactionReceipt } from "./types";
import { resolveWalletReceipt, type WalletSubmission, type WalletReceiptProvider } from "@/lib/tx/wallet-receipt";
import { resolveSafeCancellation } from "@/lib/tx/safe-cancellation";
import { validateSafeMinedCall } from "@/lib/tx/safe-call";

export class DaoTransactionPendingError extends Error {
  readonly code = "DAO_TRANSACTION_PENDING";
  constructor(message = "The wallet proposal is saved and is awaiting verified execution.") { super(message); }
}
export class DaoReconciliationRequiredError extends Error {
  readonly code = "DAO_RECONCILIATION_REQUIRED";
  constructor(readonly transactionHash?: Hex) {
    super("Recovered wallet activity was verified, but it cannot identify the interrupted wallet submission. Check the wallet queue for any duplicate or unresolved proposal, then finish the wallet review explicitly.");
  }
}
export class DaoSafeNonceConsumedError extends Error {
  readonly code = "DAO_SAFE_NONCE_CONSUMED";
  constructor(readonly transactionHash?: Hex) {
    super("The Safe proposal nonce has been used. This does not prove the DAO action succeeded or failed. Check the Safe and proposal history before another action.");
  }
}
export type DaoReceiptOptions = { submission: WalletSubmission; provider?: WalletReceiptProvider; executionHash?: Hex; checkCancellation?: boolean };

export class DaoTransactionRevertedError extends Error {
  readonly code = "DAO_TRANSACTION_REVERTED";
  constructor(readonly transactionHash?: Hex) { super("DAO transaction reverted."); }
}

export class DaoTransactionReplacedError extends Error {
  readonly code = "DAO_TRANSACTION_REPLACED";
  constructor(readonly transactionHash: Hex, readonly reason: "cancelled" | "changed") {
    super(reason === "cancelled" ? "The wallet cancelled this DAO transaction." : "The wallet replaced this DAO transaction with a different call.");
  }
}
export function isDaoTerminalTransactionError(error: unknown): error is DaoTransactionRevertedError | DaoTransactionReplacedError | DaoSafeNonceConsumedError {
  return error instanceof DaoTransactionRevertedError || error instanceof DaoTransactionReplacedError || error instanceof DaoSafeNonceConsumedError;
}

/** Receipt confirmation uses the configured app RPC, with no alternate transport. */
export async function waitForDaoReceipt(hash: Hex, chainId: number, sender: Address, call: DaoTransactionCall, options?: DaoReceiptOptions): Promise<DaoTransactionReceipt> {
  if (chainId !== 1) throw new Error("Unsupported DAO receipt chain.");
  if (call.chainId !== chainId || call.from.toLowerCase() !== sender.toLowerCase()) throw new Error("DAO call differs from the submitted wallet scope.");
  const client = getPublicClient(wagmiConfig, { chainId: 1 });
  if (!client || await client.getChainId() !== chainId) throw new Error("DAO receipt RPC is on the wrong chain.");
  if (options && isDaoSmartWalletSubmission(options.submission)) {
    const submission = options.submission;
    if (submission.account.toLowerCase() !== sender.toLowerCase() || submission.chainId !== chainId) throw new Error("DAO wallet submission scope differs from the reviewed action.");
    const resolution = await resolveWalletReceipt(client, submission, options.provider, options.executionHash);
    if (resolution.status === "pending") {
      if (options.checkCancellation) {
        const consumed = await resolveSafeCancellation(client, submission).catch(() => null);
        if (consumed) throw new DaoSafeNonceConsumedError(submission.submissionHash);
      }
      throw new DaoTransactionPendingError(resolution.error);
    }
    if (!resolution.safeExecution) throw new DaoTransactionPendingError("The receipt does not prove this Safe proposal executed.");
    const receipt = resolution.receipt;
    const [transaction, block] = await Promise.all([
      client.getTransaction({ hash: receipt.transactionHash }),
      client.getBlock({ blockNumber: receipt.blockNumber }),
    ]);
    if (transaction.hash !== receipt.transactionHash || transaction.blockHash !== receipt.blockHash ||
        transaction.blockNumber !== receipt.blockNumber || transaction.from.toLowerCase() !== receipt.from.toLowerCase() || block.hash !== receipt.blockHash) {
      throw new Error("DAO Safe execution or canonical block differs from the receipt.");
    }
    validateSafeMinedCall(transaction, { account: sender, chainId, to: call.to, data: call.data, value: 0n }, resolution.safeExecution);
    if (resolution.failed) throw new DaoTransactionRevertedError(receipt.transactionHash);
    return validateDaoLiveReceipt(receipt, { hash: receipt.transactionHash, sender: transaction.from, blockHash: block.hash, blockTimestamp: Number(block.timestamp) });
  }
  let replacedTransaction: Transaction | undefined;
  const receipt = await client.waitForTransactionReceipt({
    hash, confirmations: 1, timeout: 120_000, checkReplacement: true,
    onReplaced: replacement => { replacedTransaction = replacement.replacedTransaction; },
  });
  const [transaction, block] = await Promise.all([
    client.getTransaction({ hash: receipt.transactionHash }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
  ]);
  if (receipt.from.toLowerCase() !== sender.toLowerCase() || receipt.blockHash !== block.hash ||
      transaction.hash !== receipt.transactionHash || transaction.blockHash !== receipt.blockHash ||
      transaction.blockNumber !== receipt.blockNumber) throw new Error("DAO mined transaction or canonical block differs from the receipt.");
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
    const original = replacedTransaction ?? await client.getTransaction({ hash });
    if (original.hash.toLowerCase() !== hash.toLowerCase() || original.nonce !== transaction.nonce ||
        original.from.toLowerCase() !== transaction.from.toLowerCase()) throw new Error("DAO replacement does not consume the submitted transaction nonce.");
    validateDaoMinedCall(original, call);
    try { validateDaoMinedCall(transaction, call); } catch {
      throw new DaoTransactionReplacedError(receipt.transactionHash,
        transaction.to?.toLowerCase() === sender.toLowerCase() && transaction.value === 0n && transaction.input === "0x" ? "cancelled" : "changed");
    }
  }
  validateDaoMinedCall(transaction, call);
  return validateDaoLiveReceipt(receipt, { hash: receipt.transactionHash, sender, blockHash: block.hash, blockTimestamp: Number(block.timestamp) });
}

export function validateDaoLiveReceipt(receipt: TransactionReceipt, expected: { hash: Hex; sender: Address; blockHash: Hex; blockTimestamp: number }): DaoTransactionReceipt {
  if (receipt.transactionHash.toLowerCase() !== expected.hash.toLowerCase() ||
      receipt.from.toLowerCase() !== expected.sender.toLowerCase()) throw new Error("DAO receipt transaction or sender differs from the submitted action.");
  if (receipt.blockHash !== expected.blockHash) throw new Error("DAO receipt block is no longer canonical.");
  if (!Number.isSafeInteger(expected.blockTimestamp) || expected.blockTimestamp < 0) throw new Error("Invalid DAO receipt block time.");
  if (receipt.logs.some(log => log.removed || log.blockHash !== receipt.blockHash || log.transactionHash !== receipt.transactionHash)) throw new Error("DAO receipt contains inconsistent logs.");
  if (receipt.status !== "success") throw new DaoTransactionRevertedError(receipt.transactionHash);
  return {
    status: receipt.status, transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash, blockTimestamp: expected.blockTimestamp, transactionIndex: receipt.transactionIndex,
    logs: receipt.logs.map(log => ({ address: log.address, topics: log.topics, data: log.data, logIndex: log.logIndex })),
  };
}

export function validateDaoMinedCall(transaction: Pick<Transaction, "from" | "to" | "input" | "value" | "chainId">, call: DaoTransactionCall) {
  if (transaction.from.toLowerCase() !== call.from.toLowerCase() || transaction.to?.toLowerCase() !== call.to.toLowerCase() ||
      transaction.input.toLowerCase() !== call.data.toLowerCase() || transaction.value !== 0n || transaction.chainId !== call.chainId) {
    throw new Error("Mined DAO transaction differs from the simulated call.");
  }
}
