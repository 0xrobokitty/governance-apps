import { parseAbi, type Address, type Hash, type Hex, type PublicClient } from "viem";
import { z } from "zod";
import type SafeAppsSDK from "@safe-global/safe-apps-sdk";
import type { RecoveryPending } from "./pending";

export type SafeProposalMetadata = { safeInfo: unknown; transaction: unknown };
export type SafeProposalMetadataReader = (hash: Hash) => Promise<SafeProposalMetadata>;
export type SafeNonceConsumptionProof = {
  submissionHash: Hash;
  proposalNonce: bigint;
  currentNonce: bigint;
  blockNumber: bigint;
  blockHash: Hash;
};

const maxUint256 = (1n << 256n) - 1n;
const uint = z.string().regex(/^\d{1,78}$/).refine(value => BigInt(value) <= maxUint256);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const addressInfo = z.object({ value: address });
const safeInfoSchema = z.object({ safeAddress: address, chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
// The Gateway can omit empty value/data. Their zero defaults are accepted only
// if the full on-chain hash reconstruction still matches the submitted hash.
const proposalSchema = z.object({
  safeAddress: address,
  txData: z.object({
    to: addressInfo, value: uint.nullish().transform(value => value ?? "0"),
    hexData: z.string().max(262146).regex(/^0x(?:[0-9a-fA-F]{2})*$/).nullish().transform(value => value ?? "0x"),
    operation: z.union([z.literal(0), z.literal(1)]),
  }),
  detailedExecutionInfo: z.object({
    type: z.literal("MULTISIG"),
    nonce: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    safeTxGas: uint, baseGas: uint, gasPrice: uint,
    gasToken: address, refundReceiver: addressInfo, safeTxHash: hash,
  }),
});
const safeAbi = parseAbi([
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns (bytes32)",
  "function nonce() view returns (uint256)",
]);
const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

// The SDK has no public disposal API. Keep one communicator, and reuse unfinished
// requests so a nonresponding parent cannot accumulate callbacks on every poll.
let sdkPromise: Promise<SafeAppsSDK> | undefined;
const metadataRequests = new Map<Hash, Promise<SafeProposalMetadata>>();
async function readSafeAppMetadata(submissionHash: Hash): Promise<SafeProposalMetadata> {
  if (typeof window === "undefined" || window.parent === window) {
    throw new Error("Open this app inside the Safe to verify the proposal nonce.");
  }
  let request = metadataRequests.get(submissionHash);
  if (!request) {
    if (metadataRequests.size >= 8) throw new Error("Reconnect the Safe before checking another proposal.");
    sdkPromise ??= import("@safe-global/safe-apps-sdk").then(({ default: SDK }) => new SDK());
    request = sdkPromise.then(async sdk => {
      const [safeInfo, transaction] = await Promise.all([
        sdk.safe.getInfo(), sdk.txs.getBySafeTxHash(submissionHash),
      ]);
      return { safeInfo, transaction };
    });
    metadataRequests.set(submissionHash, request);
    void request.finally(() => metadataRequests.delete(submissionHash)).catch(() => undefined);
  }
  return request;
}
async function readWithDeadline(reader: SafeProposalMetadataReader, submissionHash: Hash) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader(submissionHash),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("The Safe did not return proposal details. Reconnect it and check again.")), 5000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * Proves only that a proposal's nonce has been consumed, so that proposal cannot
 * execute again. It cannot distinguish successful execution from replacement.
 * Callers must use a neutral outcome and never infer a payout or failed action.
 * SDK status/nonce claims alone are insufficient: bind every transaction field
 * to the submitted hash through this Safe on the configured canonical chain.
 */
export async function resolveSafeCancellation(
  client: PublicClient,
  pending: RecoveryPending,
  readMetadata: SafeProposalMetadataReader = readSafeAppMetadata,
): Promise<SafeNonceConsumptionProof | null> {
  if (pending.kind !== "safe" || !pending.submissionHash || pending.corrupt) return null;
  if (await client.getChainId() !== pending.chainId) throw new Error("The RPC network changed. The Safe nonce was not verified.");
  const metadata = await readWithDeadline(readMetadata, pending.submissionHash);
  const safeInfo = safeInfoSchema.parse(metadata.safeInfo);
  const proposal = proposalSchema.parse(metadata.transaction);
  const execution = proposal.detailedExecutionInfo;
  if (!same(safeInfo.safeAddress, pending.account) || safeInfo.chainId !== pending.chainId ||
      !same(proposal.safeAddress, pending.account) || !same(execution.safeTxHash, pending.submissionHash)) {
    throw new Error("The Safe proposal details do not match this wallet and submission.");
  }
  const block = await client.getBlock();
  if (block.number === null || !block.hash || block.number < BigInt(pending.submittedBlock)) {
    throw new Error("The Safe nonce snapshot predates this submission.");
  }
  const proposalNonce = BigInt(execution.nonce);
  const [computedHash, currentNonce] = await Promise.all([
    client.readContract({
      address: pending.account, abi: safeAbi, functionName: "getTransactionHash", blockNumber: block.number,
      args: [
        proposal.txData.to.value as Address, BigInt(proposal.txData.value), proposal.txData.hexData as Hex,
        proposal.txData.operation, BigInt(execution.safeTxGas), BigInt(execution.baseGas), BigInt(execution.gasPrice),
        execution.gasToken as Address, execution.refundReceiver.value as Address, proposalNonce,
      ],
    }),
    client.readContract({ address: pending.account, abi: safeAbi, functionName: "nonce", blockNumber: block.number }),
  ]);
  if (!same(computedHash, pending.submissionHash)) {
    throw new Error("The proposal nonce and transaction fields do not reproduce its Safe hash.");
  }
  const canonical = await client.getBlock({ blockNumber: block.number });
  if (!canonical.hash || !same(canonical.hash, block.hash) || await client.getChainId() !== pending.chainId) {
    throw new Error("The Safe nonce snapshot changed. Check the proposal again.");
  }
  if (currentNonce <= proposalNonce) return null;
  return { submissionHash: pending.submissionHash, proposalNonce, currentNonce, blockNumber: block.number, blockHash: block.hash };
}
