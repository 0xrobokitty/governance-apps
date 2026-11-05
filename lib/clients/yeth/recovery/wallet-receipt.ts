import {
  decodeEventLog,
  parseAbi,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { isRecoveryHash, type RecoveryPending } from "./pending";

export type RecoveryWalletProvider = {
  request(request: { method: string; params?: unknown[] }): Promise<unknown>;
};
export type RecoveryReceiptResolution =
  | { status: "pending"; transactionHash?: Hash; error?: string }
  | {
      status: "mined";
      receipt: TransactionReceipt;
      failed: boolean;
      nonceConsumed: boolean;
    };
const safeExecutionAbi = parseAbi([
  "event ExecutionSuccess(bytes32 txHash,uint256 payment)",
  "event ExecutionFailure(bytes32 txHash,uint256 payment)",
]);
const safeIndexedExecutionAbi = parseAbi([
  "event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)",
  "event ExecutionFailure(bytes32 indexed txHash,uint256 payment)",
]);
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const walletReads = new WeakMap<
  RecoveryWalletProvider,
  Map<string, Promise<unknown>>
>();
async function readWalletStatus(
  provider: RecoveryWalletProvider,
  method: string,
  hash: Hash,
) {
  let requests = walletReads.get(provider);
  if (!requests) {
    requests = new Map();
    walletReads.set(provider, requests);
  }
  const key = method + ":" + hash;
  let request = requests.get(key);
  if (!request) {
    if (requests.size >= 8)
      throw new Error(
        "Reconnect the wallet before checking another submission.",
      );
    request = Promise.resolve().then(() =>
      provider.request({ method, params: [hash] }),
    );
    requests.set(key, request);
    void request.finally(() => requests!.delete(key)).catch(() => undefined);
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "The wallet did not answer the execution-status request. Reconnect it and check again.",
              ),
            ),
          5000,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** Wallet responses provide candidate hashes only. Public chain receipts and
 * Safe execution events prove execution; provider receipt logs are never trusted. */
export async function resolveRecoveryReceipt(
  client: PublicClient,
  pending: RecoveryPending,
  provider?: RecoveryWalletProvider,
  verifyExecutionHash?: Hash,
): Promise<RecoveryReceiptResolution> {
  if ((await client.getChainId()) !== pending.chainId)
    throw new Error("The RPC network changed. Execution was not verified.");
  if (pending.corrupt) return { status: "pending", error: pending.error };
  if (!pending.submissionHash)
    return {
      status: "pending",
      error:
        "Submission status is unknown. Recover the transaction or proposal hash from your wallet before continuing.",
    };
  let transactionHash = verifyExecutionHash;
  let requiresSafeProof = pending.kind === "safe";
  if (pending.kind === "safe" && !transactionHash) {
    if (!provider)
      return {
        status: "pending",
        error:
          "Reconnect this Safe through the Safe Apps connector to check its proposal.",
      };
    // Always resolve again: an outer failed attempt can later execute under a new hash.
    const result = await readWalletStatus(
      provider,
      "wallet_getCallsStatus",
      pending.submissionHash,
    );
    if (
      !object(result) ||
      result.id !== pending.submissionHash ||
      result.chainId !== "0x" + pending.chainId.toString(16) ||
      typeof result.status !== "number"
    )
      throw new Error("The wallet returned an invalid Safe proposal status.");
    const hashes = [
      ...new Set(
        (Array.isArray(result.receipts) ? result.receipts : [])
          .map((receipt) =>
            object(receipt) ? receipt.transactionHash : undefined,
          )
          .filter(isRecoveryHash),
      ),
    ];
    if (hashes.length > 1)
      throw new Error("The wallet returned conflicting execution hashes.");
    transactionHash = hashes[0];
    if (!transactionHash)
      return {
        status: "pending",
        error:
          result.status >= 400
            ? "The Safe reports a cancelled or failed proposal, but chain execution is not verified. Check the Safe before taking further action."
            : undefined,
      };
  }
  transactionHash ??= pending.submissionHash;
  let receipt: TransactionReceipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: transactionHash });
  } catch (error) {
    if (!object(error) || error.name !== "TransactionReceiptNotFoundError")
      throw error;
    if (pending.kind === "safe" || verifyExecutionHash || !provider)
      return { status: "pending" };
    // Some Safe WalletConnect providers resolve their proposal identifier through
    // eth_getTransactionReceipt. Extract a hint, then require Safe hash binding.
    const hint = await readWalletStatus(
      provider,
      "eth_getTransactionReceipt",
      pending.submissionHash,
    );
    if (!object(hint)) return { status: "pending" };
    const hashes = [
      ...new Set(
        [
          hint.transactionHash,
          ...(Array.isArray(hint.logs)
            ? hint.logs.map((log) =>
                object(log) ? log.transactionHash : undefined,
              )
            : []),
        ]
          .filter(isRecoveryHash)
          .filter((hash) => !same(hash, pending.submissionHash!)),
      ),
    ];
    if (hashes.length !== 1) return { status: "pending" };
    transactionHash = hashes[0];
    receipt = await client.getTransactionReceipt({ hash: transactionHash });
    requiresSafeProof = true;
  }
  if (
    !same(receipt.transactionHash, transactionHash) ||
    receipt.blockNumber < BigInt(pending.submittedBlock)
  )
    throw new Error("The receipt does not match this submitted transaction.");
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (!block.hash || !same(block.hash, receipt.blockHash))
    throw new Error(
      "The execution block changed. Check the transaction again.",
    );
  if (!requiresSafeProof && same(transactionHash, pending.submissionHash)) {
    if (receipt.status !== "success" && !same(receipt.from, pending.account)) {
      return {
        status: "pending",
        error:
          "This reverted receipt does not prove that this wallet submission was consumed.",
      };
    }
    return {
      status: "mined",
      receipt,
      failed: receipt.status !== "success",
      nonceConsumed:
        typeof receipt.from === "string" && same(receipt.from, pending.account),
    };
  }
  for (const log of receipt.logs) {
    if (log.removed || !same(log.address, pending.account)) continue;
    // Safe releases differ in whether txHash is indexed. Reject extra topics
    // and malformed data instead of letting an ABI decoder ignore them.
    const abi =
      log.topics.length === 2 && log.data.length === 66
        ? safeIndexedExecutionAbi
        : log.topics.length === 1 && log.data.length === 130
          ? safeExecutionAbi
          : null;
    if (!abi) continue;
    try {
      const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (same(event.args.txHash, pending.submissionHash))
        return {
          status: "mined",
          receipt,
          failed:
            receipt.status !== "success" ||
            event.eventName === "ExecutionFailure",
          nonceConsumed: true,
        };
    } catch {
      /* Only the exact deployed event layouts prove this proposal. */
    }
  }
  return {
    status: "pending",
    error:
      "The receipt does not prove that this Safe proposal executed. Check it in the Safe.",
  };
}
