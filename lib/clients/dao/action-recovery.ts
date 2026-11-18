import type { Address, Hex } from "viem";
import type { DaoActionType, DaoPendingAction, DaoProposalRef } from "./types";
import type { DaoTransactionCall } from "./writes";
import { withDaoSubmissionLock } from "./submission-lock";
import { serializeDaoProposalRef } from "./domain";
import { restoreDaoWalletSubmission, daoWalletProvider, parseDaoWalletSubmission, isDaoSubmissionHash } from "./wallet-submission";
import { isDaoTerminalTransactionError, DaoTransactionReplacedError, DaoSafeNonceConsumedError, DaoTransactionPendingError, DaoReconciliationRequiredError, waitForDaoReceipt } from "./live-receipt";

export type DaoActionRecovery = DaoPendingAction & {
  call: DaoTransactionCall;
  receiptState: "unknown" | "confirmed" | "reverted" | "replaced" | "consumed" | "reconciliation_required";
  receiptBlockHash?: Hex;
};
const listeners = new Set<() => void>();
const fallback = new Map<string, { raw: string; diskRaw: string | null }>();
export function subscribeDaoActionRecovery(listener: () => void) {
  listeners.add(listener);
  if (typeof window !== "undefined") window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); if (typeof window !== "undefined") window.removeEventListener("storage", listener); };
}
export function daoActionStorageKey(scope: string, ref: DaoProposalRef, actor: Address) {
  return "yearn.dao.live.action.v1:" + scope + ":" + serializeDaoProposalRef(ref) + ":" + actor.toLowerCase();
}
export function readDaoActionRaw(key: string | null): string | null {
  if (!key) return null;
  const retained = fallback.get(key);
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (retained && raw !== null && raw === retained.diskRaw) return retained.raw;
    fallback.delete(key);
    return raw;
  } catch { return retained?.raw ?? null; }
}
export function saveDaoActionRecovery(key: string, record: DaoActionRecovery | null) {
  const raw = record ? JSON.stringify(record, (_, value) => typeof value === "bigint" ? value.toString() : value) : null;
  let persisted = false;
  let diskRaw: string | null = null;
  try {
    // A readable baseline is required before mutation. It also scopes a failed
    // post-send write to the exact intent that remains on disk.
    diskRaw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (raw) localStorage.setItem(key, raw); else localStorage.removeItem(key);
    persisted = localStorage.getItem(key) === raw;
    if (persisted) { sessionStorage.removeItem(key); fallback.delete(key); }
    else if (raw) fallback.set(key, { raw, diskRaw });
  } catch { if (raw) fallback.set(key, { raw, diskRaw }); }
  listeners.forEach(listener => listener());
  return persisted;
}
export function parseDaoActionRecovery(raw: string | null, ref: DaoProposalRef, actor: Address | null): DaoActionRecovery | null {
  try {
    if (!raw || raw.length > 262144 || !actor) return null;
    const r = JSON.parse(raw);
    const hash = isDaoSubmissionHash;
    const walletSubmission = parseDaoWalletSubmission(r.walletSubmission, actor, ref.chainId);
    if (!["vote", "retract", "flag", "veto", "execute"].includes(r.action) ||
        !["unknown", "confirmed", "reverted", "replaced", "consumed", "reconciliation_required"].includes(r.receiptState) ||
        r.actor.toLowerCase() !== actor.toLowerCase() || r.ref.chainId !== ref.chainId ||
        r.ref.votingAddress.toLowerCase() !== ref.votingAddress.toLowerCase() || r.ref.proposalId !== String(ref.proposalId) ||
        !(hash(r.transactionHash) || (r.transactionHash === null && walletSubmission && !walletSubmission.submissionHash && r.receiptState === "unknown")) || !Number.isSafeInteger(r.submittedAt) ||
        r.call.chainId !== ref.chainId || r.call.from.toLowerCase() !== actor.toLowerCase() ||
        !/^0x[0-9a-f]{40}$/i.test(r.call.to) || !/^0x(?:[0-9a-f]{2})*$/i.test(r.call.data) ||
        (r.receiptState === "confirmed" && (!hash(r.receiptBlockHash) || !hash(r.transactionHash)))) return null;
    return { ...r, walletSubmission, action: r.action as DaoActionType, ref, actor, direction: null, effectiveVotingWeight: null, reason: null };
  } catch { return null; }
}
export function daoActionIsPending(record: DaoPendingAction | null) {
  return record !== null && (record.receiptState === undefined || record.receiptState === "unknown" || record.receiptState === "confirmed" || record.receiptState === "reconciliation_required");
}
export async function confirmDaoAction(key: string, record: DaoActionRecovery): Promise<Hex> {
  if (!record.transactionHash || (record.walletSubmission && !record.walletSubmission.submissionHash)) throw new DaoTransactionPendingError("Wallet submission is unresolved. Recover its transaction or Safe proposal hash before another action.");
  if (!record.walletSubmission) {
    const restored = await restoreDaoWalletSubmission(record.call, record.transactionHash);
    if (restored) {
      const upgraded = { ...record, walletSubmission: restored };
      await withDaoSubmissionLock(record.ref.chainId, record.actor, () => {
        const current = parseDaoActionRecovery(readDaoActionRaw(key), record.ref, record.actor);
        if (current?.transactionHash !== record.transactionHash || current.walletSubmission) throw new Error("The saved DAO submission changed. Retry its current state.");
        if (!saveDaoActionRecovery(key, upgraded)) throw new Error("The Safe submission context could not be saved.");
      });
      return confirmDaoAction(key, upgraded);
    }
  }
  const update = (next: DaoActionRecovery) => withDaoSubmissionLock(record.ref.chainId, record.actor, () => {
    const current = parseDaoActionRecovery(readDaoActionRaw(key), record.ref, record.actor);
    if (current?.transactionHash !== record.transactionHash || JSON.stringify(current.walletSubmission) !== JSON.stringify(record.walletSubmission)) throw new Error("The saved DAO submission changed. Retry its current state.");
    if (!saveDaoActionRecovery(key, next)) throw new Error("The DAO receipt state could not be saved. Check the saved submission again.");
  });
  try {
    const receipt = await waitForDaoReceipt(record.walletSubmission?.submissionHash ?? record.transactionHash, record.ref.chainId, record.actor, record.call,
      record.walletSubmission ? { submission: record.walletSubmission, provider: await daoWalletProvider(record.walletSubmission), executionHash: record.walletSubmission.executionHash, checkCancellation: true } : undefined);
    if (record.walletSubmission?.reconciliationRequired) throw new DaoReconciliationRequiredError(receipt.transactionHash);
    await update({ ...record, transactionHash: receipt.transactionHash, receiptState: "confirmed", receiptBlockHash: receipt.blockHash, confirmationError: undefined });
    return receipt.transactionHash;
  } catch (error) {
    if (record.walletSubmission?.reconciliationRequired && (error instanceof DaoReconciliationRequiredError || isDaoTerminalTransactionError(error))) {
      await update({ ...record, transactionHash: error.transactionHash ?? record.transactionHash, walletSubmission: { ...record.walletSubmission, reconciliationVerified: true }, receiptState: "reconciliation_required", confirmationError: "Recovered wallet activity was verified. Check the wallet queue and confirm no duplicate or unresolved submission remains before another DAO action." });
      throw new DaoReconciliationRequiredError(error.transactionHash);
    }
    await update({ ...record,
      transactionHash: isDaoTerminalTransactionError(error) ? error.transactionHash ?? record.transactionHash : record.transactionHash,
      receiptState: error instanceof DaoSafeNonceConsumedError ? "consumed" : error instanceof DaoTransactionReplacedError ? "replaced" : isDaoTerminalTransactionError(error) ? "reverted" : "unknown",
      confirmationError: error instanceof Error ? error.message : "Receipt confirmation is unavailable.",
    });
    throw error;
  }
}
