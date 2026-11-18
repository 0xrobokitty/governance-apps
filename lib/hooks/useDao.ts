"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useAccount } from "wagmi";
import { useOptionalProtocol } from "@/state/protocol";
import { OnchainDaoClient, daoRpcFromPublicClient } from "@/lib/clients/dao/onchain";
import { daoDeploymentScope, getDaoDeployments } from "@/lib/clients/dao/deployment";
import {
  applyDaoMockFixture,
  createRuntimeMockDaoClient,
  getDaoMockSnapshot,
  resetDaoMockStore,
  clearDaoMockPendingAction,
  indexDaoMockPendingAction,
  resolveDaoProposalReadEnvelope,
  setDaoMockAccountState,
  setDaoMockScriptState,
  setDaoMockAuthoringState,
  setDaoMockContentState,
  setDaoMockEmpty,
  setDaoMockExecutionState,
  setDaoMockLifecycle,
  setDaoMockLoading,
  setDaoMockPersona,
  setDaoMockProposerState,
  setDaoMockRole,
  setDaoMockSelectedProposal,
  setDaoMockSurface,
  setDaoMockTransactionOutcome,
  setDaoMockVetoState,
  subscribeDaoMockStore,
  type DaoClient,
  type DaoActionType,
  type DaoSnapshot,
  type DaoMockAccountState,
  type DaoMockScriptState,
  type DaoMockAuthoringState,
  type DaoMockContentState,
  type DaoMockExecutionState,
  type DaoMockFixtureId,
  type DaoMockLifecycleState,
  type DaoMockPersona,
  type DaoMockProposerState,
  type DaoMockRole,
  type DaoMockRuntimeSnapshot,
  type DaoMockSurfaceState,
  type DaoMockTransactionOutcome,
  type DaoMockVetoState,
  type DaoProposalLookup,
  type DaoProposalRef,
  type DaoVoteDirection,
} from "@/lib/clients/dao";
import { daoKeys } from "@/lib/hooks/daoKeys";
import { isDaoEnabled, isDaoMockRuntimeEnabled } from "@/lib/runtime/features";
import { useTx } from "@/lib/tx/useTx";
import { daoPreparedCall, type DaoTransactionCall } from "@/lib/clients/dao/writes";
import type { TxState } from "@/lib/tx/types";
import type { PreparedTransaction } from "@/lib/tx/types";
import { isDaoSmartWalletSubmission, assertDaoSubmissionWallet, prepareDaoWalletSubmission, explicitlyRejectedDaoSubmission, isDaoSubmissionHash } from "@/lib/clients/dao/wallet-submission";
import { withDaoSubmissionLock } from "@/lib/clients/dao/submission-lock";
import { DaoTransactionPendingError, DaoReconciliationRequiredError } from "@/lib/clients/dao/live-receipt";

import { daoActionStorageKey, subscribeDaoActionRecovery, readDaoActionRaw, parseDaoActionRecovery, saveDaoActionRecovery, confirmDaoAction, daoActionIsPending, type DaoActionRecovery } from "@/lib/clients/dao/action-recovery";

function withDaoWriteLock<T>(chainId: number, account: Address, operation: () => Promise<T>) {
  return isDaoMockRuntimeEnabled() ? operation() : withDaoSubmissionLock(chainId, account, operation);
}

let mockClient: DaoClient | null = null;
let feedClient: { scope: string; client: DaoClient } | null = null;

export function getDaoRouteClient(): DaoClient {
  if (!isDaoEnabled()) throw new Error("DAO route is disabled.");
  if (isDaoMockRuntimeEnabled()) {
    mockClient ??= createRuntimeMockDaoClient({ latencyMs: 250 });
    return mockClient;
  }
  const deployments = getDaoDeployments();
  const scope = daoDeploymentScope(deployments);
  if (feedClient?.scope !== scope) feedClient = { scope, client: new OnchainDaoClient(deployments) };
  return feedClient.client;
}
function daoReadScope() {
  return isDaoMockRuntimeEnabled() ? "mock" : JSON.stringify(["yearn.dao.feed.v2", process.env.NEXT_PUBLIC_DAO_DEPLOYMENTS ?? ""]);
}

const subscribeNoop = () => () => undefined;
const getNullSnapshot = () => null;

export function useDaoMockRuntime(enabled = true): DaoMockRuntimeSnapshot | null {
  const mockRuntimeEnabled = enabled && isDaoMockRuntimeEnabled();
  return useSyncExternalStore(
    mockRuntimeEnabled ? subscribeDaoMockStore : subscribeNoop,
    mockRuntimeEnabled ? getDaoMockSnapshot : getNullSnapshot,
    getNullSnapshot
  );
}

export function parseDaoProposalId(value: string): bigint | null {
  if (value.length > 78 || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed < 2n ** 256n ? parsed : null;
}

export function resolveActiveDaoProposalRef(
  feed: DaoSnapshot | undefined,
  proposalId: bigint | null,
  selection?: { chainId: string | null; votingAddress: string | null }
): DaoProposalRef | null {
  if (!feed || proposalId === null) return null;

  if (selection?.chainId || selection?.votingAddress) {
    if (selection.chainId !== String(feed.chainId) || !selection.votingAddress) return null;
    const selected = feed.contracts.find((c) => c.votingAddress.toLowerCase() === selection.votingAddress?.toLowerCase());
    return selected ? { chainId: feed.chainId, votingAddress: selected.votingAddress, proposalId } : null;
  }
  if (feed.contracts.length !== 1) return null;
  const activeContract = feed.contracts[0];
  if (!activeContract) return null;

  return {
    chainId: feed.chainId,
    votingAddress: activeContract.votingAddress,
    proposalId,
  };
}

export function useDaoFeed(enabled = true) {
  const runtime = useDaoMockRuntime();
  const queryClient = useQueryClient();
  const surfaceBlocksRead =
    runtime?.surface === "error" || runtime?.surface === "loading";
  const canReadFeed = enabled && !surfaceBlocksRead;
  const query = useQuery({
    queryKey: [...daoKeys.feed(), daoReadScope()],
    queryFn: () => {
      if (surfaceBlocksRead) {
        throw new Error(
          "DAO feed reads are paused while the surface is unavailable."
        );
      }
      return getDaoRouteClient().getFeed();
    },
    enabled: canReadFeed,
    staleTime: isDaoMockRuntimeEnabled() ? Infinity : 30_000,
    refetchInterval: isDaoMockRuntimeEnabled() ? false : 60_000,
    retry: false,
  });
  useEffect(() => {
    if (!surfaceBlocksRead) return;
    void queryClient.cancelQueries({
      queryKey: [...daoKeys.feed(), daoReadScope()],
      exact: true,
    });
  }, [queryClient, surfaceBlocksRead]);
  const surfaced = applyDaoSurfaceState(query, runtime, query.data);
  return runtime && surfaced.data !== undefined
    ? { ...surfaced, data: runtime.feed }
    : surfaced;
}

export function useDaoProposal(proposalId: string, selection?: { chainId: string | null; votingAddress: string | null }) {
  const parsedProposalId = parseDaoProposalId(proposalId);
  const invalidProposalId = parsedProposalId === null;
  const feedQuery = useDaoFeed(!invalidProposalId);
  const proposalRef = resolveActiveDaoProposalRef(
    feedQuery.data,
    parsedProposalId,
    selection
  );
  const activeContractMissing =
    parsedProposalId !== null && feedQuery.data !== undefined && !proposalRef;
  const activeContractError = activeContractMissing
    ? new Error("Select a configured chain and Voting deployment for this proposal.")
    : null;
  const envelope =
    proposalRef && feedQuery.data
      ? resolveDaoProposalReadEnvelope(feedQuery.data, proposalRef)
      : null;
  const lookup: DaoProposalLookup | { state: "not_found" } | undefined =
    invalidProposalId
      ? { state: "not_found" }
      : envelope
        ? { state: "found", proposal: envelope.proposal }
        : proposalRef && feedQuery.data
          ? {
              state: "not_found",
              ref: proposalRef,
              protocolStatus: "invalid",
              displayStatus: "not_found",
            }
          : undefined;

  return {
    ...feedQuery,
    data: lookup,
    envelope,
    proposalRef,
    error: invalidProposalId
      ? null
      : feedQuery.error ?? activeContractError,
    isError:
      !invalidProposalId &&
      (feedQuery.isError || activeContractMissing),
    isPending:
      invalidProposalId ? false : feedQuery.isPending,
    refetch: () => feedQuery.refetch(),
  };
}

export function useDaoProposerState(address: Address | null) {
  const runtime = useDaoMockRuntime();
  const protocol = useOptionalProtocol();
  const wallet = useAccount();
  const query = useQuery({
    queryKey: [...daoKeys.proposer(address), daoReadScope(), wallet.chainId ?? null],
    queryFn: () => getDaoRouteClient().getProposerState(address as Address,
      !runtime && protocol?.mainnetPublicClient ? { rpc: daoRpcFromPublicClient(protocol.mainnetPublicClient), walletChainId: wallet.chainId } : undefined),
    enabled: address !== null && (runtime !== null || wallet.isConnected),
    staleTime: runtime ? Infinity : 0,
    refetchInterval: runtime ? false : 15_000,
    retry: false,
  });
  return applyDaoSurfaceState(query, runtime);
}

export function useDaoAccountProposalState(
  ref: DaoProposalRef | null,
  address: Address | null
) {
  const runtime = useDaoMockRuntime();
  const protocol = useOptionalProtocol();
  const wallet = useAccount();
  const publicClient = protocol?.mainnetPublicClient ?? null;
  const scope = daoReadScope();
  const feed = useDaoFeed();
  const observationKey = feed.data?.canonicalBlock.hash ?? null;
  const query = useQuery({
    queryKey: [...daoKeys.account(ref, address), scope, wallet.chainId ?? null, observationKey],
    queryFn: () => {
      if (!ref || !address) throw new Error("Connect a wallet to load eligibility.");
      return getDaoRouteClient().getAccountProposalState(ref, address,
        !runtime && publicClient ? { rpc: daoRpcFromPublicClient(publicClient), walletChainId: wallet.chainId } : undefined);
    },
    enabled: ref !== null && address !== null && (runtime !== null || wallet.isConnected),
    staleTime: runtime ? Infinity : 0,
    refetchInterval: runtime ? false : 15_000,
    retry: false,
  });
  // Old eligibility is never actionable while a refresh fails or is in flight.
  const safe = !runtime && (query.isError || query.isFetching || !wallet.isConnected)
    ? { ...query, data: undefined } : query;
  return applyDaoSurfaceState(safe, runtime);
}

type DaoProposalActionOptions = {
  submittedMessage: string;
};

export function useDaoProposalActions(
  ref: DaoProposalRef,
  address: Address | null,
  options: DaoProposalActionOptions
) {
  const queryClient = useQueryClient();
  const { execute, reset, state } = useTx();
  const [activeAction, setActiveAction] = useState<DaoActionType | null>(null);
  const live = !isDaoMockRuntimeEnabled();
  const key = live && address ? daoActionStorageKey(daoDeploymentScope(getDaoDeployments()), ref, address) : null;
  const raw = useSyncExternalStore(subscribeDaoActionRecovery, () => readDaoActionRaw(key), () => null);
  const pending = useMemo(() => parseDaoActionRecovery(raw, ref, address), [raw, ref, address]);
  const inFlight = useRef(false);
  const [confirmationResult, setConfirmationResult] = useState<{ key: string; state: TxState } | null>(null);
  const actionFeed = useDaoFeed();
  const invalidate = useCallback(
    () => invalidateDaoQueries(queryClient),
    [queryClient]
  );

  useEffect(() => {
    if (!key || pending?.receiptState !== "confirmed" || !pending.transactionHash) return;
    const indexed = actionFeed.data?.proposals.some(p => p.ref.chainId === ref.chainId && p.ref.proposalId === ref.proposalId &&
      p.ref.votingAddress.toLowerCase() === ref.votingAddress.toLowerCase() && p.events.some(e =>
        e.type === pending.action && e.log.transactionHash?.toLowerCase() === pending.transactionHash?.toLowerCase() && e.log.blockHash === pending.receiptBlockHash));
    if (indexed && address) void withDaoSubmissionLock(ref.chainId, address, () => { if (readDaoActionRaw(key) === raw) saveDaoActionRecovery(key, null); }).catch(() => undefined);
  }, [actionFeed.data, key, pending, raw, ref, address]);

  const retryConfirmation = useCallback(async (recoveredHash?: Hex) => {
    if (!key || !pending || pending.receiptState !== "unknown" || inFlight.current) return;
    let record = pending;
    if (recoveredHash && (!record.transactionHash || record.walletSubmission?.reconciliationRequired) && record.walletSubmission) {
      if (!isDaoSubmissionHash(recoveredHash)) return;
      record = { ...record, transactionHash: recoveredHash, walletSubmission: { ...record.walletSubmission, submissionHash: recoveredHash, reconciliationRequired: true, reconciliationVerified: false, hashKind: isDaoSmartWalletSubmission(record.walletSubmission) ? "unknown" : "transaction" } };
      if (!await withDaoSubmissionLock(ref.chainId, record.actor, () => readDaoActionRaw(key) === raw && saveDaoActionRecovery(key, record))) return;
    }
    if (recoveredHash && isDaoSmartWalletSubmission(record.walletSubmission) && !record.walletSubmission.reconciliationRequired) {
      if (!isDaoSubmissionHash(recoveredHash)) return;
      record = { ...record, walletSubmission: { ...record.walletSubmission, executionHash: recoveredHash } };
      if (!await withDaoSubmissionLock(ref.chainId, record.actor, () => readDaoActionRaw(key) === raw && saveDaoActionRecovery(key, record))) return;
    }
    inFlight.current = true;
    setConfirmationResult({ key, state: { status: "mining", hash: record.transactionHash ?? undefined } });
    try {
      const hash = await confirmDaoAction(key, record);
      setConfirmationResult({ key, state: { status: "success", hash } });
      await invalidate();
    } catch (error) {
      const saved = parseDaoActionRecovery(readDaoActionRaw(key), ref, address);
      setConfirmationResult({ key, state: { status: (error instanceof DaoTransactionPendingError || error instanceof DaoReconciliationRequiredError) ? "pending" : "error", hash: saved?.transactionHash ?? record.transactionHash ?? undefined,
        errorMessage: error instanceof Error ? error.message : "Receipt confirmation is unavailable." } });
    } finally { inFlight.current = false; }
  }, [invalidate, key, pending, ref, address, raw]);

  const requireAddress = useCallback(() => {
    if (!address) throw new Error("Connect a wallet to continue.");
    return address;
  }, [address]);

  const submit = useCallback(
    async (
      action: DaoActionType,
      prepare: (client: DaoClient, account: Address) => Promise<PreparedTransaction>
    ) => {
      if (inFlight.current || (key && daoActionIsPending(parseDaoActionRecovery(readDaoActionRaw(key), ref, address)))) return;
      inFlight.current = true;
      let call: DaoTransactionCall | undefined;
      let submitted: DaoActionRecovery | undefined;
      setConfirmationResult(null);
      setActiveAction(action);
      reset();
      try { await execute(
        async () => withDaoWriteLock(ref.chainId, requireAddress(), async () => {
          if (key) {
            const savedRaw = readDaoActionRaw(key);
            const saved = parseDaoActionRecovery(savedRaw, ref, address);
            if (savedRaw && !saved) throw new Error("The saved DAO wallet submission cannot be read. Restore its recovery record before sending another action.");
            if (daoActionIsPending(saved)) throw new Error("A DAO action is already pending in another tab.");
          }
          const prepared = await prepare(getDaoRouteClient(), requireAddress());
          if (!isDaoMockRuntimeEnabled()) {
            call = daoPreparedCall(prepared);
            if (!key || !address) throw new Error("Missing DAO wallet recovery scope.");
            const { submission } = await prepareDaoWalletSubmission(call);
            submitted = { action, ref, actor: address, transactionHash: null, submittedAt: Math.floor(Date.now() / 1000),
              direction: null, effectiveVotingWeight: null, reason: null, call, walletSubmission: submission, receiptState: "unknown" };
            if (!saveDaoActionRecovery(key, submitted)) {
              saveDaoActionRecovery(key, null);
              throw new Error("Transaction storage is unavailable. No DAO action was sent.");
            }
          }
          try {
            const hash = await prepared();
            if (key && submitted && isDaoSubmissionHash(hash)) {
              submitted = { ...submitted, transactionHash: hash, walletSubmission: submitted.walletSubmission ? { ...submitted.walletSubmission, submissionHash: hash } : undefined };
              saveDaoActionRecovery(key, submitted);
            }
            return hash;
          }
          catch (error) {
            if (key && submitted) {
              if (explicitlyRejectedDaoSubmission(error)) saveDaoActionRecovery(key, null);
              else saveDaoActionRecovery(key, { ...submitted, confirmationError: "Wallet submission is unresolved. Check your wallet and recover its transaction or Safe proposal hash before another action." });
            }
            throw error;
          }
        }),
        {
          invalidate,
          tracking: "domain",
          onSubmitted: !key ? undefined : hash => {
            if (!submitted || !isDaoSubmissionHash(hash)) throw new Error("Missing DAO transaction expectation or valid submission hash.");
          },
          skipWaitForReceipt: isDaoMockRuntimeEnabled(),
          waitForReceipt: !key ? undefined : async () => {
            if (!submitted) throw new Error("Missing DAO submitted transaction.");
            try { return await confirmDaoAction(key, submitted); } catch (error) { if (error instanceof DaoTransactionPendingError) return { pending: true }; throw error; }
          },
          submittedMessage: options.submittedMessage,
        }
      ); } finally { inFlight.current = false; }
    },
    [execute, invalidate, options.submittedMessage, requireAddress, reset, ref, address, key]
  );

  const displayedState = confirmationResult?.key === key ? confirmationResult.state : state;
  const unconfirmedSmartWallet = isDaoSmartWalletSubmission(pending?.walletSubmission) &&
    (pending?.receiptState === "unknown" || pending?.receiptState === "consumed");
  return {
    pendingAction: pending,
    retryConfirmation,
    finishWalletReview: async () => {
      if (!key || !pending?.walletSubmission) return;
      const noHash = pending.receiptState === "unknown" && ((!pending.transactionHash && !pending.walletSubmission.submissionHash) || pending.walletSubmission.reconciliationRequired);
      if (!noHash && !(pending.receiptState === "reconciliation_required" && pending.walletSubmission.reconciliationVerified)) return;
      const finished = await withDaoSubmissionLock(ref.chainId, pending.actor, () => {
        if (readDaoActionRaw(key) !== raw) return false;
        assertDaoSubmissionWallet(pending.walletSubmission!);
        return saveDaoActionRecovery(key, null);
      });
      if (!finished) return;
      setConfirmationResult({ key, state: { status: "idle" } });
      setActiveAction(null);
      await invalidate();
    },
    activeAction: pending?.action ?? activeAction,
    state: unconfirmedSmartWallet ? { ...displayedState, hash: undefined, submissionHash: pending?.walletSubmission?.submissionHash } : displayedState,
    reset: () => {
      setActiveAction(null);
      reset();
    },
    vote: (direction: DaoVoteDirection) =>
      submit("vote", (client, account) =>
        client.prepareVote(ref, account, direction)
      ),
    retract: () =>
      submit("retract", (client, account) =>
        client.prepareRetract(ref, account)
      ),
    flag: (reason: string) =>
      submit("flag", (client, account) =>
        client.prepareFlag(ref, account, reason)
      ),
    veto: (reason: string) =>
      submit("veto", (client, account) =>
        client.prepareVeto(ref, account, reason)
      ),
    executeProposal: () =>
      submit("execute", (client, account) =>
        client.prepareExecute(ref, account)
      ),
  };
}

function applyDaoSurfaceState<
  TResult extends {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isLoading: boolean;
    isPending: boolean;
  },
>(
  query: TResult,
  runtime: DaoMockRuntimeSnapshot | null,
  lastGoodData?: TResult["data"]
): TResult {
  if (runtime?.surface === "loading") {
    return {
      ...query,
      data: undefined,
      error: null,
      isError: false,
      isLoading: true,
      isPending: true,
    } as TResult;
  }
  if (runtime?.surface === "error") {
    return {
      ...query,
      data: lastGoodData,
      error: new Error("DAO mock data is unavailable."),
      isError: true,
      isLoading: false,
      isPending: false,
    } as TResult;
  }
  return query;
}

async function invalidateDaoQueries(
  queryClient: ReturnType<typeof useQueryClient>
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: daoKeys.all, refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: ["styfi", "apr"] }),
    queryClient.invalidateQueries({ queryKey: ["styfi", "voting-power"] }),
  ]);
}

export function useDaoDebugActions() {
  const queryClient = useQueryClient();
  const mutate = async (mutation: () => unknown) => {
    mutation();
    await invalidateDaoQueries(queryClient);
  };

  return {
    applyFixture: (fixtureId: DaoMockFixtureId) =>
      mutate(() => applyDaoMockFixture(fixtureId)),
    reset: async () => {
      resetDaoMockStore();
      await queryClient.resetQueries({ queryKey: daoKeys.all });
      await invalidateDaoQueries(queryClient);
    },
    setAccountState: (accountState: DaoMockAccountState) =>
      mutate(() => setDaoMockAccountState(accountState)),
    setScriptState: (analysisState: DaoMockScriptState) =>
      mutate(() => setDaoMockScriptState(analysisState)),
    setAuthoringState: (authoringState: DaoMockAuthoringState) =>
      mutate(() => setDaoMockAuthoringState(authoringState)),
    setContentState: (contentState: DaoMockContentState) =>
      mutate(() => setDaoMockContentState(contentState)),
    setEmpty: (value: boolean) => mutate(() => setDaoMockEmpty(value)),
    setExecutionState: (executionState: DaoMockExecutionState) =>
      mutate(() => setDaoMockExecutionState(executionState)),
    setLifecycle: (lifecycle: DaoMockLifecycleState) =>
      mutate(() => setDaoMockLifecycle(lifecycle)),
    setLoading: (value: boolean) => mutate(() => setDaoMockLoading(value)),
    setPersona: (persona: DaoMockPersona) =>
      mutate(() => setDaoMockPersona(persona)),
    setProposerState: (proposerState: DaoMockProposerState) =>
      mutate(() => setDaoMockProposerState(proposerState)),
    setRole: (role: DaoMockRole, enabled: boolean) =>
      mutate(() => setDaoMockRole(role, enabled)),
    setSelectedProposal: (proposalId: string) =>
      mutate(() => setDaoMockSelectedProposal(proposalId)),
    setSurface: (surface: DaoMockSurfaceState) =>
      mutate(() => setDaoMockSurface(surface)),
    setTransactionOutcome: (outcome: DaoMockTransactionOutcome) =>
      mutate(() => setDaoMockTransactionOutcome(outcome)),
    indexPendingAction: () => mutate(() => indexDaoMockPendingAction()),
    clearPendingAction: () => mutate(() => clearDaoMockPendingAction()),
    setVetoState: (vetoState: DaoMockVetoState) =>
      mutate(() => setDaoMockVetoState(vetoState)),
  };
}

export { daoKeys } from "@/lib/hooks/daoKeys";
