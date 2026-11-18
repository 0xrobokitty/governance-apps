import { keccak256, toHex, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const uint = z.string().regex(/^\d{1,78}$/).refine(value => BigInt(value) < 2n ** 256n);
const schema = z.object({
  version: z.literal(1), id: z.string().uuid(), account: address,
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  connectorId: z.string().min(1).max(128), kind: z.enum(["safe", "transaction"]),
  hashKind: z.enum(["safe-proposal", "transaction", "unknown"]),
  label: z.string().min(1).max(100), createdAt: z.number().int().nonnegative(),
  submittedBlock: uint, to: address, data: z.string().max(262146).regex(/^0x(?:[0-9a-fA-F]{2})*$/), value: uint,
  status: z.enum(["submitting", "pending", "attention"]),
  submissionHash: hash.optional(), error: z.string().max(500).optional(),
});
export type TrackedSubmission = z.infer<typeof schema> & { account: Address; to: Address; data: Hex; submissionHash?: Hash };
export type TrackedCompletion = { submission: TrackedSubmission; outcome: "confirmed" | "failed" | "nonce-consumed" | "reconciled"; hash?: Hash };
const prefix = "yearn:transactions:v1:";
const cache = new Map<string, { raw: string | null; value: readonly TrackedSubmission[]; error?: string }>();
const volatile = new Map<string, TrackedSubmission>();
const active = new Set<string>();
const listeners = new Set<() => void>();
const completions = new Set<(completion: TrackedCompletion) => void>();
const empty: readonly TrackedSubmission[] = [];
const emptySnapshot = { value: empty, error: undefined as string | undefined };
export function getTrackedSnapshot(chainId?: number, account?: string) {
  getTrackedSubmissions(chainId, account);
  return chainId && account ? cache.get(trackedSubmissionKey(chainId, account)) ?? emptySnapshot : emptySnapshot;
}
export const getServerTrackedSnapshot = () => emptySnapshot;
export const trackedSubmissionKey = (chainId: number, account: string) => `${prefix}${chainId}:${account.toLowerCase()}`;
const scope = (submission: TrackedSubmission) => trackedSubmissionKey(submission.chainId, submission.account);
function storage() {
  if (typeof window === "undefined") throw new Error("Pending transaction storage is unavailable. No transaction was sent.");
  return window.localStorage;
}
function notify() { for (const listener of listeners) listener(); }
export function subscribeTrackedSubmissions(listener: () => void) {
  listeners.add(listener);
  if (typeof window !== "undefined") window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); if (typeof window !== "undefined") window.removeEventListener("storage", listener); };
}
export function subscribeTrackedCompletions(listener: (completion: TrackedCompletion) => void) {
  completions.add(listener);
  return () => { completions.delete(listener); };
}
export function getTrackedSubmissions(chainId?: number, account?: string): readonly TrackedSubmission[] {
  if (!chainId || !account || typeof window === "undefined") return empty;
  const key = trackedSubmissionKey(chainId, account);
  let raw: string | null;
  try { raw = storage().getItem(key); } catch { return cache.get(key)?.value ?? empty; }
  const previous = cache.get(key);
  if (previous?.raw === raw) return previous.value;
  try {
    let value = (raw ? z.array(schema).max(20).parse(JSON.parse(raw)) : []) as TrackedSubmission[];
    if (value.some(item => item.chainId !== chainId || item.account.toLowerCase() !== account.toLowerCase())) throw new Error("scope");
    const ids = new Set(value.map(item => item.id));
    if (ids.size !== value.length) throw new Error("duplicates");
    for (const [id, item] of volatile) if (scope(item) === key && !ids.has(id)) volatile.delete(id);
    value = value.map(item => {
      const retained = volatile.get(item.id);
      // A later storage event must not erase an identifier returned by the wallet
      // when its post-send persistence failed.
      return !item.submissionHash && retained?.submissionHash && submissionFingerprint(retained) === submissionFingerprint(item)
        ? retained : item;
    });
    for (const item of value) volatile.set(item.id, item);
    cache.set(key, { raw, value });
    return value;
  } catch {
    cache.set(key, { raw, value: previous?.value ?? empty, error: "Saved pending transaction data is damaged. Restore it before sending another transaction." });
    return cache.get(key)!.value;
  }
}
export function assertTrackedStorage(chainId: number, account: string) {
  getTrackedSubmissions(chainId, account);
  const key = trackedSubmissionKey(chainId, account);
  const error = cache.get(key)?.error;
  if (error) throw new Error(error);
  const local = storage();
  const probe = key + ":probe";
  local.setItem(probe, "1");
  if (local.getItem(probe) !== "1") throw new Error("Pending transaction storage is unavailable. No transaction was sent.");
  local.removeItem(probe);
}
export function trackedStorageError(chainId?: number, account?: string) {
  if (!chainId || !account) return undefined;
  getTrackedSubmissions(chainId, account);
  return cache.get(trackedSubmissionKey(chainId, account))?.error;
}
export function submissionFingerprint(value: Pick<TrackedSubmission, "chainId" | "account" | "to" | "data" | "value">) {
  return keccak256(toHex(JSON.stringify([value.chainId, value.account.toLowerCase(), value.to.toLowerCase(), value.data.toLowerCase(), value.value])));
}
export class PendingSubmissionError extends Error {
  constructor(readonly submission: TrackedSubmission) { super(submission.error ?? "This call already has an unresolved wallet submission. Check its status before sending it again."); }
}
export function saveTrackedSubmission(value: TrackedSubmission) {
  if (!active.has(scope(value))) throw new Error("Pending transaction updates require the wallet lock.");
  schema.parse(value);
  assertTrackedStorage(value.chainId, value.account);
  const previous = getTrackedSubmissions(value.chainId, value.account);
  const next = [...previous.filter(item => item.id !== value.id), value];
  if (next.length > 20) throw new Error("Check existing pending transactions before submitting another.");
  const raw = JSON.stringify(next);
  storage().setItem(scope(value), raw);
  if (storage().getItem(scope(value)) !== raw) throw new Error("Pending transaction storage could not be verified.");
  volatile.set(value.id, value);
  cache.set(scope(value), { raw, value: next });
  notify();
}
/** Keep a returned wallet hash in memory even if storage fails after submission. */
export function retainUnstoredSubmission(value: TrackedSubmission) {
  volatile.set(value.id, value);
  const previous = cache.get(scope(value));
  if (previous) cache.set(scope(value), { ...previous, value: previous.value.map(item => item.id === value.id ? value : item) });
  notify();
}
export function findTrackedSubmission(hash: Hash) {
  return [...volatile.values()].find(value => value.submissionHash?.toLowerCase() === hash.toLowerCase());
}
export function latestTrackedSubmission(value: TrackedSubmission) {
  const saved = getTrackedSubmissions(value.chainId, value.account).find(item => item.id === value.id);
  return volatile.get(value.id)?.submissionHash ? volatile.get(value.id)! : saved;
}
export function removeTrackedSubmission(value: TrackedSubmission) {
  if (!active.has(scope(value))) throw new Error("Pending transaction updates require the wallet lock.");
  assertTrackedStorage(value.chainId, value.account);
  const previous = getTrackedSubmissions(value.chainId, value.account);
  if (!previous.some(item => item.id === value.id)) return;
  const next = previous.filter(item => item.id !== value.id);
  const raw = JSON.stringify(next);
  storage().setItem(scope(value), raw);
  if (storage().getItem(scope(value)) !== raw) throw new Error("The saved transaction could not be updated.");
  cache.set(scope(value), { raw, value: next });
  volatile.delete(value.id);
  notify();
}
export async function completeTrackedSubmission(completion: TrackedCompletion, validateOwner?: () => void) {
  await withTrackedSubmissionLock(completion.submission.chainId, completion.submission.account, async () => {
    const current = latestTrackedSubmission(completion.submission);
    if (!current) throw new Error("This submission is no longer pending.");
    const proven = completion.submission;
    if (submissionFingerprint(current) !== submissionFingerprint(proven) ||
        current.submissionHash?.toLowerCase() !== proven.submissionHash?.toLowerCase() ||
        current.hashKind !== proven.hashKind || current.kind !== proven.kind ||
        current.submittedBlock !== proven.submittedBlock || current.createdAt !== proven.createdAt ||
        current.connectorId !== proven.connectorId) {
      throw new Error("The saved submission changed. Check it again.");
    }
    validateOwner?.();
    removeTrackedSubmission(current);
  });
  for (const listener of completions) listener(completion);
}
export async function withTrackedSubmissionLock<T>(chainId: number, account: Address, run: () => Promise<T>): Promise<T> {
  const key = trackedSubmissionKey(chainId, account);
  const locked = async () => {
    if (active.has(key)) throw new Error("Another transaction is being submitted for this wallet.");
    active.add(key);
    try { return await run(); } finally { active.delete(key); }
  };
  if (typeof navigator === "undefined" || !navigator.locks) throw new Error("This browser cannot safely coordinate wallet submissions. Open the app in a browser with Web Locks support.");
  return navigator.locks.request(key, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error("Another tab is submitting a transaction for this wallet.");
    return locked();
  });
}
