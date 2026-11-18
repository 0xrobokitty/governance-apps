import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTrackedSubmissionLock } from "@/lib/tx/pending-transactions";
import {
  clearRecoveryPending, completeRecoveryPending, getRecoveryCompletion, getRecoveryPending, recoveryPendingKey,
  retainRecoveryPending, saveRecoveryPending, withRecoveryPendingLock, withRecoverySubmissionLock,
  type RecoveryPending,
} from "@/lib/clients/yeth/recovery/pending";

const account = "0x1111111111111111111111111111111111111111";
const otherAccount = "0x2222222222222222222222222222222222222222";
const hash = `0x${"33".repeat(32)}` as const;
const pending: RecoveryPending = {
  version: 1, id: "uncertain", account, chainId: 1, connectorId: "safe", kind: "safe",
  hashKind: "safe-proposal", action: "take", status: "attention",
  createdAt: 100, submittedBlock: "100", maxShares: "100", requestedWeth: "10",
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function seed() {
  await withRecoverySubmissionLock(1, account, async () => saveRecoveryPending(pending));
}
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  getRecoveryPending(1, account);
  getRecoveryPending(1, otherAccount);
  const held = new Set<string>();
  Object.defineProperty(navigator, "locks", { configurable: true, value: {
    request: async (key: string, _options: unknown, callback: (lock: object | null) => unknown) => {
      if (held.has(key)) return callback(null);
      held.add(key);
      try { return await callback({}); } finally { held.delete(key); }
    },
  } });
});

describe("recovery record mutation boundary", () => {
  it("requires a scoped lock for every pending write", () => {
    expect(() => saveRecoveryPending(pending)).toThrow("wallet lock");
    expect(localStorage.getItem(recoveryPendingKey(1, account))).toBeNull();
  });

  it("shares the wallet lock with other apps", async () => {
    const response = deferred();
    const first = withTrackedSubmissionLock(1, account, async () => response.promise);
    const mutation = vi.fn(async () => {});
    await expect(withRecoveryPendingLock(1, account, mutation)).rejects.toThrow(/Another/);
    expect(mutation).not.toHaveBeenCalled();
    response.resolve();
    await first;
  });

  it("coordinates a second module with the wallet request through Web Locks", async () => {
    const response = deferred();
    const first = withRecoverySubmissionLock(1, account, async () => {
      saveRecoveryPending(pending);
      await response.promise;
      saveRecoveryPending({ ...pending, submissionHash: hash }, pending);
    });
    await vi.waitFor(() => expect(getRecoveryPending(1, account)?.id).toBe(pending.id));
    vi.resetModules();
    const otherTab = await import("@/lib/clients/yeth/recovery/pending");
    const mutation = vi.fn(async () => {});
    await expect(otherTab.withRecoveryPendingLock(1, account, mutation)).rejects.toThrow("Another tab");
    expect(mutation).not.toHaveBeenCalled();
    response.resolve();
    await first;
    expect(otherTab.getRecoveryPending(1, account)?.submissionHash).toBe(hash);
  });

  it.each([
    { submissionHash: hash },
    { maxShares: "101" },
    { action: "redeem" as const },
    { connectorId: "walletConnect" },
    { submittedBlock: "101" },
    { exitSequenceId: "new-sequence" },
  ])("does not complete a same-ID intent whose identity changed: %j", async patch => {
    await seed();
    const changed = { ...pending, ...patch };
    await withRecoveryPendingLock(1, account, async () => saveRecoveryPending(changed, pending));
    await expect(withRecoveryPendingLock(1, account, async () => completeRecoveryPending({
      id: pending.id, account, chainId: 1, action: pending.action, status: "reconciled",
      createdAt: 101, intent: pending,
    }))).rejects.toThrow("changed");
    expect(getRecoveryPending(1, account)).toMatchObject(changed);
    expect(getRecoveryCompletion(1, account)).toBeNull();
  });

  it("retains cached fences and blocks an unknown scope when storage reads fail", async () => {
    await seed();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(getRecoveryPending(1, account)?.id).toBe(pending.id);
    expect(getRecoveryPending(1, otherAccount)).toMatchObject({ corrupt: true, status: "attention" });
  });

  it.each(["save", "clear", "complete"] as const)("never uses a stale cached intent to %s when disk cannot be read", async operation => {
    await seed();
    const newer = { ...pending, id: "newer-intent", maxShares: "101" };
    localStorage.setItem(recoveryPendingKey(1, account), JSON.stringify(newer));
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("read denied"); });
    await expect(withRecoveryPendingLock(1, account, async () => {
      if (operation === "save") saveRecoveryPending({ ...pending, submissionHash: hash }, pending);
      if (operation === "clear") clearRecoveryPending(pending);
      if (operation === "complete") completeRecoveryPending({
        id: pending.id, account, chainId: 1, action: pending.action, status: "reconciled", createdAt: 101, intent: pending,
      });
    })).rejects.toThrow("read denied");
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    read.mockRestore();
    expect(JSON.parse(localStorage.getItem(recoveryPendingKey(1, account))!)).toEqual(newer);
  });

  it("does not publish verified completion when removal of the pending record fails", async () => {
    await seed();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    await expect(withRecoveryPendingLock(1, account, async () => completeRecoveryPending({
      id: pending.id, account, chainId: 1, action: pending.action, status: "confirmed", hash,
      createdAt: 101, intent: pending,
    }))).rejects.toThrow("denied");
    expect(getRecoveryPending(1, account)?.id).toBe(pending.id);
    expect(getRecoveryCompletion(1, account)?.verified).toBe(false);
  });

  it("does not attach an in-memory hash to a different stored call", async () => {
    await seed();
    await withRecoveryPendingLock(1, account, async () => retainRecoveryPending({ ...pending, submissionHash: hash }, pending));
    expect(getRecoveryPending(1, account)?.submissionHash).toBe(hash);
    localStorage.setItem(recoveryPendingKey(1, account), JSON.stringify({ ...pending, maxShares: "101" }));
    expect(getRecoveryPending(1, account)).toMatchObject({ maxShares: "101" });
    expect(getRecoveryPending(1, account)?.submissionHash).toBeUndefined();
  });
});
