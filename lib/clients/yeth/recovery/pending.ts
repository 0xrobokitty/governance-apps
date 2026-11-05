import type { Address, Hash } from "viem";
import { z } from "zod";

export type RecoveryPendingAction = "approve" | "reset" | "take" | "redeem";
export type RecoveryPending = {
  version: 1;
  id: string;
  account: Address;
  chainId: number;
  connectorId: string;
  kind: "safe" | "transaction";
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
  const local = storage();
  if (!local) return null;
  const raw = storedValue(key);
  const previous = cache.get(key);
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
  cache.set(key, { raw, value });
  return value;
}
export function saveRecoveryPending(value: RecoveryPending) {
  const local = storage();
  if (!local)
    throw new Error(
      "Local transaction storage is unavailable. No transaction was sent.",
    );
  const key = recoveryPendingKey(value.chainId, value.account);
  const raw = JSON.stringify(value);
  local.setItem(key, raw);
  cache.set(key, { raw, value });
  notify();
}
export function clearRecoveryPending(value: RecoveryPending) {
  // A late completion must never clear a newer intent in this account.
  if (getRecoveryPending(value.chainId, value.account)?.id !== value.id) return;
  storage()?.removeItem(recoveryPendingKey(value.chainId, value.account));
  cache.delete(recoveryPendingKey(value.chainId, value.account));
  notify();
}
export const isRecoverySubmissionActive = (chainId: number, account: Address) =>
  active.has(recoveryPendingKey(chainId, account));
export async function withRecoverySubmissionLock<T>(
  chainId: number,
  account: Address,
  submit: () => Promise<T>,
): Promise<T> {
  const key = recoveryPendingKey(chainId, account);
  const locked = async () => {
    if (active.has(key) || getRecoveryPending(chainId, account))
      throw new Error(
        "This wallet already has a pending recovery transaction. Check its status before submitting another.",
      );
    active.add(key);
    try {
      return await submit();
    } finally {
      active.delete(key);
    }
  };
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
      if (!lock)
        throw new Error(
          "Another tab is submitting a recovery transaction for this wallet.",
        );
      return locked();
    });
  }
  return locked();
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
  status: "confirmed" | "failed" | "nonce-consumed";
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
        (parsed.status !== "nonce-consumed" && !isRecoveryHash(parsed.hash)) ||
        (parsed.hash !== undefined && !isRecoveryHash(parsed.hash)) ||
        parsed.id !== intent.id ||
        parsed.action !== intent.action ||
        intent.account.toLowerCase() !== account.toLowerCase() ||
        intent.chainId !== chainId ||
        !["confirmed", "failed", "nonce-consumed"].includes(parsed.status) ||
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
      value = { ...parsed, intent, verified: false };
    } catch {
      value = null;
    }
  }
  completionCache.set(key, { raw, value });
  return value;
}
export function saveRecoveryCompletion(value: RecoveryCompletion) {
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
  completionCache.set(key, { raw, value: { ...value, verified: true } });
  notify();
}
export function dismissRecoveryCompletion(chainId: number, account: Address) {
  const key = completionKey(chainId, account);
  storage()?.removeItem(key);
  completionCache.delete(key);
  notify();
}
