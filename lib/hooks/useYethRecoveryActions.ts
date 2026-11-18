"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { encodeFunctionData, erc20Abi, type Address, type Hash, type PublicClient } from "viem";
import { readWalletSubmissionContext } from "@/lib/tx/wallet-context";
import { validateSafeMinedCall } from "@/lib/tx/safe-call";
import { useAccount, usePublicClient, type Config } from "wagmi";
import { getAccount, simulateContract, writeContract } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import { useTx } from "@/lib/tx/useTx";
import { isExplicitWalletRejection } from "@/lib/tx/errors";
import { YETH_RECOVERY_VAULT } from "@/lib/clients/yeth/deployment";
import { getRecoveryEnvironment } from "@/lib/clients/yeth/recovery/environment";
import {
  RECOVERY_AUCTION,
  RECOVERY_WETH,
  readRecoveryAccount,
  recoveryAuctionAbi,
  recoveryVaultAbi,
  recoveryRound,
  validateRecoveryTake,
  parseRecoveryReceipt,
  parseRecoveryApprovalReceipt,
  type RecoveryActionQuote,
  type RecoveryActionReceipt,
} from "@/lib/clients/yeth/recovery/onchain";
import {
  clearRecoveryPending,
  completeRecoveryPending,
  assertRecoveryPending,
  sameRecoveryIntent,
  retainRecoveryPending,
  withRecoveryPendingLock,
  dismissRecoveryCompletion,
  getRecoveryCompletion,
  getRecoveryPending,
  isRecoveryHash,
  saveRecoveryCompletion,
  saveRecoveryPending,
  subscribeRecoveryPending,
  withRecoverySubmissionLock,
  isRecoverySubmissionActive,
  type RecoveryCompletion,
  type RecoveryPending,
  type RecoveryPendingAction,
} from "@/lib/clients/yeth/recovery/pending";
import {
  resolveRecoveryReceipt,
  type RecoveryWalletProvider,
} from "@/lib/clients/yeth/recovery/wallet-receipt";
import { resolveSafeCancellation } from "@/lib/clients/yeth/recovery/safe-cancellation";
import {
  captureRecoveryTransaction,
  resolveRecoveryReplacement,
  resolveRecoveryTransactionNonce,
} from "@/lib/clients/yeth/recovery/transaction-replacement";

export type RecoveryExitWallet = { address: Address; chainId: number; connectorId: string };
export type RecoveryExitStep = {
  action: RecoveryPendingAction;
  maxShares: bigint;
  quote?: RecoveryActionQuote;
  mode: "complete" | "auction";
  originalShares: bigint;
  sequenceId: string;
  wallet: RecoveryExitWallet;
  shouldContinue?: () => boolean;
};

const recoveryWagmiConfig: Config = wagmiConfig;
const noPending = () => null;
export function useYethRecoveryActions(indexedBlock?: bigint) {
  const account = useAccount();
  const environment = getRecoveryEnvironment();
  const publicClient = usePublicClient({ chainId: environment.chainId }) as
    | PublicClient
    | undefined;
  const lifecycle = useTx();
  const checking = useRef(false);
  const pending = useSyncExternalStore(
    subscribeRecoveryPending,
    () => getRecoveryPending(environment.chainId, account.address),
    noPending,
  );
  const storedCompletion = useSyncExternalStore(
    subscribeRecoveryPending,
    () => getRecoveryCompletion(environment.chainId, account.address),
    noPending,
  );
  const completion = storedCompletion?.verified ? storedCompletion : null;
  const receipt = completion?.receipt ?? null;
  const accountQuery = useQuery({
    queryKey: [
      "yeth",
      "recovery-chain",
      environment.chainId,
      account.address,
      indexedBlock?.toString(),
    ],
    enabled: Boolean(
      account.address &&
        account.chainId === environment.chainId &&
        publicClient,
    ),
    queryFn: async () => {
      if (!publicClient || !account.address)
        throw new Error("Connect your wallet.");
      return readRecoveryAccount(
        publicClient,
        account.address,
        environment.chainId,
        indexedBlock,
      );
    },
    refetchInterval: 12_000,
    staleTime: 0,
    retry: 1,
  });
  const refresh = async () => {
    await accountQuery.refetch();
  };
  const context = useCallback((expected?: Address) => {
    const current = getAccount(wagmiConfig);
    if (
      !publicClient ||
      !current.address ||
      current.chainId !== environment.chainId
    )
      throw new Error(
        "Connect your wallet to " +
          (environment.fork ? "the local Ethereum fork." : "Ethereum."),
      );
    if (expected && current.address.toLowerCase() !== expected.toLowerCase())
      throw new Error("Your wallet changed. Review the amount again.");
    return {
      client: publicClient,
      address: current.address,
      connector: current.connector,
    };
  }, [publicClient, environment.chainId, environment.fork]);
  const getExitWallet = (): RecoveryExitWallet => {
    const current = context();
    return { address: current.address, chainId: environment.chainId, connectorId: current.connector?.id ?? "unknown" };
  };
  const assertExitWallet = (expected: RecoveryExitWallet) => {
    const current = getExitWallet();
    if (current.address.toLowerCase() !== expected.address.toLowerCase() || current.chainId !== expected.chainId || current.connectorId !== expected.connectorId) {
      throw new Error("Your wallet or network changed. Continue from the original wallet.");
    }
  };
  const readExitAccount = async (expected: RecoveryExitWallet, minimumBlock?: bigint) => {
    assertExitWallet(expected);
    const state = await readRecoveryAccount(context(expected.address).client, expected.address, expected.chainId);
    assertExitWallet(expected);
    if (minimumBlock !== undefined && state.blockNumber < minimumBlock) throw new Error("The wallet balance is still updating. Continue after it refreshes.");
    return state;
  };
  const walletContext = (client: PublicClient) => readWalletSubmissionContext(client, () => {
    const current = getAccount(wagmiConfig);
    return { account: current.address, chainId: current.chainId, connector: current.connector };
  });
  const providerFor = async (record: RecoveryPending): Promise<RecoveryWalletProvider | undefined> => {
    const wallet = await walletContext(context(record.account).client);
    context(record.account);
    return wallet.provider;
  };
  const updatePending = async (record: RecoveryPending, patch: Partial<RecoveryPending>) =>
    withRecoveryPendingLock(record.chainId, record.account, async () => {
      context(record.account);
      const current = assertRecoveryPending(record);
      const updated = { ...current, ...patch };
      saveRecoveryPending(updated, current);
      return updated;
    });
  const assertCanonical = async (client: PublicClient, record: RecoveryPending, proof: { blockNumber: bigint; blockHash: Hash }) => {
    const [block, chainId] = await Promise.all([client.getBlock({ blockNumber: proof.blockNumber }), client.getChainId()]);
    if (!block.hash || block.hash.toLowerCase() !== proof.blockHash.toLowerCase() || chainId !== record.chainId) {
      throw new Error("The execution block changed. Check the transaction again.");
    }
    context(record.account);
  };
  const prove = async (
    record: RecoveryPending,
    client: PublicClient,
    resolution: Extract<
      Awaited<ReturnType<typeof resolveRecoveryReceipt>>,
      { status: "mined" }
    >,
  ): Promise<RecoveryCompletion> => {
    const mined = resolution.receipt;
    if (resolution.failed)
      return {
        id: record.id,
        action: record.action,
        account: record.account,
        chainId: record.chainId,
        hash: mined.transactionHash,
        status: "failed",
        intent: record,
        exitMode: record.exitMode,
        createdAt: Math.floor(Date.now() / 1000),
        error:
          "The transaction executed but reverted. No recovery was completed.",
      };
    let confirmed: RecoveryActionReceipt | undefined;
    if (record.action === "approve" || record.action === "reset") {
      const expected = BigInt(record.maxShares);
      parseRecoveryApprovalReceipt(mined, record.account, expected);
      const allowance = await client.readContract({
        address: YETH_RECOVERY_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        args: [record.account, RECOVERY_AUCTION],
        blockNumber: mined.blockNumber,
      });
      if (allowance !== expected)
        throw new Error(
          "The receipt does not confirm the exact auction allowance.",
        );
    } else {
      const amounts = parseRecoveryReceipt(
        mined,
        record.account,
        record.action,
        BigInt(record.maxShares),
        record.requestedWeth === undefined
          ? undefined
          : BigInt(record.requestedWeth),
      );
      const remainingShares = await client.readContract({
        address: YETH_RECOVERY_VAULT,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [record.account],
        blockNumber: mined.blockNumber,
      });
      confirmed = {
        hash: mined.transactionHash,
        blockNumber: mined.blockNumber,
        ...amounts,
        remainingShares,
      };
    }
    return {
      id: record.id,
      action: record.action,
      account: record.account,
      chainId: record.chainId,
      hash: mined.transactionHash,
      receipt: confirmed,
      exitMode: record.exitMode,
      createdAt: Math.floor(Date.now() / 1000),
      status: "confirmed",
      intent: record,
    };
  };
  const currentRecord = (record: RecoveryPending) => {
    const current = getRecoveryPending(record.chainId, record.account);
    return current && sameRecoveryIntent(current, record) ? current : null;
  };
  const priorResult = (record: RecoveryPending) => {
    const prior = getRecoveryCompletion(record.chainId, record.account);
    return prior?.id === record.id && prior.verified ? prior : null;
  };
  const neutralCompletion = (
    record: RecoveryPending,
    hash?: Hash,
  ): RecoveryCompletion => ({
    id: record.id,
    action: record.action,
    account: record.account,
    chainId: record.chainId,
    hash,
    status: "nonce-consumed",
    intent: record,
    exitMode: record.exitMode,
    createdAt: Math.floor(Date.now() / 1000),
    error:
      "This submission can no longer execute. A recovery payout has not been established; review your current position and wallet history.",
  });
  const resolveOutcome = async (
    record: RecoveryPending,
    client: PublicClient,
    provider?: RecoveryWalletProvider,
    verificationHash?: Hash,
  ): Promise<RecoveryCompletion | null> => {
    if (record.originalSignedTransaction && record.replacementHash) {
      const replacement = await resolveRecoveryReplacement(client, record, record.originalSignedTransaction, record.replacementHash);
      let result: RecoveryCompletion;
      if (replacement.status === "nonce-consumed") result = neutralCompletion(record, replacement.receipt.transactionHash);
      else {
        try {
          result = await prove(record, client, {
            status: "mined", receipt: replacement.receipt,
            failed: replacement.receipt.status !== "success", nonceConsumed: true,
          });
        } catch { result = neutralCompletion(record, replacement.receipt.transactionHash); }
      }
      await assertCanonical(client, record, replacement.receipt);
      return result;
    }
    const resolution = await resolveRecoveryReceipt(client, record, provider, verificationHash);
    if (resolution.status === "mined") {
      // An outer Safe execution can revert without consuming the proposal.
      if (!resolution.nonceConsumed) return null;
      if (resolution.safeExecution || verificationHash) await verifyExecutionCall(record, client, resolution);
      let result: RecoveryCompletion;
      try { result = await prove(record, client, resolution); }
      catch { result = neutralCompletion(record, resolution.receipt.transactionHash); }
      // Reorgs must never be converted into a consumed-nonce outcome.
      await assertCanonical(client, record, resolution.receipt);
      return result;
    }
    if (record.kind === "safe" && resolution.error) {
      try {
        const proof = await resolveSafeCancellation(client, record);
        if (proof) {
          await assertCanonical(client, record, proof);
          return neutralCompletion(record);
        }
      } catch {
        /* Unverified SDK metadata cannot release a queued proposal. */
      }
    }
    if (record.kind === "transaction" && record.originalSignedTransaction) {
      try {
        const proof = await resolveRecoveryTransactionNonce(client, record, record.originalSignedTransaction);
        if (proof) {
          await assertCanonical(client, record, proof);
          return neutralCompletion(record);
        }
      } catch {
        /* Keep unknown nonce/replacement states pending. */
      }
    }
    const current = currentRecord(record);
    if (current)
      await updatePending(current, {
        status: resolution.error
          ? "attention"
          : record.kind === "safe"
            ? "awaiting-execution"
            : "mining",
        error: resolution.error,
      });
    return null;
  };
  const captureOriginal = async (
    record: RecoveryPending,
    client: PublicClient,
  ): Promise<RecoveryPending> => {
    if (
      record.kind !== "transaction" ||
      !record.submissionHash ||
      record.originalSignedTransaction
    )
      return record;
    try {
      const transaction = await client.getTransaction({
        hash: record.submissionHash,
      });
      const originalSignedTransaction = await captureRecoveryTransaction(
        transaction,
        record,
      );
      const current = currentRecord(record);
      if (!current) return record;
      return await updatePending(current, { originalSignedTransaction });
    } catch {
      return record;
    } // Opaque proposal IDs are not normal Ethereum hashes.
  };
  const inspect = async (
    record: RecoveryPending,
    client: PublicClient,
    provider?: RecoveryWalletProvider,
    verificationHash?: Hash,
  ): Promise<RecoveryCompletion | null> => {
    const latest = getRecoveryPending(record.chainId, record.account);
    if (latest && sameRecoveryIntent(latest, record)) record = latest;
    record = await captureOriginal(record, client);
    if (!currentRecord(record)) return priorResult(record);
    const result = await resolveOutcome(record, client, provider, verificationHash);
    if (!currentRecord(record)) return priorResult(record);
    if (!result) return null;
    return withRecoveryPendingLock(record.chainId, record.account, async () => {
      context(record.account);
      completeRecoveryPending(result);
      return result;
    });
  };
  const preserveAttention = async (record: RecoveryPending, message: string) => {
    if (!currentRecord(record)) return;
    try { await updatePending(record, { status: "attention", error: message }); }
    catch { /* A changed intent or another tab's lock must retain its own state. */ }
  };
  const verifyExecutionCall = async (record: RecoveryPending, client: PublicClient, resolution: Extract<Awaited<ReturnType<typeof resolveRecoveryReceipt>>, { status: "mined" }>) => {
    const expected = {
      account: record.account, chainId: record.chainId, value: 0n,
      to: record.action === "take" ? RECOVERY_AUCTION : YETH_RECOVERY_VAULT,
      data: record.action === "approve" || record.action === "reset"
        ? encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [RECOVERY_AUCTION, BigInt(record.maxShares)] })
        : record.action === "take"
          ? encodeFunctionData({ abi: recoveryAuctionAbi, functionName: "take", args: [RECOVERY_WETH, BigInt(record.requestedWeth ?? "0"), record.account] })
          : encodeFunctionData({ abi: recoveryVaultAbi, functionName: "redeem", args: [BigInt(record.maxShares), record.account, record.account] }),
    };
    const receipt = resolution.receipt;
    const transaction = await client.getTransaction({ hash: receipt.transactionHash });
    if (transaction.hash.toLowerCase() !== receipt.transactionHash.toLowerCase() || transaction.blockNumber !== receipt.blockNumber ||
        transaction.blockHash?.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error("The execution does not match its canonical receipt.");
    if (resolution.safeExecution) validateSafeMinedCall(transaction, expected, resolution.safeExecution);
    else if (record.kind === "safe" || transaction.from.toLowerCase() !== record.account.toLowerCase() ||
        transaction.to?.toLowerCase() !== expected.to.toLowerCase() || transaction.input.toLowerCase() !== expected.data.toLowerCase() ||
        transaction.value !== 0n || (transaction.chainId !== undefined && transaction.chainId !== record.chainId)) {
      throw new Error("The candidate execution does not match the recovery call.");
    }
    await assertCanonical(client, record, receipt);
  };
  const candidateExecution = async (record: RecoveryPending, client: PublicClient, candidate: Hash): Promise<Hash> => {
    if (record.submissionHash || !isRecoveryHash(candidate)) throw new Error("Enter a valid candidate hash for an unidentified submission.");
    const resolution = await resolveRecoveryReceipt(client, { ...record, submissionHash: candidate, hashKind: "unknown" }, await providerFor(record));
    if (resolution.status !== "mined" || !resolution.nonceConsumed) throw new Error("The candidate execution could not be verified. The original submission remains unresolved.");
    await verifyExecutionCall(record, client, resolution);
    return resolution.receipt.transactionHash;
  };
  const refreshPending = async (submissionHash?: Hash, executionHash?: Hash): Promise<RecoveryCompletion | { status: "reconciliation-required"; hash: Hash } | null> => {
    const { client, address } = context();
    const record = getRecoveryPending(environment.chainId, address);
    if (!record || checking.current || record.corrupt || isRecoverySubmissionActive(record.chainId, record.account)) return null;
    checking.current = true;
    try {
      if (submissionHash) {
        const hash = await candidateExecution(record, client, submissionHash);
        return await withRecoveryPendingLock(record.chainId, record.account, async () => {
          context(record.account);
          assertRecoveryPending(record);
          return { status: "reconciliation-required" as const, hash };
        });
      }
      if (!record.submissionHash) return null;
      if (executionHash && !isRecoveryHash(executionHash)) throw new Error("Enter a valid execution transaction hash.");
      const result = await inspect(record, client, await providerFor(record), executionHash);
      if (result) await refresh();
      return result;
    } catch (error) {
      await preserveAttention(record, error instanceof Error ? error.message : "Execution could not be verified. No transaction was resubmitted.");
      return null;
    } finally { checking.current = false; }
  };
  const reconcilePending = async (record: RecoveryPending, submissionHash: Hash | undefined, queueChecked: boolean): Promise<RecoveryCompletion> => {
    if (!queueChecked) throw new Error("Check the wallet queue and recent activity for unresolved duplicate proposals first.");
    const { client } = context(record.account);
    if (record.chainId !== environment.chainId || record.corrupt || record.submissionHash) throw new Error("Only an unidentified submission can be reconciled manually.");
    assertRecoveryPending(record);
    const hash = submissionHash ? await candidateExecution(record, client, submissionHash) : undefined;
    const result: RecoveryCompletion = {
      ...neutralCompletion(record, hash), status: "reconciled",
      error: "Queue review recorded. The original submission outcome remains unknown. No recovery payout was established.",
    };
    await withRecoveryPendingLock(record.chainId, record.account, async () => {
      context(record.account);
      completeRecoveryPending(result);
    });
    await refresh();
    return result;
  };
  const latestNeutral = useRef(neutralCompletion);
  useEffect(() => {
    latestNeutral.current = neutralCompletion;
  });
  const latestOutcome = useRef(resolveOutcome);
  useEffect(() => {
    latestOutcome.current = resolveOutcome;
  });
  useEffect(() => {
    if (
      !storedCompletion ||
      storedCompletion.verified ||
      pending?.id === storedCompletion.id ||
      !publicClient ||
      storedCompletion.account.toLowerCase() !==
        account.address?.toLowerCase() ||
      account.chainId !== environment.chainId
    )
      return;
    let cancelled = false;
    void (async () => {
      try {
        const verified =
          storedCompletion.status === "nonce-consumed" &&
          storedCompletion.intent.kind === "safe"
            ? (await resolveSafeCancellation(
                publicClient,
                storedCompletion.intent,
              ))
              ? latestNeutral.current(storedCompletion.intent)
              : null
            : await latestOutcome.current(
                storedCompletion.intent,
                publicClient,
                undefined,
                storedCompletion.hash,
              );
        if (
          verified &&
          !cancelled &&
          getRecoveryCompletion(environment.chainId, account.address)?.id ===
            storedCompletion.id
        )
          await withRecoveryPendingLock(verified.chainId, verified.account, async () => {
            context(verified.account);
            const current = getRecoveryCompletion(verified.chainId, verified.account);
            if (!cancelled && current?.id === storedCompletion.id && sameRecoveryIntent(current.intent, storedCompletion.intent) && current.hash === storedCompletion.hash && current.status === storedCompletion.status) saveRecoveryCompletion(verified);
          });
      } catch {
        /* An unverified persisted receipt must not be displayed as confirmed. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    storedCompletion,
    pending?.id,
    publicClient,
    account.address,
    account.chainId,
    environment.chainId,
    context,
  ]);
  const latestRefresh = useRef(refreshPending);
  useEffect(() => {
    latestRefresh.current = refreshPending;
  });
  const pendingId = pending?.id;
  useEffect(() => {
    if (
      !pendingId ||
      !account.address ||
      account.chainId !== environment.chainId
    )
      return;
    const timer = setInterval(() => {
      void latestRefresh.current();
    }, 5_000);
    return () => clearInterval(timer);
  }, [pendingId, account.address, account.chainId, environment.chainId]); // A status update must not postpone polling.

  const submit = async (
    action: RecoveryPendingAction,
    maxShares: bigint,
    quote?: RecoveryActionQuote,
    exitMode?: "complete" | "auction",
    exitStep?: RecoveryExitStep,
  ): Promise<RecoveryCompletion | null> => {
    if (exitStep?.shouldContinue && !exitStep.shouldContinue()) throw new Error("The exit was paused.");
    if (exitStep) assertExitWallet(exitStep.wallet);
    const { client, address, connector } = context(exitStep?.wallet.address ?? quote?.address);
    let record: RecoveryPending | undefined;
    let result: RecoveryCompletion | null = null;
    let failure: unknown;
    await lifecycle.execute(
      async () =>
        withRecoverySubmissionLock(environment.chainId, address, async () => {
          const state = await readRecoveryAccount(
            client,
            address,
            environment.chainId,
          );
          let send: () => Promise<Hash>;
          if (action === "approve" && quote) {
            if (
              state.chainId !== quote.chainId ||
              recoveryRound(state.auction) !== quote.round ||
              state.blockTimestamp - quote.quotedAt > 180 ||
              state.blockTimestamp < quote.quotedAt
            )
              throw new Error(
                "The auction quote changed. Review the current offer.",
              );
            if (maxShares <= 0n || maxShares > state.shares)
              throw new Error("Review the current share amount.");
            if (state.allowance !== 0n)
              throw new Error(
                "Reset the existing auction allowance before approving a new amount.",
              );
            const simulation = await simulateContract(recoveryWagmiConfig, {
              address: YETH_RECOVERY_VAULT,
              abi: erc20Abi,
              functionName: "approve",
              args: [RECOVERY_AUCTION, maxShares],
              account: address,
              chainId: environment.chainId,
            });
            send = () => writeContract(recoveryWagmiConfig, simulation.request);
          } else if (action === "reset") {
            const simulation = await simulateContract(recoveryWagmiConfig, {
              address: YETH_RECOVERY_VAULT,
              abi: erc20Abi,
              functionName: "approve",
              args: [RECOVERY_AUCTION, 0n],
              account: address,
              chainId: environment.chainId,
            });
            send = () => writeContract(recoveryWagmiConfig, simulation.request);
          } else if (action === "take" && quote) {
            validateRecoveryTake(state, quote);
            const simulation = await simulateContract(recoveryWagmiConfig, {
              address: RECOVERY_AUCTION,
              abi: recoveryAuctionAbi,
              functionName: "take",
              args: [RECOVERY_WETH, quote.requestedWeth, address],
              account: address,
              chainId: environment.chainId,
            });
            send = () => writeContract(recoveryWagmiConfig, simulation.request);
          } else {
            if (
              maxShares <= 0n ||
              state.shares < maxShares ||
              state.maxRedeem < maxShares
            )
              throw new Error(
                "The vault cannot redeem this share amount now. Refresh your position.",
              );
            const assets = await client.readContract({
              address: YETH_RECOVERY_VAULT,
              abi: recoveryVaultAbi,
              functionName: "previewRedeem",
              args: [maxShares],
              blockNumber: state.blockNumber,
            });
            if (assets <= 0n)
              throw new Error("This redemption would return no WETH.");
            const simulation = await simulateContract(recoveryWagmiConfig, {
              address: YETH_RECOVERY_VAULT,
              abi: recoveryVaultAbi,
              functionName: "redeem",
              args: [maxShares, address, address],
              account: address,
              chainId: environment.chainId,
            });
            send = () => writeContract(recoveryWagmiConfig, simulation.request);
          }
          if (exitStep?.shouldContinue && !exitStep.shouldContinue()) throw new Error("The exit was paused.");
          if (exitStep) assertExitWallet(exitStep.wallet);
          const current = context(address);
          if (current.connector?.id !== connector?.id)
            throw new Error(
              "Your wallet connector changed. Review the transaction again.",
            );
          if (getRecoveryPending(environment.chainId, address))
            throw new Error(
              "A recovery submission is already pending in another tab.",
            );
          const wallet = await walletContext(client);
          context(address);
          if (wallet.account.toLowerCase() !== address.toLowerCase() || wallet.connectorId !== connector?.id) throw new Error("Your wallet changed. Review the transaction again.");
          if (exitStep?.shouldContinue && !exitStep.shouldContinue()) throw new Error("The exit was paused.");
          record = {
            version: 1,
            id: crypto.randomUUID(),
            account: address,
            chainId: environment.chainId,
            connectorId: connector?.id ?? "unknown",
            kind: wallet.kind,
            hashKind: wallet.hashKind,
            action,
            status: "submitting",
            createdAt: Math.floor(Date.now() / 1000),
            submittedBlock: wallet.submittedBlock,
            maxShares: maxShares.toString(),
            requestedWeth: quote?.requestedWeth.toString(),
            exitMode,
            exitOriginalShares: exitStep?.originalShares.toString(),
            exitSequenceId: exitStep?.sequenceId,
          };
          // A reload or uncertain wallet response retains this intent and blocks another write.
          saveRecoveryPending(record);
          let hash: Hash;
          try {
            hash = await send();
          } catch (error) {
            if (isExplicitWalletRejection(error)) clearRecoveryPending(record);
            else
              saveRecoveryPending({ ...record, status: "attention", error: "Wallet submission is unresolved. Check your wallet for a transaction or Safe proposal hash. Do not submit again." }, record);
            throw error;
          }
          if (!isRecoveryHash(hash)) {
            saveRecoveryPending({ ...record, status: "attention", error: "The wallet did not return a valid transaction hash. Check your wallet before continuing." }, record);
            throw new Error("The wallet returned an invalid transaction hash.");
          }
          const beforeResponse = record;
          record = { ...record, submissionHash: hash, status: record.kind === "safe" ? "awaiting-execution" : "mining" };
          // The wallet already sent this call. Keep its identifier even if storage fails now.
          try { saveRecoveryPending(record, beforeResponse); }
          catch {
            retainRecoveryPending({ ...record, status: "attention", error: "The wallet returned a submission hash, but it could not be saved. Keep this page open and check the wallet before retrying." }, beforeResponse);
          }
          return hash;
        }),
      {
        tracking: "domain",
        retries: 0,
        waitForReceipt: async (hash) => {
          if (!record)
            throw new Error("The submitted transaction record is unavailable.");
          try {
            if (record.kind === "transaction" && record.hashKind !== "unknown") {
              record = await captureOriginal(record, client);
              let replacementCapture: Promise<void> | undefined;
              try {
                await client.waitForTransactionReceipt({
                  hash,
                  timeout: 45_000,
                  onReplaced: (replacement) => {
                    // Viem does not await this callback. Preserve and join its work
                    // before inspecting a potentially replaced transaction.
                    replacementCapture = (async () => {
                      if (!record) return;
                      const originalSignedTransaction =
                        await captureRecoveryTransaction(
                          replacement.replacedTransaction,
                          record,
                        );
                      const current = currentRecord(record);
                      if (!current) return;
                      record = await updatePending(current, { originalSignedTransaction, replacementHash: replacement.transaction.hash });
                    })().catch(async () => {
                      if (record)
                        await preserveAttention(
                          record,
                          "The wallet reported a replacement, but its transaction proof could not be verified.",
                        );
                    });
                  },
                });
              } catch {
                /* Canonical status below decides whether this remains pending. */
              }
              await replacementCapture;
            }
            result = await inspect(record, client, await providerFor(record));
            if (result?.status === "failed") throw new Error(result.error);
            if (result?.status === "nonce-consumed") await refresh();
            return result?.status === "confirmed"
              ? result.hash
              : { pending: true };
          } catch (error) {
            if (
              getRecoveryPending(record.chainId, record.account)?.id ===
              record.id
            ) {
              await preserveAttention(
                record,
                "Execution could not be verified. Check the wallet status; no transaction was resubmitted.",
              );
              return { pending: true };
            }
            throw error;
          }
        },
        onError: (error) => {
          failure = error;
        },
        invalidate: refresh,
      },
    );
    if (failure) throw failure;
    return result;
  };
  const restoredState =
    completion && ["idle", "pending"].includes(lifecycle.status)
      ? (completion.status === "nonce-consumed" || completion.status === "reconciled")
        ? { status: "idle" as const }
        : completion.status === "failed"
          ? {
              status: "error" as const,
              hash: completion.hash,
              errorMessage: completion.error,
              errorType: "revert" as const,
            }
          : { status: "success" as const, hash: completion.hash }
      : lifecycle.state;
  const tx = pending
    ? {
        ...lifecycle,
        status: "pending" as const,
        state: { status: "pending" as const },
      }
    : { ...lifecycle, status: restoredState.status, state: restoredState };
  return {
    accountQuery,
    walletPromptActive: lifecycle.status === "signing",
    getExitWallet,
    readExitAccount,
    getExitPending: (wallet: RecoveryExitWallet) => getRecoveryPending(wallet.chainId, wallet.address),
    getExitCompletion: (wallet: RecoveryExitWallet) => getRecoveryCompletion(wallet.chainId, wallet.address),
    submitExitStep: (step: RecoveryExitStep) => {
      if (step.originalShares <= 0n || step.originalShares >= 1n << 256n || step.maxShares < 0n || step.maxShares > step.originalShares) throw new Error("The transaction exceeds the position you reviewed.");
      if ((step.action === "approve" || step.action === "take") && (!step.quote || step.quote.address.toLowerCase() !== step.wallet.address.toLowerCase() || step.quote.chainId !== step.wallet.chainId || step.quote.maxShares !== step.maxShares)) throw new Error("The auction transaction does not match this exit.");
      return submit(step.action, step.maxShares, step.quote, step.mode, step);
    },
    tx,
    receipt,
    completion,
    pending,
    refreshPending,
    reconcilePending,
    refresh,
    dismissCompletion: async () => {
      if (account.address) await withRecoveryPendingLock(environment.chainId, account.address, async () => {
        context(account.address);
        dismissRecoveryCompletion(environment.chainId, account.address!);
      });
    },
    approve: async (quote: RecoveryActionQuote) =>
      (await submit("approve", quote.maxShares, quote))?.hash ?? null,
    resetAllowance: async () => (await submit("reset", 0n))?.hash ?? null,
    take: async (
      quote: RecoveryActionQuote,
      exitMode?: "complete" | "auction",
    ) =>
      (await submit("take", quote.maxShares, quote, exitMode))?.receipt ?? null,
    redeem: async (expectedShares: bigint) =>
      (await submit("redeem", expectedShares))?.receipt ?? null,
    wrongChain: Boolean(
      account.address && account.chainId !== environment.chainId,
    ),
    environment,
  };
}
