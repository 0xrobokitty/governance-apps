import { isAddress, parseAbi, type Address, type PublicClient } from "viem";
import { isWalletTransactionHash, type WalletReceiptProvider, type WalletSubmission } from "./wallet-receipt";

export type WalletSubmissionIdentity = {
  account?: Address;
  chainId?: number;
  connector?: { id: string; getProvider?: () => Promise<unknown> };
};
export type WalletSubmissionContext = Pick<WalletSubmission, "account" | "chainId" | "kind" | "hashKind" | "submittedBlock"> & {
  connectorId: string;
  provider?: WalletReceiptProvider;
  walletType: "safe-app" | "safe-contract" | "externally-owned" | "delegated" | "unknown-contract";
  safeDetection: "confirmed" | "unknown" | "not-safe";
};
const safeIdentityAbi = parseAbi([
  "function VERSION() view returns (string)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
]);
const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Wallet identification timed out. Reconnect and try again.")), 5000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
function validChain(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function providerChain(value: unknown) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return undefined;
  const result = Number(value);
  return validChain(result) ? result : undefined;
}

/** Snapshot the selected wallet around asynchronous reads. Safe interface probing
 * selects a receipt strategy; it never proves execution or authorizes a write. */
export async function readWalletSubmissionContext(
  client: PublicClient,
  readIdentity: () => WalletSubmissionIdentity,
): Promise<WalletSubmissionContext> {
  const initial = readIdentity();
  const { account, chainId, connector } = initial;
  if (!account || !isAddress(account) || !validChain(chainId) || !connector?.id)
    throw new Error("Connect the account and network before submitting.");
  const assertIdentity = () => {
    const current = readIdentity();
    if (!current.account || !same(current.account, account) || current.chainId !== chainId ||
        current.connector?.id !== connector.id || current.connector !== connector)
      throw new Error("Your wallet or network changed. Review the transaction again.");
  };
  const [rpcChain, block, candidate] = await bounded(Promise.all([
    client.getChainId(), client.getBlock(),
    connector.getProvider ? connector.getProvider() : Promise.resolve(undefined),
  ]));
  assertIdentity();
  if (rpcChain !== chainId) throw new Error("The RPC network does not match the selected wallet.");
  if (block.number === null || !isWalletTransactionHash(block.hash))
    throw new Error("A canonical submission block is unavailable.");
  let provider: WalletReceiptProvider | undefined;
  if (candidate !== undefined && candidate !== null) {
    if (!object(candidate) || typeof candidate.request !== "function")
      throw new Error("The wallet provider is unavailable.");
    provider = candidate as WalletReceiptProvider;
    const [accounts, currentChain] = await bounded(Promise.all([
      provider.request({ method: "eth_accounts" }), provider.request({ method: "eth_chainId" }),
    ]));
    assertIdentity();
    if (!Array.isArray(accounts) || !accounts.some(value => typeof value === "string" && same(value, account)) ||
        providerChain(currentChain) !== chainId)
      throw new Error("The wallet provider changed account or network. Reconnect it.");
  }
  const context: WalletSubmissionContext = {
    account, chainId, connectorId: connector.id, provider, submittedBlock: block.number.toString(),
    kind: "transaction", hashKind: "transaction", walletType: "externally-owned", safeDetection: "not-safe",
  };
  if (connector.id === "safe") {
    if (!provider) throw new Error("The Safe provider is unavailable.");
    context.kind = "safe";
    context.hashKind = "safe-proposal";
    context.walletType = "safe-app";
    context.safeDetection = "confirmed";
  } else {
    // Code lookup failure prevents submission. It must not turn a Safe into an EOA.
    const code = await bounded(client.getBytecode({ address: account, blockNumber: block.number }));
    assertIdentity();
    if (code && code !== "0x") {
      if (/^0xef0100[0-9a-f]{40}$/i.test(code)) {
        context.walletType = "delegated";
      } else {
        context.walletType = "unknown-contract";
        context.hashKind = "unknown";
        context.safeDetection = "unknown";
        try {
          const [version, owners, threshold, nonce] = await bounded(Promise.all([
            client.readContract({ address: account, abi: safeIdentityAbi, functionName: "VERSION", blockNumber: block.number }),
            client.readContract({ address: account, abi: safeIdentityAbi, functionName: "getOwners", blockNumber: block.number }),
            client.readContract({ address: account, abi: safeIdentityAbi, functionName: "getThreshold", blockNumber: block.number }),
            client.readContract({ address: account, abi: safeIdentityAbi, functionName: "nonce", blockNumber: block.number }),
          ]));
          if (/^1\.[0-9]+\.[0-9]+(?:[-+].*)?$/.test(version) && owners.length > 0 && owners.length <= 1024 &&
              owners.every(owner => isAddress(owner)) &&
              new Set(owners.map(owner => owner.toLowerCase())).size === owners.length &&
              threshold > 0n && threshold <= BigInt(owners.length) && nonce >= 0n) {
            context.kind = "safe";
            context.walletType = "safe-contract";
            context.safeDetection = "confirmed";
          }
        } catch {
          // Unknown smart accounts remain recoverable; they are never classified as EOAs.
        }
      }
    }
  }
  const [canonical, finalChain] = await bounded(Promise.all([
    client.getBlock({ blockNumber: block.number }), client.getChainId(),
  ]));
  assertIdentity();
  if (!canonical.hash || !same(canonical.hash, block.hash) || finalChain !== chainId)
    throw new Error("The submission snapshot changed. Review the transaction again.");
  return context;
}
