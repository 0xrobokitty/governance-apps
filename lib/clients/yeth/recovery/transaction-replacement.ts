import {
  keccak256, parseTransaction, recoverTransactionAddress, serializeTransaction,
  type Hash, type Hex, type PublicClient, type Transaction, type TransactionReceipt,
  type TransactionSerializable, type TransactionSerialized,
} from "viem";
import type { RecoveryPending } from "./pending";

export type RecoveryReplacementResolution = {
  status: "same-call" | "nonce-consumed";
  receipt: TransactionReceipt;
};
const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
export const isRecoverySignedTransaction = (value: unknown): value is Hex =>
  typeof value === "string" && value.length <= 262146 && /^0x(?:[0-9a-fA-F]{2})+$/.test(value);
const supportedTypes = new Set(["legacy", "eip2930", "eip1559", "eip4844", "eip7702"]);

async function verifyOriginal(pending: RecoveryPending, signedTransaction: Hex) {
  if (pending.kind !== "transaction" || !pending.submissionHash || pending.corrupt ||
      !isRecoverySignedTransaction(signedTransaction) ||
      !same(keccak256(signedTransaction), pending.submissionHash)) {
    throw new Error("The original signed transaction does not match this submission.");
  }
  const serialized = signedTransaction as TransactionSerialized;
  const original = parseTransaction(serialized);
  const sender = await recoverTransactionAddress({ serializedTransaction: serialized });
  if (!same(sender, pending.account) ||
      (original.chainId !== undefined && original.chainId !== pending.chainId) ||
      !Number.isSafeInteger(original.nonce ?? 0)) {
    throw new Error("The original signed transaction does not match this account and network.");
  }
  return original;
}

/** Persist signed bytes, not unchecked nonce/call fields. Reloads verify the hash
 * and signer again, even if the replaced transaction has left the RPC mempool. */
export async function captureRecoveryTransaction(transaction: Transaction, pending: RecoveryPending): Promise<Hex> {
  if (!supportedTypes.has(transaction.type) || !pending.submissionHash || !same(transaction.hash, pending.submissionHash)) {
    throw new Error("The wallet did not return the original Ethereum transaction.");
  }
  const signedTransaction = serializeTransaction({
    ...transaction, data: transaction.input, to: transaction.to ?? undefined,
  } as TransactionSerializable, { r: transaction.r, s: transaction.s, v: transaction.v, yParity: transaction.yParity });
  await verifyOriginal(pending, signedTransaction);
  return signedTransaction;
}

/**
 * A canonical transaction with the original signer and nonce consumes that
 * submission even when its call reverts. The replacement is only a candidate
 * hash; never trust a wallet's replacement reason, receipt, or stored nonce.
 * Same-call results still require the recovery token event checks before success.
 */
export async function resolveRecoveryReplacement(
  client: PublicClient,
  pending: RecoveryPending,
  originalSignedTransaction: Hex,
  replacementHash: Hash,
): Promise<RecoveryReplacementResolution> {
  if (await client.getChainId() !== pending.chainId) throw new Error("The RPC network changed. The replacement was not verified.");
  const original = await verifyOriginal(pending, originalSignedTransaction);
  if (!/^0x[0-9a-fA-F]{64}$/.test(replacementHash) || same(replacementHash, pending.submissionHash!)) {
    throw new Error("The replacement hash must identify a different transaction.");
  }
  const [transaction, receipt] = await Promise.all([
    client.getTransaction({ hash: replacementHash }),
    client.getTransactionReceipt({ hash: replacementHash }),
  ]);
  if (!same(transaction.hash, replacementHash) || !same(receipt.transactionHash, replacementHash) ||
      !same(transaction.from, pending.account) || !same(receipt.from, pending.account) ||
      transaction.nonce !== (original.nonce ?? 0) ||
      transaction.blockNumber !== receipt.blockNumber || !transaction.blockHash ||
      !same(transaction.blockHash, receipt.blockHash) || receipt.blockNumber < BigInt(pending.submittedBlock)) {
    throw new Error("The mined transaction does not prove replacement of this submission.");
  }
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (!block.hash || !same(block.hash, receipt.blockHash) || await client.getChainId() !== pending.chainId) {
    throw new Error("The replacement block changed. Check the transaction again.");
  }
  const sameTo = original.to ? transaction.to !== null && same(original.to, transaction.to) : transaction.to === null;
  const sameCall = sameTo && same(original.data ?? "0x", transaction.input) && (original.value ?? 0n) === transaction.value;
  return { status: sameCall ? "same-call" : "nonce-consumed", receipt };
}

export type RecoveryTransactionNonceProof = {
  nonce: bigint; currentNonce: bigint; blockNumber: bigint; blockHash: Hash;
};

/** Recovery when a replacement hash is unavailable. This proves only that the
 * original can no longer execute. A receipt is still required to claim payout. */
export async function resolveRecoveryTransactionNonce(
  client: PublicClient,
  pending: RecoveryPending,
  originalSignedTransaction: Hex,
): Promise<RecoveryTransactionNonceProof | null> {
  if (await client.getChainId() !== pending.chainId) throw new Error("The RPC network changed. The transaction nonce was not verified.");
  const original = await verifyOriginal(pending, originalSignedTransaction);
  const block = await client.getBlock();
  if (block.number === null || !block.hash || block.number < BigInt(pending.submittedBlock)) {
    throw new Error("The transaction nonce snapshot predates this submission.");
  }
  const count = await client.getTransactionCount({ address: pending.account, blockNumber: block.number });
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("The RPC returned an invalid transaction nonce.");
  const canonical = await client.getBlock({ blockNumber: block.number });
  if (!canonical.hash || !same(canonical.hash, block.hash) || await client.getChainId() !== pending.chainId) {
    throw new Error("The transaction nonce snapshot changed. Check it again.");
  }
  const nonce = BigInt(original.nonce ?? 0);
  const currentNonce = BigInt(count);
  return currentNonce > nonce ? { nonce, currentNonce, blockNumber: block.number, blockHash: block.hash } : null;
}
