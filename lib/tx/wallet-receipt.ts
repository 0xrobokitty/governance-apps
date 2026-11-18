import {
  decodeEventLog, isAddress, parseAbi,
  type Address, type Hash, type PublicClient, type TransactionReceipt,
} from "viem";

export type WalletReceiptProvider = {
  request(request: { method: string; params?: unknown[] }): Promise<unknown>;
};
export type WalletSubmission = {
  account: Address;
  chainId: number;
  kind: "safe" | "transaction";
  /** Safe Apps returns proposal hashes; other Safe wallets can return either kind. */
  hashKind?: "safe-proposal" | "transaction" | "unknown";
  submissionHash?: Hash;
  submittedBlock: string;
  corrupt?: boolean;
  error?: string;
};
export type SafeExecutionProof = { safe: Address; proposalHash: Hash };
export type WalletReceiptResolution =
  | { status: "pending"; transactionHash?: Hash; error?: string }
  | {
      status: "mined";
      receipt: TransactionReceipt;
      failed: boolean;
      nonceConsumed: boolean;
      safeExecution?: SafeExecutionProof;
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
export const isWalletTransactionHash = (value: unknown): value is Hash =>
  typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);

const walletReads = new WeakMap<WalletReceiptProvider, Map<string, Promise<unknown>>>();
async function readWalletStatus(provider: WalletReceiptProvider, method: string, hash: Hash) {
  let requests = walletReads.get(provider);
  if (!requests) {
    requests = new Map();
    walletReads.set(provider, requests);
  }
  const key = method + ":" + hash.toLowerCase();
  let request = requests.get(key);
  if (!request) {
    if (requests.size >= 8) throw new Error("Reconnect the wallet before checking another submission.");
    request = Promise.resolve().then(() => provider.request({ method, params: [hash] }));
    requests.set(key, request);
    void request.finally(() => requests!.delete(key)).catch(() => undefined);
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(
          "The wallet did not answer the execution-status request. Reconnect it and check again.",
        )), 5000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
function unsupported(error: unknown) {
  return object(error) && (error.code === 4200 || error.code === -32601 ||
    typeof error.message === "string" && /not (?:implemented|supported)|unsupported method|method not found/i.test(error.message));
}
function isMissingReceipt(error: unknown) {
  return object(error) && error.name === "TransactionReceiptNotFoundError";
}
function uniqueHashes(values: unknown[]) {
  return [...new Map(values.filter(isWalletTransactionHash).map(hash => [hash.toLowerCase(), hash])).values()];
}
async function walletCandidate(provider: WalletReceiptProvider, pending: WalletSubmission & { submissionHash: Hash }) {
  try {
    const result = await readWalletStatus(provider, "wallet_getCallsStatus", pending.submissionHash);
    if (!object(result) || !isWalletTransactionHash(result.id) || !same(result.id, pending.submissionHash) ||
        typeof result.chainId !== "string" || !/^0x[0-9a-f]+$/i.test(result.chainId) ||
        BigInt(result.chainId) !== BigInt(pending.chainId) ||
        typeof result.status !== "number" || !Number.isSafeInteger(result.status) || result.status < 100 || result.status >= 600) {
      throw new Error("The wallet returned an invalid Safe proposal status.");
    }
    const hashes = uniqueHashes((Array.isArray(result.receipts) ? result.receipts : [])
      .map(receipt => object(receipt) ? receipt.transactionHash : undefined));
    if (hashes.length > 1) throw new Error("The wallet returned conflicting execution hashes.");
    return {
      transactionHash: hashes[0],
      error: !hashes.length && result.status >= 400
        ? "The Safe reports a cancelled or failed proposal, but chain execution is not verified. Check the Safe before taking further action."
        : undefined,
    };
  } catch (error) {
    if (!unsupported(error)) throw error;
  }
  // Legacy Safe providers overwrite the outer hash but retain the real hash in logs.
  // Neither provider logs nor its status establish execution.
  const hint = await readWalletStatus(provider, "eth_getTransactionReceipt", pending.submissionHash);
  if (!object(hint)) return {
    error: pending.kind === "safe"
      ? "The wallet cannot resolve this submission yet. Check its queue or supply the execution transaction hash."
      : undefined,
  };
  const hashes = uniqueHashes([
    hint.transactionHash,
    ...(Array.isArray(hint.logs) ? hint.logs.map(log => object(log) ? log.transactionHash : undefined) : []),
  ]).filter(hash => !same(hash, pending.submissionHash));
  if (hashes.length > 1) throw new Error("The wallet returned conflicting execution hashes.");
  return {
    transactionHash: hashes[0],
    error: hashes.length || pending.kind !== "safe" ? undefined : "The wallet did not provide a verified execution transaction hash.",
  };
}
async function canonicalReceipt(client: PublicClient, pending: WalletSubmission, hash: Hash) {
  let receipt: TransactionReceipt;
  try { receipt = await client.getTransactionReceipt({ hash }); }
  catch (error) {
    if (isMissingReceipt(error)) return null;
    throw error;
  }
  if (!isWalletTransactionHash(receipt.transactionHash) || !same(receipt.transactionHash, hash) ||
      typeof receipt.blockNumber !== "bigint" || receipt.blockNumber < BigInt(pending.submittedBlock) ||
      !isWalletTransactionHash(receipt.blockHash) || !["success", "reverted"].includes(receipt.status)) {
    throw new Error("The receipt does not match this submitted transaction.");
  }
  const [block, chainId] = await Promise.all([
    client.getBlock({ blockNumber: receipt.blockNumber }), client.getChainId(),
  ]);
  if (chainId !== pending.chainId) throw new Error("The RPC network changed. Execution was not verified.");
  if (!block.hash || !same(block.hash, receipt.blockHash))
    throw new Error("The execution block changed. Check the transaction again.");
  return receipt;
}
function safeExecution(receipt: TransactionReceipt, account: Address, proposalHash?: Hash) {
  const matches: Array<{ proposalHash: Hash; failed: boolean }> = [];
  for (const log of receipt.logs) {
    if (log.removed || !same(log.address, account)) continue;
    const abi = log.topics.length === 2 && log.data.length === 66 ? safeIndexedExecutionAbi
      : log.topics.length === 1 && log.data.length === 130 ? safeExecutionAbi : null;
    if (!abi) continue;
    let event;
    try { event = decodeEventLog({ abi, data: log.data, topics: log.topics, strict: true }); }
    catch { continue; }
    if (proposalHash && !same(event.args.txHash, proposalHash)) continue;
    if ((log.transactionHash && !same(log.transactionHash, receipt.transactionHash)) ||
        (log.blockHash && !same(log.blockHash, receipt.blockHash)) ||
        (log.blockNumber !== null && log.blockNumber !== undefined && log.blockNumber !== receipt.blockNumber)) {
      throw new Error("The Safe execution log does not match its canonical receipt.");
    }
    matches.push({ proposalHash: event.args.txHash, failed: event.eventName === "ExecutionFailure" });
  }
  if (matches.length > 1) throw new Error("The receipt contains conflicting Safe execution events.");
  // Reverted outer attempts cannot consume the Safe nonce, even if a provider reports otherwise.
  if (receipt.status !== "success" || matches.length !== 1) return null;
  return matches[0];
}

/** Wallet responses supply candidates only. Public receipts, canonical blocks,
 * and exact Safe execution events establish execution. Domain callers must also
 * verify the intended call before resolving a manually recovered submission. */
export async function resolveWalletReceipt(
  client: PublicClient,
  pending: WalletSubmission,
  provider?: WalletReceiptProvider,
  executionHash?: Hash,
): Promise<WalletReceiptResolution> {
  if ((await client.getChainId()) !== pending.chainId)
    throw new Error("The RPC network changed. Execution was not verified.");
  if (pending.corrupt) return { status: "pending", error: pending.error };
  if (!pending.submissionHash) return {
    status: "pending",
    error: "Submission status is unknown. Recover the transaction or proposal hash from your wallet before continuing.",
  };
  if (!isWalletTransactionHash(pending.submissionHash) || executionHash && !isWalletTransactionHash(executionHash))
    throw new Error("The submission or execution hash is invalid.");
  const knownProposal = pending.kind === "safe" && (pending.hashKind ?? "safe-proposal") === "safe-proposal";
  let transactionHash = executionHash;
  let receipt: TransactionReceipt | null = null;
  let requiresSafeProof = pending.kind === "safe" || Boolean(executionHash && !same(executionHash, pending.submissionHash));
  if (!transactionHash && !knownProposal) {
    transactionHash = pending.submissionHash;
    receipt = await canonicalReceipt(client, pending, transactionHash);
  }
  if (!receipt && !executionHash && pending.kind === "transaction" && pending.hashKind === "transaction")
    return { status: "pending" };
  if (!transactionHash || !receipt && !executionHash && !knownProposal) {
    if (!provider) return {
      status: "pending",
      error: pending.kind === "safe"
        ? "Reconnect this Safe to check its proposal, or supply its execution transaction hash."
        : undefined,
    };
    const candidate = await walletCandidate(provider, { ...pending, submissionHash: pending.submissionHash });
    transactionHash = candidate.transactionHash;
    if (!transactionHash) return { status: "pending", error: candidate.error };
    requiresSafeProof = true;
  }
  receipt ??= await canonicalReceipt(client, pending, transactionHash);
  if (!receipt) return { status: "pending", transactionHash };
  if (!requiresSafeProof && same(transactionHash, pending.submissionHash)) {
    if (typeof receipt.from === "string" && isAddress(receipt.from) && same(receipt.from, pending.account))
      return { status: "mined", receipt, failed: receipt.status !== "success", nonceConsumed: true };
    // A legacy or unidentified Safe wallet can return the actual Ethereum hash.
    // An unrelated sender is insufficient; require the exact Safe event below.
  }
  // An unknown Safe hash that is itself a canonical Ethereum hash is bound by
  // that receipt. Its single exact-Safe event identifies the proposal.
  const directExecution = !knownProposal && same(transactionHash, pending.submissionHash);
  const proof = safeExecution(receipt, pending.account, directExecution ? undefined : pending.submissionHash);
  if (!proof) return {
    status: "pending", transactionHash,
    error: "The receipt does not prove that this Safe proposal executed. Check it in the Safe.",
  };
  return {
    status: "mined", receipt, failed: proof.failed, nonceConsumed: true,
    safeExecution: { safe: pending.account, proposalHash: proof.proposalHash },
  };
}
