import type { Address, Hash } from "viem";
import { z } from "zod";
import { withTrackedSubmissionLock } from "@/lib/tx/pending-transactions";

export type RecoveryPendingAction = "approve" | "reset" | "take" | "redeem";
export type RecoveryPending = {
  version: 1;
  id: string;
  account: Address;
  chainId: number;
  connectorId: string;
  kind: "safe" | "transaction";
  hashKind?: "safe-proposal" | "transaction" | "unknown";
  action: RecoveryPendingAction;
  status: "submitting" | "awaiting-execution" | "mining" | "attention";
  submissionHash?: Hash;
  transactionHash?: Hash;
  createdAt: number;
  submittedBlock: string;
  maxShares: string;
  requestedWeth?: string;
  exitMode?: "complete" | "auction";
  exitOriginalShares?: string;
  exitSequenceId?: string;
  error?: string;
  corrupt?: boolean;
  originalSignedTransaction?: `0x${string}`;
  replacementHash?: Hash;
};
const uint = z
  .string()
  .regex(/^\d{1,78}$/)
  .refine((value) => BigInt(value) <= (1n << 256n) - 1n);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const pendingSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/),
  account: addressSchema,
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  connectorId: z.string().min(1).max(128),
  kind: z.enum(["safe", "transaction"]),
  hashKind: z.enum(["safe-proposal", "transaction", "unknown"]).optional(),
  action: z.enum(["approve", "reset", "take", "redeem"]),
  status: z.enum(["submitting", "awaiting-execution", "mining", "attention"]),
  submissionHash: hashSchema.optional(),
  transactionHash: hashSchema.optional(),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  submittedBlock: uint,
  maxShares: uint,
  originalSignedTransaction: z
    .string()
    .max(262146)
    .regex(/^0x(?:[0-9a-fA-F]{2})+$/)
    .optional(),
  replacementHash: hashSchema.optional(),
  requestedWeth: uint.optional(),
  exitMode: z.enum(["complete", "auction"]).optional(),
  exitOriginalShares: uint.optional(),
  exitSequenceId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/).optional(),
  error: z.string().max(500).optional(),
});
const prefix = "yearn:yeth:pending:v1:";
const cache = new Map<
  string,
  { raw: string | null; value: RecoveryPending | null }
>();
const listeners = new Set<() => void>();
const active = new Set<string>();
const retained = new Map<string, RecoveryPending>();
const unavailable = new Map<string, RecoveryPending>();
const hashPattern = /^0x[0-9a-fA-F]{64}$/;
export const isRecoveryHash = (value: unknown): value is Hash =>
  typeof value === "string" && hashPattern.test(value);
export const recoveryPendingKey = (chainId: number, account: string) =>
  prefix + chainId + ":" + account.toLowerCase();
function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function storedValue(key: string) {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function notify() {
  for (const listener of listeners) listener();
}
export function subscribeRecoveryPending(listener: () => void) {
  listeners.add(listener);
  if (typeof window !== "undefined")
    window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined")
      window.removeEventListener("storage", listener);
  };
}
export function getRecoveryPending(
  chainId: number,
  account?: string,
): RecoveryPending | null {
  if (!account) return null;
  const key = recoveryPendingKey(chainId, account);
  const previous = cache.get(key);
  let raw: string | null;
  try {
    const local = storage();
    if (!local) throw new Error("storage");
    raw = local.getItem(key);
  } catch {
    if (previous?.value) return previous.value;
    if (!unavailable.has(key)) unavailable.set(key, {
      version: 1, id: "unavailable-storage", account: account as Address, chainId,
      connectorId: "unknown", kind: "transaction", action: "approve",
      status: "attention", createdAt: 0, submittedBlock: "0", maxShares: "0", corrupt: true,
      error: "Saved transaction storage is unavailable. Restore browser storage before submitting another action.",
    });
    return unavailable.get(key)!;
  }
  unavailable.delete(key);
  if (previous?.raw === raw) return previous.value;
  let value: RecoveryPending | null = null;
  if (raw) {
    try {
      const parsed = pendingSchema.parse(JSON.parse(raw)) as RecoveryPending;
      if (
        parsed.account.toLowerCase() !== account.toLowerCase() ||
        parsed.chainId !== chainId
      )
        throw new Error("scope");
      value = parsed;
    } catch {
      // Damaged storage is a blocking state, not permission to submit again.
      value = {
        version: 1,
        id: "damaged-storage",
        account: account as Address,
        chainId,
        connectorId: "unknown",
        kind: "transaction",
        action: "approve",
        status: "attention",
        createdAt: 0,
        submittedBlock: "0",
        maxShares: "0",
        corrupt: true,
        error:
          "Saved transaction data is damaged. Restore its wallet transaction or proposal details before submitting another action.",
      };
    }
  }
  const held = retained.get(key);
  if (value && held && !value.submissionHash && sameRecoveryIntent({ ...held, submissionHash: undefined }, value)) value = held;
  if (!value || value.id !== held?.id) retained.delete(key);
  cache.set(key, { raw, value });
  return value;
}
export function recoveryPendingIdentity(value: RecoveryPending): string {
  return JSON.stringify([
    value.version, value.id, value.account.toLowerCase(), value.chainId, value.connectorId,
    value.kind, value.hashKind, value.action, value.createdAt, value.submittedBlock,
    value.maxShares, value.requestedWeth, value.exitMode, value.exitOriginalShares,
    value.exitSequenceId, value.submissionHash?.toLowerCase(), value.transactionHash?.toLowerCase(),
    value.originalSignedTransaction?.toLowerCase(), value.replacementHash?.toLowerCase(), value.corrupt,
  ]);
}
export function sameRecoveryIntent(left: RecoveryPending, right: RecoveryPending): boolean {
  return recoveryPendingIdentity(left) === recoveryPendingIdentity(right);
}
function assertLocked(chainId: number, account: Address) {
  if (!active.has(recoveryPendingKey(chainId, account))) throw new Error("Recovery transaction updates require the wallet lock.");
}
/** Mutation checks must read disk. A cached UI fence cannot authorize a write. */
function readRecoveryPendingForMutation(chainId: number, account: Address): RecoveryPending | null {
  const local = storage();
  if (!local) throw new Error("Pending recovery storage is unavailable.");
  const key = recoveryPendingKey(chainId, account);
  const raw = local.getItem(key);
  if (raw === null) return null;
  const value = pendingSchema.parse(JSON.parse(raw)) as RecoveryPending;
  if (value.chainId !== chainId || value.account.toLowerCase() !== account.toLowerCase()) throw new Error("The saved recovery wallet changed.");
  const held = retained.get(key);
  return held && !value.submissionHash && sameRecoveryIntent({ ...held, submissionHash: undefined }, value) ? held : value;
}
export function assertRecoveryPending(expected: RecoveryPending) {
  const current = readRecoveryPendingForMutation(expected.chainId, expected.account);
  if (!current || !sameRecoveryIntent(current, expected)) throw new Error("The saved recovery submission changed. Check it again.");
  return current;
}
export function saveRecoveryPending(value: RecoveryPending, expected?: RecoveryPending) {
  assertLocked(value.chainId, value.account);
  pendingSchema.parse(value);
  if (expected) assertRecoveryPending(expected);
  else if (readRecoveryPendingForMutation(value.chainId, value.account)) throw new Error("This wallet already has a pending recovery transaction.");
  const local = storage();
  if (!local) throw new Error("Local transaction storage is unavailable. No transaction was sent.");
  const key = recoveryPendingKey(value.chainId, value.account);
  const raw = JSON.stringify(value);
  local.setItem(key, raw);
  if (local.getItem(key) !== raw) throw new Error("The pending recovery transaction could not be saved.");
  retained.delete(key);
  cache.set(key, { raw, value });
  notify();
}
/** Preserve a wallet-returned identifier if its post-send storage write fails. */
export function retainRecoveryPending(value: RecoveryPending, expected: RecoveryPending) {
  assertLocked(value.chainId, value.account);
  const key = recoveryPendingKey(value.chainId, value.account);
  const current = cache.get(key)?.value;
  if (!current || !sameRecoveryIntent(current, expected)) throw new Error("The recovery submission changed before its wallet response.");
  retained.set(key, value);
  const previous = cache.get(key);
  if (previous) cache.set(key, { ...previous, value });
  notify();
}
export function clearRecoveryPending(value: RecoveryPending) {
  assertLocked(value.chainId, value.account);
  assertRecoveryPending(value);
  const local = storage();
  if (!local) throw new Error("Pending recovery storage is unavailable.");
  const key = recoveryPendingKey(value.chainId, value.account);
  local.removeItem(key);
  if (local.getItem(key) !== null) throw new Error("The pending recovery transaction could not be cleared.");
  retained.delete(key);
  cache.delete(key);
  notify();
}
export const isRecoverySubmissionActive = (chainId: number, account: Address) =>
  active.has(recoveryPendingKey(chainId, account));
export async function withRecoveryPendingLock<T>(
  chainId: number, account: Address, operation: () => Promise<T>,
): Promise<T> {
  const key = recoveryPendingKey(chainId, account);
  if (active.has(key)) throw new Error("Another recovery transaction update is in progress for this wallet.");
  return withTrackedSubmissionLock(chainId, account, async () => {
    if (active.has(key)) throw new Error("Another tab is updating recovery transactions for this wallet.");
    active.add(key);
    try { return await operation(); } finally { active.delete(key); }
  });
}
export async function withRecoverySubmissionLock<T>(
  chainId: number, account: Address, submit: () => Promise<T>,
): Promise<T> {
  return withRecoveryPendingLock(chainId, account, async () => {
    if (getRecoveryPending(chainId, account)) throw new Error("This wallet already has a pending recovery transaction. Check its status before submitting another.");
    return submit();
  });
}

export type RecoveryCompletion = {
  id: string;
  action: RecoveryPendingAction;
  account: Address;
  chainId: number;
  hash?: Hash;
  exitMode?: "complete" | "auction";
  createdAt: number;
  receipt?: import("./onchain").RecoveryActionReceipt;
  status: "confirmed" | "failed" | "nonce-consumed" | "reconciled";
  error?: string;
  intent: RecoveryPending;
  verified?: boolean;
};
const completionCache = new Map<
  string,
  { raw: string | null; value: RecoveryCompletion | null }
>();
const completionKey = (chainId: number, account: string) =>
  recoveryPendingKey(chainId, account) + ":completed";
export function getRecoveryCompletion(
  chainId: number,
  account?: string,
): RecoveryCompletion | null {
  if (!account) return null;
  const key = completionKey(chainId, account);
  const raw = storedValue(key);
  const previous = completionCache.get(key);
  if (previous?.raw === raw) return previous.value;
  let value: RecoveryCompletion | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RecoveryCompletion;
      const intent = pendingSchema.parse(parsed.intent) as RecoveryPending;
      if (
        parsed.account?.toLowerCase() !== account.toLowerCase() ||
        parsed.chainId !== chainId ||
        (!["nonce-consumed", "reconciled"].includes(parsed.status) && !isRecoveryHash(parsed.hash)) ||
        (parsed.hash !== undefined && !isRecoveryHash(parsed.hash)) ||
        parsed.id !== intent.id ||
        parsed.action !== intent.action ||
        intent.account.toLowerCase() !== account.toLowerCase() ||
        intent.chainId !== chainId ||
        !["confirmed", "failed", "nonce-consumed", "reconciled"].includes(parsed.status) ||
        (parsed.status !== "confirmed" && parsed.receipt !== undefined)
      )
        throw new Error("scope");
      if (parsed.receipt) {
        for (const name of [
          "blockNumber",
          "wethReceived",
          "sharesSpent",
          "remainingShares",
        ] as const)
          uint.parse(parsed.receipt[name]);
        if (!isRecoveryHash(parsed.receipt.hash)) throw new Error("receipt");
        parsed.receipt = {
          ...parsed.receipt,
          blockNumber: BigInt(parsed.receipt.blockNumber),
          wethReceived: BigInt(parsed.receipt.wethReceived),
          sharesSpent: BigInt(parsed.receipt.sharesSpent),
          remainingShares: BigInt(parsed.receipt.remainingShares),
        };
      }
      value = { ...parsed, intent, verified: parsed.status === "reconciled" };
    } catch {
      value = null;
    }
  }
  completionCache.set(key, { raw, value });
  return value;
}
export function saveRecoveryCompletion(value: RecoveryCompletion) {
  assertLocked(value.chainId, value.account);
  const local = storage();
  if (!local)
    throw new Error(
      "The confirmed receipt could not be saved. Check the transaction before continuing.",
    );
  const key = completionKey(value.chainId, value.account);
  const raw = JSON.stringify(
    { ...value, verified: undefined },
    (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry),
  );
  local.setItem(key, raw);
  if (local.getItem(key) !== raw) throw new Error("The recovery result could not be saved.");
  completionCache.set(key, { raw, value: { ...value, verified: true } });
  notify();
}
/** Publish completion only after both durable writes succeed under the wallet lock. */
export function completeRecoveryPending(value: RecoveryCompletion) {
  assertLocked(value.chainId, value.account);
  assertRecoveryPending(value.intent);
  const local = storage();
  if (!local) throw new Error("Pending recovery storage is unavailable.");
  const resultKey = completionKey(value.chainId, value.account);
  const pendingKey = recoveryPendingKey(value.chainId, value.account);
  const raw = JSON.stringify({ ...value, verified: undefined }, (_key, entry) => typeof entry === "bigint" ? entry.toString() : entry);
  local.setItem(resultKey, raw);
  if (local.getItem(resultKey) !== raw) throw new Error("The recovery result could not be saved.");
  local.removeItem(pendingKey);
  if (local.getItem(pendingKey) !== null) throw new Error("The pending recovery transaction could not be cleared.");
  retained.delete(pendingKey);
  cache.delete(pendingKey);
  completionCache.set(resultKey, { raw, value: { ...value, verified: true } });
  notify();
}
export function dismissRecoveryCompletion(chainId: number, account: Address) {
  assertLocked(chainId, account);
  const key = completionKey(chainId, account);
  storage()?.removeItem(key);
  completionCache.delete(key);
  notify();
}
