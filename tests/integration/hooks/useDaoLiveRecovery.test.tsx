import { confirmDaoAction, readDaoActionRaw } from "@/lib/clients/dao/action-recovery";
import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { renderHookWithProviders } from "@/tests/test-utils";
import { useDaoProposalActions } from "@/lib/hooks/useDao";
import { useDaoAuthoringServices } from "@/lib/hooks/useDaoAuthoring";
import { OnchainDaoClient } from "@/lib/clients/dao/onchain";
import { waitForDaoReceipt, DaoTransactionReplacedError, DaoTransactionRevertedError, DaoTransactionPendingError, DaoSafeNonceConsumedError } from "@/lib/clients/dao/live-receipt";
import { applyDaoMockFixture, getDaoMockSnapshot, DAO_MOCK_ACCOUNT_ADDRESS, DAO_MOCK_VOTING_ADDRESS, deriveDaoProposerState, getDaoMockFixture, deriveDaoProposalContentIdentity, encodeDaoProposeLog } from "@/lib/clients/dao";
import { daoAuthoringStorageKey, saveDaoAuthoringRecovery, readDaoAuthoringRecovery } from "@/lib/clients/dao/authoring-recovery";
import { daoDeploymentScope, getDaoDeployments } from "@/lib/clients/dao/deployment";
import { createDaoAuthoringReview } from "@/app/dao/propose/authoring";
import { recoveredReview } from "@/tests/fixtures/dao-pinata-recovery";
import { DaoPreparationChangedError } from "@/lib/clients/dao/writes";
vi.mock("@/lib/clients/dao/live-receipt", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/clients/dao/live-receipt")>(), waitForDaoReceipt: vi.fn() }));
import { restoreDaoWalletSubmission, assertDaoSubmissionWallet, prepareDaoWalletSubmission } from "@/lib/clients/dao/wallet-submission";
vi.mock("@/lib/clients/dao/wallet-submission", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/clients/dao/wallet-submission")>(),
  restoreDaoWalletSubmission: vi.fn(async () => undefined), assertDaoSubmissionWallet: vi.fn(), prepareDaoWalletSubmission: vi.fn(), daoWalletProvider: vi.fn(async () => undefined),
}));
const hash = ("0x" + "11".repeat(32)) as Hex, replacement = ("0x" + "22".repeat(32)) as Hex, blockHash = ("0x" + "33".repeat(32)) as Hex;
const receipt = { transactionHash: replacement, status: "success" as const, blockNumber: 1n, blockHash, blockTimestamp: 1789000000, transactionIndex: 0, logs: [] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(waitForDaoReceipt).mockReset();
  vi.mocked(prepareDaoWalletSubmission).mockImplementation(async call => ({ submission: { account: call.from, chainId: call.chainId, kind: "transaction", hashKind: "transaction", submittedBlock: "0" }, provider: undefined }));
  sessionStorage.clear(); localStorage.clear();
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_key: string, _options: unknown, run: (lock: object) => unknown) => run({}) } }); applyDaoMockFixture("voting");
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "development"); vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false"); vi.stubEnv("NEXT_PUBLIC_E2E", "false");
  vi.stubEnv("NEXT_PUBLIC_DAO_DEPLOYMENTS", JSON.stringify([{ chainId: 1, votingAddress: DAO_MOCK_VOTING_ADDRESS, deploymentBlock: "0", genesis: 0, active: true, supportedVoters: [], supportedExecutors: [] }]));
  vi.spyOn(OnchainDaoClient.prototype, "getFeed").mockResolvedValue(getDaoMockSnapshot().feed);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("public content publication", () => {
  function reviewedContent() {
    const fixture = getDaoMockFixture("discussion"), proposer = deriveDaoProposerState(fixture.proposer);
    const result = createDaoAuthoringReview({ address: proposer.address, createdAt: fixture.now,
      draft: { title: "Public publication", markdown: "Keep reviewed bytes.\n\n## Scope\n\nNo publication signature.\n", proposalType: "signal", executableScript: "0x" },
      topic: { topicId: 1001, normalizedUrl: "https://gov.yearn.fi/t/topic/1001", title: "Topic", category: "Proposals", categoryId: 5, author: "user", createdAt: 1 } });
    if (result.state !== "valid") throw new Error("Invalid review");
    return { proposer, review: result.review, identity: deriveDaoProposalContentIdentity(result.review.content) };
  }
  it("publishes without a challenge and restores verified publication after reload", async () => {
    const { proposer, review, identity } = reviewedContent();
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        expect(options.headers).toEqual({ "Content-Type": "application/octet-stream", "X-DAO-Content-Digest": identity.digest, "X-DAO-Content-CID": identity.cid });
        expect(Array.from(options.body as Uint8Array)).toEqual(Array.from(identity.bytes));
        return Response.json({ digest: identity.digest, cid: identity.cid, publishedAt: 100 });
      }
      expect(url).toBe("/api/dao-content?digest=" + identity.digest);
      return new Response(new Uint8Array(identity.bytes));
    });
    vi.stubGlobal("fetch", fetcher);
    const first = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => { const published = await first.result.current.services.publish(review, 100); expect(published, JSON.stringify(published)).toMatchObject({ state: "published" }); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    first.unmount();
    const second = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    expect(second.result.current.recovery?.publication).toMatchObject({ fingerprint: identity.digest, cid: identity.cid });
  });
  it("reports unstable preparation as review recovery without republishing or discarding publication", async () => {
    const { proposer, review, identity } = reviewedContent();
    const publication = { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: 100 };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address);
    saveDaoAuthoringRecovery(key, review, publication);
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe("/api/dao-content?digest=" + identity.digest);
      return new Response(new Uint8Array(identity.bytes));
    });
    vi.stubGlobal("fetch", fetcher);
    const message = "DAO blocks advanced repeatedly during preparation. Retry when the RPC can provide a stable preparation. No transaction was submitted.";
    vi.spyOn(OnchainDaoClient.prototype, "preparePropose").mockRejectedValue(new DaoPreparationChangedError(message));
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => expect(await hook.result.current.services.submit({ review, publication, outcome: "success" })).toMatchObject({
      state: "failed", error: { code: "PREPARATION_CHANGED", message },
    }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/dao-content?digest=" + identity.digest);
    expect(readDaoAuthoringRecovery(key, proposer.address)).toMatchObject({ state: "published", transactionHash: null, publication: { fingerprint: identity.digest } });
  });
  it.each(["disabled", "budget_reached", "verification_pending", "unavailable"])("keeps %s publication failures out of transaction recovery", async code => {
    const { proposer, review } = reviewedContent();
    const fetcher = vi.fn(async () => Response.json({ code, error: "private-provider-detail" }, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => {
      const result = await hook.result.current.services.publish(review, 100);
      expect(result.state).toBe("failed"); expect(JSON.stringify(result)).not.toContain("private-provider-detail");
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readDaoAuthoringRecovery(daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address), proposer.address)).toMatchObject({ state: "unpublished", publication: null, transactionHash: null });
  });
  it("retries exact recovered B after a failed upload and remount with a later clock", async () => {
    const b = recoveredReview();
    const proposer = { ...reviewedContent().proposer, address: b.address };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), b.address);
    let accept = false;
    const posts: Uint8Array[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        expect(readDaoAuthoringRecovery(key, b.address)?.state).toBe("unpublished");
        posts.push(new Uint8Array(options.body as Uint8Array));
        return accept ? Response.json({ digest: b.identity.digest, cid: b.identity.cid, publishedAt: 1789750800 }) : Response.json({ code: "verification_pending" }, { status: 503 });
      }
      return new Response(new Uint8Array(b.bytes));
    }));
    const first = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    expect(first.result.current.services.retainReview?.(b.review)).toBe(true);
    await act(async () => expect(await first.result.current.services.publish(b.review, 1789750431)).toMatchObject({ state: "failed" }));
    first.unmount();
    const second = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    expect(second.result.current.recovery).toMatchObject({ state: "unpublished", publication: null });
    accept = true;
    await act(async () => expect(await second.result.current.services.publish(second.result.current.recovery!.review, 1789750800)).toMatchObject({ state: "published" }));
    expect(posts).toEqual([b.bytes, b.bytes]);
    expect(readDaoAuthoringRecovery(key, b.address)?.state).toBe("published");
  });
  it("blocks publication when storage is unavailable and retains the caller's exact document", async () => {
    const { proposer, review, identity } = reviewedContent();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); });
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => expect(await hook.result.current.services.publish(review, 100)).toMatchObject({ state: "failed" }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(deriveDaoProposalContentIdentity(review.content).bytes).toEqual(identity.bytes);
  });
  it("switches recovery with account and deployment changes without carrying the prior review", () => {
    const { proposer, review } = reviewedContent();
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address);
    saveDaoAuthoringRecovery(key, review);
    const hook = renderHookWithProviders(({ address }) => useDaoAuthoringServices(address, { ...proposer, address }), { initialProps: { address: proposer.address } });
    expect(hook.result.current.recovery?.state).toBe("unpublished");
    hook.rerender({ address: "0x1111111111111111111111111111111111111111" });
    expect(hook.result.current.recovery).toBeNull();
    hook.rerender({ address: proposer.address });
    expect(hook.result.current.recovery?.state).toBe("unpublished");
    vi.stubEnv("NEXT_PUBLIC_DAO_DEPLOYMENTS", JSON.stringify([{ ...getDaoDeployments()[0], deploymentBlock: "0", votingAddress: "0x2222222222222222222222222222222222222222" }]));
    hook.rerender({ address: proposer.address });
    expect(hook.result.current.recovery).toBeNull();
    expect(readDaoAuthoringRecovery(key, proposer.address)?.review.content).toEqual(review.content);
  });
  it.each(["unpublished", "forged-published", "ineligible"])("requires server publication and current eligibility before a %s review can create a transaction", async kind => {
    const { proposer, review, identity } = reviewedContent();
    const publication = { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: 100 };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address);
    saveDaoAuthoringRecovery(key, review, kind === "unpublished" ? null : publication);
    const fetcher = vi.fn(async () => new Response(null, { status: 404 })); vi.stubGlobal("fetch", fetcher);
    const prepare = vi.spyOn(OnchainDaoClient.prototype, "preparePropose");
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, { ...proposer, canPropose: kind !== "ineligible" }));
    await act(async () => expect(await hook.result.current.services.submit({ review, publication, outcome: "success" })).toMatchObject({ state: "failed" }));
    expect(prepare).not.toHaveBeenCalled();
    if (kind === "ineligible") expect(fetcher).not.toHaveBeenCalled();
  });
});
describe("live action receipt recovery", () => {
  it("retains a submitted action through timeout and reload; retry confirms without another wallet send", async () => {
    const proposal = getDaoMockSnapshot().feed.proposals[0];
    const send = vi.fn(async () => hash);
    const prepare = vi.spyOn(OnchainDaoClient.prototype, "prepareVote").mockResolvedValue(Object.assign(send,
      { daoCall: { from: DAO_MOCK_ACCOUNT_ADDRESS, to: DAO_MOCK_VOTING_ADDRESS, chainId: 1, data: "0x1234" as Hex } }));
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(new Error("RPC receipt timeout"));
    const useActions = () => useDaoProposalActions(proposal.ref, DAO_MOCK_ACCOUNT_ADDRESS, { submittedMessage: "Submitted" });
    const first = renderHookWithProviders(useActions);
    await act(async () => { await first.result.current.vote("yea"); });
    expect(first.result.current.pendingAction).toMatchObject({ transactionHash: hash, receiptState: "unknown" });
    expect(first.result.current.state.status).toBe("error");
    first.unmount();
    const second = renderHookWithProviders(useActions);
    await waitFor(() => expect(second.result.current.pendingAction?.transactionHash).toBe(hash));
    await act(async () => { await second.result.current.vote("nay"); });
    expect(send).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1);
    vi.mocked(waitForDaoReceipt).mockResolvedValueOnce(receipt);
    await act(async () => { await second.result.current.retryConfirmation(); });
    expect(second.result.current.pendingAction).toMatchObject({ transactionHash: replacement, receiptState: "confirmed", receiptBlockHash: blockHash });
    expect(send).toHaveBeenCalledTimes(1);
    second.unmount();
    const third = renderHookWithProviders(useActions);
    await waitFor(() => expect(third.result.current.pendingAction).toMatchObject({ transactionHash: replacement, receiptState: "confirmed" }));
  });
  it.each(["reverted", "cancelled", "changed"] as const)("retains the known %s hash as a terminal outcome", async kind => {
    const proposal = getDaoMockSnapshot().feed.proposals[0];
    vi.spyOn(OnchainDaoClient.prototype, "prepareVote").mockResolvedValue(Object.assign(async () => hash,
      { daoCall: { from: DAO_MOCK_ACCOUNT_ADDRESS, to: DAO_MOCK_VOTING_ADDRESS, chainId: 1, data: "0x1234" as Hex } }));
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(kind === "reverted" ? new DaoTransactionRevertedError(hash) : new DaoTransactionReplacedError(replacement, kind));
    const useActions = () => useDaoProposalActions(proposal.ref, DAO_MOCK_ACCOUNT_ADDRESS, { submittedMessage: "Submitted" });
    const first = renderHookWithProviders(useActions);
    await act(async () => { await first.result.current.vote("yea"); });
    const expected = { receiptState: kind === "reverted" ? "reverted" : "replaced", transactionHash: kind === "reverted" ? hash : replacement };
    expect(first.result.current.pendingAction).toMatchObject(expected);
    first.unmount();
    const second = renderHookWithProviders(useActions);
    await waitFor(() => expect(second.result.current.pendingAction).toMatchObject(expected));
  });
});
describe("creation replacement recovery", () => {
  it.each(["reverted", "cancelled", "changed"] as const)("retains publication and the %s transaction link through creation reload", async kind => {
    const fixture = getDaoMockFixture("discussion"), proposer = deriveDaoProposerState(fixture.proposer);
    const result = createDaoAuthoringReview({ address: proposer.address, createdAt: fixture.now,
      draft: { title: "Terminal creation", markdown: "Keep published bytes.\n\n## Scope\n\nRecover terminal transactions.\n", proposalType: "signal", executableScript: "0x" },
      topic: { topicId: 1001, normalizedUrl: "https://gov.yearn.fi/t/topic/1001", title: "Topic", category: "Proposals", categoryId: 5, author: "user", createdAt: 1 } });
    if (result.state !== "valid") throw new Error("Invalid test review");
    const review = result.review, identity = deriveDaoProposalContentIdentity(review.content);
    const publication = { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: fixture.now };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address);
    saveDaoAuthoringRecovery(key, review, publication, hash, proposer.expectedVotingEpoch);
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(kind === "reverted" ? new DaoTransactionRevertedError(hash) : new DaoTransactionReplacedError(replacement, kind));
    const first = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => { await expect(first.result.current.services.confirm(review, publication, hash, proposer.expectedVotingEpoch)).rejects.toThrow(); });
    first.unmount();
    const second = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    expect(second.result.current.recovery).toMatchObject({ transactionHash: null, publication: { fingerprint: identity.digest },
      lastFailure: { transactionHash: kind === "reverted" ? hash : replacement, code: kind === "reverted" ? "PROPOSAL_REVERTED" : "PROPOSAL_REPLACED" } });
  });

  it("decodes proposal zero from the accepted hash and restores that hash on reload", async () => {
    const fixture = getDaoMockFixture("discussion"), proposer = deriveDaoProposerState(fixture.proposer);
    const result = createDaoAuthoringReview({ address: proposer.address, createdAt: fixture.now,
      draft: { title: "Replacement creation", markdown: "Keep exact identity.\n\n## Scope\n\nTest recovery.\n", proposalType: "signal", executableScript: "0x" },
      topic: { topicId: 1001, normalizedUrl: "https://gov.yearn.fi/t/topic/1001", title: "Topic", category: "Proposals", categoryId: 5, author: "user", createdAt: 1 } });
    if (result.state !== "valid") throw new Error("Invalid test review");
    const review = result.review, identity = deriveDaoProposalContentIdentity(review.content);
    const publication = { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: fixture.now };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), proposer.address);
    saveDaoAuthoringRecovery(key, review, publication, hash, proposer.expectedVotingEpoch);
    vi.mocked(waitForDaoReceipt).mockResolvedValue({ ...receipt, logs: [encodeDaoProposeLog({ address: DAO_MOCK_VOTING_ADDRESS, contentDigest: identity.digest,
      logIndex: 0, proposalId: 0n, proposer: proposer.address, script: "0x", votingEpoch: proposer.expectedVotingEpoch })] });
    const first = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    await act(async () => {
      const confirmed = await first.result.current.services.confirm(review, publication, hash, proposer.expectedVotingEpoch);
      expect(confirmed.decoded).toMatchObject({ state: "decoded", identity: { ref: { proposalId: 0n }, log: { transactionHash: replacement } } });
    });
    expect(readDaoAuthoringRecovery(key, proposer.address)?.transactionHash).toBe(replacement);
    first.unmount();
    const second = renderHookWithProviders(() => useDaoAuthoringServices(proposer.address, proposer));
    expect(second.result.current.recovery?.transactionHash).toBe(replacement);
    await act(async () => { await second.result.current.services.confirm(review, publication, replacement, proposer.expectedVotingEpoch); });
    expect(waitForDaoReceipt).toHaveBeenLastCalledWith(replacement, 1, proposer.address, expect.any(Object), undefined);
  });
});


describe("DAO Safe proposal persistence", () => {
  function safeContext() {
    vi.mocked(prepareDaoWalletSubmission).mockImplementation(async call => ({ submission: { account: call.from, chainId: call.chainId, kind: "safe", hashKind: "safe-proposal", submittedBlock: "0" }, provider: undefined }));
  }
  function action(send: () => Promise<Hex>) {
    const proposal = getDaoMockSnapshot().feed.proposals[0];
    vi.spyOn(OnchainDaoClient.prototype, "prepareVote").mockResolvedValue(Object.assign(send,
      { daoCall: { from: DAO_MOCK_ACCOUNT_ADDRESS, to: DAO_MOCK_VOTING_ADDRESS, chainId: 1, data: "0x1234" as Hex } }));
    return () => useDaoProposalActions(proposal.ref, DAO_MOCK_ACCOUNT_ADDRESS, { submittedMessage: "Submitted" });
  }
  it("keeps a queued Safe proposal across reload and stores the separate execution hash", async () => {
    safeContext();
    const send = vi.fn(async () => hash);
    const useActions = action(send);
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(new DaoTransactionPendingError());
    const first = renderHookWithProviders(useActions);
    await act(async () => { await first.result.current.vote("yea"); });
    expect(first.result.current.state.status).toBe("pending");
    expect(first.result.current.state.hash).toBeUndefined();
    expect(first.result.current.state.submissionHash).toBe(hash);
    expect(first.result.current.pendingAction).toMatchObject({ transactionHash: hash, walletSubmission: { kind: "safe", submissionHash: hash }, receiptState: "unknown" });
    first.unmount();
    const second = renderHookWithProviders(useActions);
    await act(async () => { await second.result.current.vote("nay"); });
    expect(send).toHaveBeenCalledOnce();
    vi.mocked(waitForDaoReceipt).mockResolvedValueOnce(receipt);
    await act(async () => { await second.result.current.retryConfirmation(replacement); });
    expect(second.result.current.pendingAction).toMatchObject({ transactionHash: replacement, walletSubmission: { submissionHash: hash, executionHash: replacement }, receiptState: "confirmed" });
    expect(waitForDaoReceipt).toHaveBeenLastCalledWith(hash, 1, DAO_MOCK_ACCOUNT_ADDRESS, expect.any(Object), expect.objectContaining({ executionHash: replacement, submission: expect.objectContaining({ submissionHash: hash }) }));
  });
  it("persists intent before an uncertain send and recovers explicitly without resubmitting", async () => {
    safeContext();
    const send = vi.fn(async () => { expect(localStorage.length).toBeGreaterThan(0); throw new Error("Wallet disconnected"); });
    const useActions = action(send);
    const first = renderHookWithProviders(useActions);
    await act(async () => { await first.result.current.vote("yea"); });
    expect(first.result.current.pendingAction).toMatchObject({ transactionHash: null, receiptState: "unknown", walletSubmission: { kind: "safe" } });
    first.unmount();
    const second = renderHookWithProviders(useActions);
    await act(async () => { await second.result.current.vote("yea"); });
    expect(send).toHaveBeenCalledOnce();
    vi.mocked(waitForDaoReceipt).mockResolvedValueOnce(receipt);
    await act(async () => { await second.result.current.retryConfirmation(hash); });
    expect(second.result.current.pendingAction).toMatchObject({ transactionHash: replacement, walletSubmission: { submissionHash: hash, hashKind: "unknown", reconciliationVerified: true }, receiptState: "reconciliation_required" });
    expect(send).toHaveBeenCalledOnce();
    await act(async () => { await second.result.current.vote("yea"); });
    expect(send).toHaveBeenCalledOnce();
    await act(async () => { await second.result.current.finishWalletReview(); });
    expect(second.result.current.pendingAction).toBeNull();
    expect(second.result.current.state.status).toBe("idle");
  });
  it("retires an explicitly rejected pre-send intent and keeps nonce consumption neutral", async () => {
    safeContext();
    const useActions = action(async () => { throw Object.assign(new Error("Rejected"), { code: 4001 }); });
    const first = renderHookWithProviders(useActions);
    await act(async () => { await first.result.current.vote("yea"); });
    expect(first.result.current.pendingAction).toBeNull();
    first.unmount();
    const next = renderHookWithProviders(action(async () => hash));
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(new DaoSafeNonceConsumedError(hash));
    await act(async () => { await next.result.current.vote("yea"); });
    expect(next.result.current.pendingAction).toMatchObject({ receiptState: "consumed", transactionHash: hash });
  });
  it("does not retire a known Safe proposal because an RPC error contains revert text", async () => {
    safeContext();
    const b = recoveredReview();
    const proposer = { ...deriveDaoProposerState(getDaoMockFixture("discussion").proposer), address: b.address };
    const publication = { fingerprint: b.identity.digest, cid: b.identity.cid, canonicalBytes: b.bytes, publishedAt: 100 };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(b.bytes))));
    const send = vi.fn(async () => hash);
    vi.spyOn(OnchainDaoClient.prototype, "preparePropose").mockResolvedValue(Object.assign(send, { daoCall: { from: b.address, to: DAO_MOCK_VOTING_ADDRESS, chainId: 1, data: "0x1234" as Hex } }));
    vi.mocked(waitForDaoReceipt).mockRejectedValue(new Error("execution reverted while checking RPC Safe metadata"));
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    await act(async () => { expect(await hook.result.current.services.submit({ review: b.review, publication, outcome: "success" })).toMatchObject({ state: "submitted", transactionHash: hash }); });
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), b.address);
    expect(readDaoAuthoringRecovery(key, b.address)).toMatchObject({ transactionHash: hash, lastFailure: undefined, walletSubmission: { submissionHash: hash } });
    await act(async () => { await hook.result.current.services.submit({ review: b.review, publication, outcome: "success" }); });
    expect(send).toHaveBeenCalledOnce();
  });
  it("retains creation bytes and unknown intent through reload, then restores the supplied hash", async () => {
    safeContext();
    const b = recoveredReview();
    const proposer = { ...deriveDaoProposerState(getDaoMockFixture("discussion").proposer), address: b.address };
    const publication = { fingerprint: b.identity.digest, cid: b.identity.cid, canonicalBytes: b.bytes, publishedAt: 100 };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(b.bytes))));
    const send = vi.fn(async () => { throw new Error("Wallet disconnected"); });
    const prepare = vi.spyOn(OnchainDaoClient.prototype, "preparePropose").mockResolvedValue(Object.assign(send, { daoCall: { from: b.address, to: DAO_MOCK_VOTING_ADDRESS, chainId: 1, data: "0x1234" as Hex } }));
    const first = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    await act(async () => { expect(await first.result.current.services.submit({ review: b.review, publication, outcome: "success" })).toMatchObject({ state: "failed", error: { code: "SUBMISSION_UNKNOWN" } }); });
    first.unmount();
    const second = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    expect(second.result.current.recovery).toMatchObject({ transactionHash: null, walletSubmission: { kind: "safe" }, publication: { fingerprint: b.identity.digest } });
    await act(async () => { await second.result.current.services.submit({ review: b.review, publication, outcome: "success" }); });
    expect(prepare).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledOnce();
    await act(async () => { expect(await second.result.current.services.recoverSubmission!(hash)).toMatchObject({ state: "submitted", transactionHash: hash, walletSubmission: { submissionHash: hash } }); });
    const saved = readDaoAuthoringRecovery(daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), b.address), b.address);
    expect(Array.from(saved!.publication!.canonicalBytes)).toEqual(Array.from(b.bytes));
    expect(saved?.walletSubmission?.submissionHash).toBe(hash);
  });
});

describe("durable DAO submission fences", () => {
  function setupAction(send: () => Promise<Hex>) {
    const proposal = getDaoMockSnapshot().feed.proposals[0];
    vi.spyOn(OnchainDaoClient.prototype, "prepareVote").mockResolvedValue(Object.assign(send,
      { daoCall: { from: DAO_MOCK_ACCOUNT_ADDRESS, to: DAO_MOCK_VOTING_ADDRESS, chainId: 1, data: "0x1234" as Hex } }));
    return () => useDaoProposalActions(proposal.ref, DAO_MOCK_ACCOUNT_ADDRESS, { submittedMessage: "Submitted" });
  }
  it("keeps an uncertain action after tab storage is lost, then permits only explicit neutral review", async () => {
    const send = vi.fn(async () => { throw new Error("Transport rejected the response"); });
    const useActions = setupAction(send);
    const first = renderHookWithProviders(useActions);
    await act(async () => { await first.result.current.vote("yea"); });
    expect(first.result.current.pendingAction?.transactionHash).toBeNull();
    first.unmount(); sessionStorage.clear();
    const second = renderHookWithProviders(useActions);
    expect(second.result.current.pendingAction?.walletSubmission).toBeDefined();
    await act(async () => { await second.result.current.vote("yea"); });
    expect(send).toHaveBeenCalledOnce();
    await act(async () => { await second.result.current.finishWalletReview(); });
    expect(assertDaoSubmissionWallet).toHaveBeenCalled();
    expect(second.result.current.pendingAction).toBeNull();
    expect(second.result.current.state.status).toBe("idle");
    expect(waitForDaoReceipt).not.toHaveBeenCalled();
  });
  it("retains the original uncertain fence after a manually supplied earlier transaction reverted", async () => {
    const useActions = setupAction(async () => { throw new Error("Lost response"); });
    const hook = renderHookWithProviders(useActions);
    await act(async () => { await hook.result.current.vote("yea"); });
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(new DaoTransactionRevertedError(hash));
    await act(async () => { await hook.result.current.retryConfirmation(hash); });
    expect(hook.result.current.pendingAction).toMatchObject({ receiptState: "reconciliation_required", walletSubmission: { reconciliationVerified: true } });
    expect(hook.result.current.state.status).toBe("pending");
  });
  it("uses the shared wallet lock and blocks a second tab while the first wallet call is unresolved", async () => {
    let release!: (hash: Hex) => void;
    const send = vi.fn(() => new Promise<Hex>(resolve => { release = resolve; }));
    const useActions = setupAction(send);
    const first = renderHookWithProviders(useActions), second = renderHookWithProviders(useActions);
    let original!: Promise<void>;
    act(() => { original = first.result.current.vote("yea"); });
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    await act(async () => { await second.result.current.vote("nay"); });
    expect(send).toHaveBeenCalledOnce();
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(new DaoTransactionPendingError());
    await act(async () => { release(hash); await original; });
    expect(second.result.current.pendingAction?.transactionHash).toBe(hash);
  });
  it("fails before wallet preparation when browser submission locks are unavailable", async () => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    const send = vi.fn(async () => hash);
    const hook = renderHookWithProviders(setupAction(send));
    await act(async () => { await hook.result.current.vote("yea"); });
    expect(send).not.toHaveBeenCalled();
    expect(hook.result.current.state.status).toBe("error");
  });
  it("does not replace a damaged durable action record with a fresh wallet send", async () => {
    const send = vi.fn(async () => { throw new Error("Lost response"); });
    const useActions = setupAction(send), first = renderHookWithProviders(useActions);
    await act(async () => { await first.result.current.vote("yea"); });
    first.unmount();
    const key = Object.keys(localStorage).find(key => key.startsWith("yearn.dao.live.action.v1:"))!;
    localStorage.setItem(key, "{damaged");
    const second = renderHookWithProviders(useActions);
    await act(async () => { await second.result.current.vote("yea"); });
    expect(send).toHaveBeenCalledOnce();
    expect(second.result.current.state.errorMessage).toContain("cannot be read");
    expect(localStorage.getItem(key)).toBe("{damaged");
  });
  it("does not treat a manually recovered earlier creation as the interrupted proposal", async () => {
    const b = recoveredReview();
    const proposer = { ...deriveDaoProposerState(getDaoMockFixture("discussion").proposer), address: b.address };
    const publication = { fingerprint: b.identity.digest, cid: b.identity.cid, canonicalBytes: b.bytes, publishedAt: 100 };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), b.address);
    const submission = { account: b.address, chainId: 1, kind: "safe" as const, hashKind: "safe-proposal" as const, submittedBlock: "0" };
    saveDaoAuthoringRecovery(key, b.review, publication, null, proposer.expectedVotingEpoch, undefined, submission);
    sessionStorage.clear();
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    await act(async () => { await hook.result.current.services.recoverSubmission!(hash); });
    vi.mocked(waitForDaoReceipt).mockResolvedValue({ ...receipt, logs: [encodeDaoProposeLog({ address: DAO_MOCK_VOTING_ADDRESS, contentDigest: b.identity.digest,
      logIndex: 0, proposalId: 0n, proposer: b.address, script: "0x", votingEpoch: proposer.expectedVotingEpoch })] });
    await act(async () => { await expect(hook.result.current.services.confirm(b.review, publication, hash, proposer.expectedVotingEpoch)).rejects.toMatchObject({ code: "DAO_RECONCILIATION_REQUIRED" }); });
    const current = readDaoAuthoringRecovery(key, b.address)!;
    expect(current.walletSubmission?.reconciliationVerified).toBe(true);
    expect(current.transactionHash).toBe(replacement);
    expect(await hook.result.current.services.finishWalletReview!(submission)).toBe(false);
    await act(async () => { expect(await hook.result.current.services.finishWalletReview!(current.walletSubmission!)).toBe(true); });
    expect(readDaoAuthoringRecovery(key, b.address)).toMatchObject({ transactionHash: null, walletSubmission: undefined, publication: { fingerprint: b.identity.digest } });
  });
  it.each(["replaced", "removed"])("discards a failed-write fallback after another tab %s its disk intent", async kind => {
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (this === localStorage && value.includes('"submissionHash"')) throw new Error("Quota");
      originalSet.call(this, key, value);
    });
    const useActions = setupAction(async () => hash);
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(new DaoTransactionPendingError());
    const hook = renderHookWithProviders(useActions);
    await act(async () => { await hook.result.current.vote("yea"); });
    const key = Object.keys(localStorage).find(key => key.startsWith("yearn.dao.live.action.v1:"))!;
    const old = hook.result.current.pendingAction!;
    expect(old.transactionHash).toBe(hash);
    hook.unmount();
    const next = kind === "removed" ? null : JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), walletSubmission: {
      ...old.walletSubmission, submissionHash: replacement, intentId: crypto.randomUUID(),
    }, transactionHash: replacement });
    if (next) originalSet.call(localStorage, key, next); else localStorage.removeItem(key);
    expect(readDaoActionRaw(key)).toBe(next);
    vi.mocked(waitForDaoReceipt).mockResolvedValueOnce(receipt);
    await expect(confirmDaoAction(key, old as import("@/lib/clients/dao/action-recovery").DaoActionRecovery)).rejects.toThrow("changed");
    expect(localStorage.getItem(key)).toBe(next);
  });
  it("restores the wallet context of a legacy Safe action before canonical confirmation", async () => {
    const useActions = setupAction(async () => hash);
    vi.mocked(waitForDaoReceipt).mockRejectedValueOnce(new DaoTransactionPendingError());
    const first = renderHookWithProviders(useActions);
    await act(async () => { await first.result.current.vote("yea"); });
    first.unmount();
    const key = Object.keys(localStorage).find(key => key.startsWith("yearn.dao.live.action.v1:"))!;
    const legacy = JSON.parse(localStorage.getItem(key)!); delete legacy.walletSubmission;
    localStorage.removeItem(key); sessionStorage.setItem(key, JSON.stringify(legacy));
    vi.mocked(restoreDaoWalletSubmission).mockResolvedValueOnce({ account: DAO_MOCK_ACCOUNT_ADDRESS, chainId: 1, kind: "safe", submissionHash: hash, submittedBlock: "0", hashKind: "unknown" });
    vi.mocked(waitForDaoReceipt).mockResolvedValueOnce(receipt);
    const second = renderHookWithProviders(useActions);
    await act(async () => { await second.result.current.retryConfirmation(); });
    expect(second.result.current.pendingAction).toMatchObject({ transactionHash: replacement, walletSubmission: { kind: "safe", submissionHash: hash }, receiptState: "confirmed" });
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it("keeps neutral review available after an unverified candidate for an originally unknown creation", async () => {
    const b = recoveredReview();
    const proposer = { ...deriveDaoProposerState(getDaoMockFixture("discussion").proposer), address: b.address };
    const publication = { fingerprint: b.identity.digest, cid: b.identity.cid, canonicalBytes: b.bytes, publishedAt: 100 };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), b.address);
    const submission = { account: b.address, chainId: 1, kind: "safe" as const, hashKind: "safe-proposal" as const, submittedBlock: "0" };
    saveDaoAuthoringRecovery(key, b.review, publication, null, proposer.expectedVotingEpoch, undefined, submission);
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    await hook.result.current.services.recoverSubmission!(hash);
    vi.mocked(waitForDaoReceipt).mockRejectedValue(new DaoTransactionPendingError());
    await expect(hook.result.current.services.confirm(b.review, publication, hash, proposer.expectedVotingEpoch)).rejects.toThrow();
    const current = readDaoAuthoringRecovery(key, b.address)!;
    expect(current.walletSubmission?.reconciliationVerified).toBe(false);
    expect(await hook.result.current.services.finishWalletReview!(current.walletSubmission!)).toBe(true);
    saveDaoAuthoringRecovery(key, b.review, publication, hash, proposer.expectedVotingEpoch, undefined, { ...submission, submissionHash: hash });
    expect(await hook.result.current.services.finishWalletReview!({ ...submission, submissionHash: hash })).toBe(false);
  });
  it("refuses an old creation receipt after a newer intent replaces the saved submission", async () => {
    const b = recoveredReview();
    const proposer = { ...deriveDaoProposerState(getDaoMockFixture("discussion").proposer), address: b.address };
    const publication = { fingerprint: b.identity.digest, cid: b.identity.cid, canonicalBytes: b.bytes, publishedAt: 100 };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), b.address);
    const newer = { account: b.address, chainId: 1, kind: "transaction" as const, hashKind: "transaction" as const, submissionHash: replacement, submittedBlock: "0" };
    saveDaoAuthoringRecovery(key, b.review, publication, replacement, proposer.expectedVotingEpoch, undefined, newer);
    const raw = localStorage.getItem(key);
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    await expect(hook.result.current.services.confirm(b.review, publication, hash, proposer.expectedVotingEpoch)).rejects.toThrow("changed");
    expect(waitForDaoReceipt).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(raw);
  });
  it("allows no-hash creation review without a receipt and refuses a stale original intent", async () => {
    const b = recoveredReview();
    const proposer = { ...deriveDaoProposerState(getDaoMockFixture("discussion").proposer), address: b.address };
    const publication = { fingerprint: b.identity.digest, cid: b.identity.cid, canonicalBytes: b.bytes, publishedAt: 100 };
    const key = daoAuthoringStorageKey(daoDeploymentScope(getDaoDeployments()), b.address);
    const submission = { account: b.address, chainId: 1, kind: "safe" as const, submittedBlock: "0", intentId: crypto.randomUUID() };
    saveDaoAuthoringRecovery(key, b.review, publication, null, proposer.expectedVotingEpoch, undefined, submission);
    const hook = renderHookWithProviders(() => useDaoAuthoringServices(b.address, proposer));
    await act(async () => { expect(await hook.result.current.services.finishWalletReview!({ ...submission, intentId: crypto.randomUUID() })).toBe(false); });
    expect(localStorage.getItem(key)).not.toBeNull();
    await act(async () => { expect(await hook.result.current.services.finishWalletReview!(submission)).toBe(true); });
    expect(localStorage.getItem(key)).toBeNull();
    expect(waitForDaoReceipt).not.toHaveBeenCalled();
  });
});
