import { encodeFunctionData, isAddress, type Abi, type Address, type Hash, type Hex, type PublicClient } from "viem";
import { getAccount, getPublicClient } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import { isExplicitWalletRejection } from "./errors";
import { readWalletSubmissionContext } from "./wallet-context";
import { resolveWalletReceipt } from "./wallet-receipt";
import { resolveSafeCancellation } from "./safe-cancellation";
import { validateSafeMinedCall } from "./safe-call";
import {
  assertTrackedStorage, completeTrackedSubmission, getTrackedSubmissions,
  latestTrackedSubmission, PendingSubmissionError, removeTrackedSubmission,
  retainUnstoredSubmission, saveTrackedSubmission, submissionFingerprint,
  withTrackedSubmissionLock, type TrackedSubmission,
} from "./pending-transactions";

export function readConnectedIdentity() {
  const account = getAccount(wagmiConfig);
  return { account: account.address, chainId: account.chainId, connector: account.connector };
}
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hashPattern = /^0x[0-9a-fA-F]{64}$/;
function clientFor(chainId: number): PublicClient {
  const client = getPublicClient(wagmiConfig, { chainId });
  if (!client) throw new Error("The configured network is unavailable.");
  return client as PublicClient;
}
export function contractCallIntent(request: unknown) {
  const value = request as { account?: string | { address?: string }; chainId?: number; address?: string; abi?: Abi; functionName?: string; args?: readonly unknown[]; value?: bigint; dataSuffix?: Hex };
  const account = typeof value.account === "string" ? value.account : value.account?.address;
  if (!account || !isAddress(account) || !value.address || !isAddress(value.address) || !value.chainId || !value.abi || !value.functionName || value.dataSuffix) {
    throw new Error("The wallet request has no complete transaction identity.");
  }
  const amount = value.value ?? 0n;
  if (typeof amount !== "bigint" || amount < 0n) throw new Error("The wallet request value is invalid.");
  return { account: account as Address, chainId: value.chainId, to: value.address as Address,
    data: encodeFunctionData({ abi: value.abi, functionName: value.functionName, args: value.args }), value: amount.toString() };
}

/** Persist the exact call before invoking the wallet. Simulation remains owned by the domain. */
export async function trackedContractWrite(request: unknown, send: () => Promise<Hash>, label: string): Promise<Hash> {
  const intent = contractCallIntent(request);
  const client = clientFor(intent.chainId);
  const wallet = await readWalletSubmissionContext(client, readConnectedIdentity);
  if (!same(wallet.account, intent.account) || wallet.chainId !== intent.chainId) throw new Error("The wallet changed. Review the transaction again.");
  // Smart-contract wallets can return proposal identifiers. Unknown contracts stay
  // guarded too; only a verified receipt can release their persisted call.
  if (wallet.walletType === "externally-owned" || wallet.walletType === "delegated") return send();
  return withTrackedSubmissionLock(intent.chainId, intent.account, async () => {
    assertTrackedStorage(intent.chainId, intent.account);
    const existing = getTrackedSubmissions(intent.chainId, intent.account).find(item => submissionFingerprint(item) === submissionFingerprint(intent));
    if (existing) throw new PendingSubmissionError(existing);
    const submittedBlock = wallet.submittedBlock;
    const current = readConnectedIdentity();
    if (!current.account || !same(current.account, intent.account) || current.chainId !== intent.chainId || current.connector?.id !== wallet.connectorId) {
      throw new Error("The wallet changed. Review the transaction again.");
    }
    const pending: TrackedSubmission = {
      version: 1, id: crypto.randomUUID(), ...intent, connectorId: wallet.connectorId,
      kind: wallet.kind, hashKind: wallet.hashKind ?? "unknown", label: label.slice(0, 100),
      createdAt: Date.now(), submittedBlock, status: "submitting",
    };
    saveTrackedSubmission(pending);
    try {
      const hash = await send();
      if (!hashPattern.test(hash)) throw new Error("The wallet returned an invalid submission identifier.");
      const submitted: TrackedSubmission = { ...pending, submissionHash: hash, status: "pending" };
      try { saveTrackedSubmission(submitted); }
      catch {
        retainUnstoredSubmission({ ...submitted, status: "attention", error: "The wallet submitted this call, but its identifier could not be saved. Keep this page open and check the wallet before retrying." });
      }
      return hash;
    } catch (error) {
      if (isExplicitWalletRejection(error)) removeTrackedSubmission(pending);
      else {
        const uncertain: TrackedSubmission = { ...pending, status: "attention", error: "The wallet did not confirm whether it submitted this call. Recover its proposal or execution hash before sending it again." };
        try { saveTrackedSubmission(uncertain); } catch { retainUnstoredSubmission(uncertain); }
        throw new PendingSubmissionError(uncertain);
      }
      throw error;
    }
  });
}

type CheckResult = { status: "pending"; error?: string } | { status: "confirmed" | "failed" | "reconciliation-required"; hash: Hash };
const checks = new Map<string, Promise<CheckResult>>();
export async function checkTrackedSubmission(record: TrackedSubmission, executionHash?: Hash, recoveredSubmissionHash?: Hash) {
  const previous = checks.get(record.id);
  if (previous) return previous;
  const check = (async () => {
    const pending = latestTrackedSubmission(record);
    if (!pending) throw new Error("This submission is no longer pending.");
    const client = clientFor(pending.chainId);
    const wallet = await readWalletSubmissionContext(client, readConnectedIdentity);
    if (!same(wallet.account, pending.account) || wallet.chainId !== pending.chainId) throw new Error("Reconnect the original wallet and network to check this submission.");
    if (executionHash && !hashPattern.test(executionHash)) throw new Error("Enter a valid execution transaction hash.");
    if (recoveredSubmissionHash && !hashPattern.test(recoveredSubmissionHash)) throw new Error("Enter a valid wallet submission hash.");
    const submissionHash = pending.submissionHash ?? recoveredSubmissionHash;
    if (!submissionHash) return { status: "pending" as const, error: pending.error ?? "Recover the submission hash from the wallet first." };
    // A recovered hash can prove an identical call, but cannot identify a lost
    // wallet response. It requires a separate, explicit queue reconciliation.
    const submitted = { ...pending, submissionHash, hashKind: pending.submissionHash ? pending.hashKind : "unknown" as const };
    const resolved = await resolveWalletReceipt(client, submitted, wallet.provider, executionHash);
    if (resolved.status === "pending") {
      // Do not persist user-supplied identities until canonical proof binds them.
      return { status: "pending" as const, error: resolved.error };
    }
    if (!resolved.nonceConsumed) return { status: "pending" as const, error: "This execution attempt did not consume the Safe proposal. It may still execute." };
    const transaction = await client.getTransaction({ hash: resolved.receipt.transactionHash });
    if (!same(transaction.hash, resolved.receipt.transactionHash) || transaction.blockNumber !== resolved.receipt.blockNumber || !transaction.blockHash || !same(transaction.blockHash, resolved.receipt.blockHash)) {
      throw new Error("The execution transaction does not match its canonical receipt.");
    }
    const expected = { ...pending, value: BigInt(pending.value) };
    if (resolved.safeExecution) validateSafeMinedCall(transaction, expected, resolved.safeExecution);
    else if (pending.kind === "safe" || !transaction.to || !same(transaction.from, pending.account) || !same(transaction.to, pending.to) || !same(transaction.input, pending.data) || transaction.value !== expected.value || (transaction.chainId !== undefined && transaction.chainId !== pending.chainId)) {
      throw new Error("The execution does not match the prepared call.");
    }
    const canonical = await client.getBlock({ blockNumber: resolved.receipt.blockNumber });
    if (!canonical.hash || !same(canonical.hash, resolved.receipt.blockHash) || await client.getChainId() !== pending.chainId) throw new Error("The execution block changed. Check again.");
    if (!pending.submissionHash) return { status: "reconciliation-required" as const, hash: resolved.receipt.transactionHash };
    const status = resolved.failed ? "failed" as const : "confirmed" as const;
    await completeTrackedSubmission({ submission: pending, outcome: status, hash: resolved.receipt.transactionHash });
    return { status, hash: resolved.receipt.transactionHash };
  })();
  checks.set(record.id, check);
  try { return await check; } finally { if (checks.get(record.id) === check) checks.delete(record.id); }
}

/** Consumed nonce means this proposal cannot execute again; it does not prove the action succeeded. */
export async function checkTrackedCancellation(record: TrackedSubmission) {
  const pending = latestTrackedSubmission(record);
  if (!pending?.submissionHash || pending.hashKind !== "safe-proposal") throw new Error("Recover the original Safe proposal before checking its nonce.");
  const client = clientFor(pending.chainId);
  const wallet = await readWalletSubmissionContext(client, readConnectedIdentity);
  if (!same(wallet.account, pending.account) || wallet.chainId !== pending.chainId) throw new Error("Reconnect the original Safe and network.");
  const proof = await resolveSafeCancellation(client, { ...pending, kind: "safe" });
  if (!proof) return false;
  await completeTrackedSubmission({ submission: pending, outcome: "nonce-consumed" });
  return true;
}

/** Explicit queue reconciliation is neutral: the original submission identity is unknown. */
export async function reconcileTrackedSubmission(record: TrackedSubmission, recoveredSubmissionHash: Hash | undefined, executionHash: Hash | undefined, queueChecked: boolean) {
  if (!queueChecked) throw new Error("Check the wallet queue for unresolved duplicate proposals first.");
  const validateOwner = () => {
    const identity = readConnectedIdentity();
    if (!identity.account || !same(identity.account, record.account) || identity.chainId !== record.chainId) throw new Error("Reconnect the original wallet and network.");
  };
  if (!recoveredSubmissionHash) {
    if (executionHash) throw new Error("Enter the wallet submission hash, or clear both identifiers for a manual queue review.");
    const current = latestTrackedSubmission(record);
    if (!current || current.submissionHash) throw new Error("The saved submission changed. Check it again.");
    const wallet = await readWalletSubmissionContext(clientFor(current.chainId), readConnectedIdentity);
    if (!same(wallet.account, current.account) || wallet.chainId !== current.chainId) throw new Error("Reconnect the original wallet and network.");
    await completeTrackedSubmission({ submission: record, outcome: "reconciled" }, validateOwner);
    return undefined;
  }
  const result = await checkTrackedSubmission(record, executionHash, recoveredSubmissionHash);
  if (result.status !== "reconciliation-required") throw new Error("Verify a matching execution before reconciling this uncertain submission.");
  await completeTrackedSubmission({ submission: record, outcome: "reconciled", hash: result.hash }, validateOwner);
  return result.hash;
}
