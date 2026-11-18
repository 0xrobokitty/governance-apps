import type { Address, Hex } from "viem";
import { getAccount, getPublicClient } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import { readWalletSubmissionContext } from "@/lib/tx/wallet-context";
import type { WalletReceiptProvider, WalletSubmission } from "@/lib/tx/wallet-receipt";
import type { DaoTransactionCall } from "./writes";

export type DaoWalletSubmission = WalletSubmission & { intentId?: string; executionHash?: Hex; reconciliationRequired?: boolean; reconciliationVerified?: boolean };

export async function prepareDaoWalletSubmission(call: DaoTransactionCall) {
  const client = getPublicClient(wagmiConfig, { chainId: call.chainId });
  if (!client) throw new Error("DAO receipt RPC is unavailable.");
  const context = await readWalletSubmissionContext(client, () => {
    const wallet = getAccount(wagmiConfig);
    return { account: wallet.address, chainId: wallet.chainId, connector: wallet.connector };
  });
  if (context.account.toLowerCase() !== call.from.toLowerCase() || context.chainId !== call.chainId) throw new Error("The wallet changed. Review the DAO action again.");
  const submission: DaoWalletSubmission = {
    intentId: crypto.randomUUID(),
    account: context.account, chainId: context.chainId, kind: context.kind,
    hashKind: context.hashKind, submittedBlock: context.submittedBlock,
  };
  return { submission, provider: context.provider };
}
export async function daoWalletProvider(submission?: WalletSubmission): Promise<WalletReceiptProvider | undefined> {
  if (!submission) return undefined;
  const wallet = getAccount(wagmiConfig);
  if (wallet.address?.toLowerCase() !== submission.account.toLowerCase() || wallet.chainId !== submission.chainId || !wallet.connector?.getProvider) return undefined;
  const provider = await wallet.connector.getProvider();
  return provider && typeof (provider as WalletReceiptProvider).request === "function" ? provider as WalletReceiptProvider : undefined;
}
export function parseDaoWalletSubmission(value: unknown, account: Address, chainId: number): DaoWalletSubmission | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error("Invalid DAO wallet submission.");
  const s = value as DaoWalletSubmission;
  if (s.account?.toLowerCase() !== account.toLowerCase() || s.chainId !== chainId || !["safe", "transaction"].includes(s.kind) ||
      typeof s.submittedBlock !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(s.submittedBlock) ||
      (s.submissionHash !== undefined && !isDaoSubmissionHash(s.submissionHash)) ||
      (s.executionHash !== undefined && !isDaoSubmissionHash(s.executionHash)) ||
      (s.intentId !== undefined && (typeof s.intentId !== "string" || !/^[0-9a-f-]{36}$/i.test(s.intentId))) ||
      (s.hashKind !== undefined && !["safe-proposal", "transaction", "unknown"].includes(s.hashKind)) ||
      (s.reconciliationRequired !== undefined && typeof s.reconciliationRequired !== "boolean") ||
      (s.reconciliationVerified !== undefined && typeof s.reconciliationVerified !== "boolean")) throw new Error("Invalid DAO wallet submission.");
  return s;
}
export function isDaoSubmissionHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
}
export function daoWalletSubmissionUrl(submission: WalletSubmission): string {
  return "https://app.safe.global/transactions/queue?safe=eth:" + submission.account;
}
/** Local reconciliation is allowed only for the connected account and network. */
export function assertDaoSubmissionWallet(submission: WalletSubmission) {
  const wallet = getAccount(wagmiConfig);
  if (wallet.address?.toLowerCase() !== submission.account.toLowerCase() || wallet.chainId !== submission.chainId) throw new Error("Connect the original wallet and network before reviewing this submission.");
}
export { isExplicitWalletRejection as explicitlyRejectedDaoSubmission } from "@/lib/tx/errors";

/** Legacy v1 records stored a hash without its wallet type. A connected Safe can restore that context. */
export async function restoreDaoWalletSubmission(call: DaoTransactionCall, hash: Hex): Promise<DaoWalletSubmission | undefined> {
  const context = await prepareDaoWalletSubmission(call).catch(() => undefined);
  return isDaoSmartWalletSubmission(context?.submission)
    ? { ...context!.submission, submissionHash: hash, submittedBlock: "0", hashKind: "unknown" }
    : undefined;
}

export function isDaoSmartWalletSubmission(submission?: WalletSubmission): submission is DaoWalletSubmission {
  return Boolean(submission && (submission.kind === "safe" || submission.hashKind === "unknown"));
}
