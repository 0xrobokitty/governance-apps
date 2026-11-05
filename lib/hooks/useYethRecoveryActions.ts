"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, type Address, type Hash, type PublicClient } from "viem";
import { useAccount, usePublicClient, type Config } from "wagmi";
import { getAccount, simulateContract, writeContract } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import { useTx } from "@/lib/tx/useTx";
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
function explicitlyRejected(error: unknown): boolean {
  let current = error;
  for (let i = 0; i < 6 && current && typeof current === "object"; i++) {
    const value = current as { code?: number; name?: string; cause?: unknown };
    if (value.code === 4001 || value.name === "UserRejectedRequestError")
      return true;
    current = value.cause;
  }
  return false;
}
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
  const context = (expected?: Address) => {
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
  };
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
  const providerFor = async (
    record: RecoveryPending,
  ): Promise<RecoveryWalletProvider | undefined> => {
    const { connector } = context(record.account);
    if (record.kind === "safe" && connector?.id !== "safe") return undefined;
    if (!connector?.getProvider) return undefined;
    const provider = await connector.getProvider();
    if (
      !provider ||
      typeof (provider as RecoveryWalletProvider).request !== "function"
    )
      throw new Error("The Safe provider is unavailable.");
    return provider as RecoveryWalletProvider;
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
    return current?.id === record.id &&
      current.submissionHash === record.submissionHash &&
      current.replacementHash === record.replacementHash &&
      current.originalSignedTransaction === record.originalSignedTransaction
      ? current
      : null;
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
      const replacement = await resolveRecoveryReplacement(
        client,
        record,
        record.originalSignedTransaction,
        record.replacementHash,
      );
      if (replacement.status === "nonce-consumed")
        return neutralCompletion(record, replacement.receipt.transactionHash);
      try {
        return await prove(record, client, {
          status: "mined",
          receipt: replacement.receipt,
          failed: replacement.receipt.status !== "success",
          nonceConsumed: true,
        });
      } catch {
        return neutralCompletion(record, replacement.receipt.transactionHash);
      }
    }
    const resolution = await resolveRecoveryReceipt(
      client,
      record,
      provider,
      verificationHash,
    );
    if (resolution.status === "mined") {
      try {
        return await prove(record, client, resolution);
      } catch (error) {
        // Execution can be final while its financial outcome is unproved,
        // for example an approval followed by spending in the same block.
        if (resolution.nonceConsumed)
          return neutralCompletion(record, resolution.receipt.transactionHash);
        throw error;
      }
    }
    if (record.kind === "safe" && resolution.error) {
      try {
        if (await resolveSafeCancellation(client, record))
          return neutralCompletion(record);
      } catch {
        /* Unverified SDK metadata cannot release a queued proposal. */
      }
    }
    if (record.kind === "transaction" && record.originalSignedTransaction) {
      try {
        if (
          await resolveRecoveryTransactionNonce(
            client,
            record,
            record.originalSignedTransaction,
          )
        )
          return neutralCompletion(record);
      } catch {
        /* Keep unknown nonce/replacement states pending. */
      }
    }
    const current = currentRecord(record);
    if (current)
      saveRecoveryPending({
        ...current,
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
      const captured = { ...current, originalSignedTransaction };
      saveRecoveryPending(captured);
      return captured;
    } catch {
      return record;
    } // Opaque proposal IDs are not normal Ethereum hashes.
  };
  const inspect = async (
    record: RecoveryPending,
    client: PublicClient,
    provider?: RecoveryWalletProvider,
  ): Promise<RecoveryCompletion | null> => {
    const latest = getRecoveryPending(record.chainId, record.account);
    if (
      latest?.id === record.id &&
      latest.submissionHash === record.submissionHash
    )
      record = latest;
    record = await captureOriginal(record, client);
    if (!currentRecord(record)) return priorResult(record);
    const result = await resolveOutcome(record, client, provider);
    if (!currentRecord(record)) return priorResult(record);
    if (!result) return null;
    saveRecoveryCompletion(result);
    clearRecoveryPending(record);
    return result;
  };
  const preserveAttention = (record: RecoveryPending, message: string) => {
    const current = currentRecord(record);
    if (current)
      saveRecoveryPending({ ...current, status: "attention", error: message });
  };
  const refreshPending = async (
    submissionHash?: Hash,
  ): Promise<RecoveryCompletion | null> => {
    const { client, address } = context();
    let record = getRecoveryPending(environment.chainId, address);
    if (!record || checking.current || record.corrupt) return null;
    if (
      !record.submissionHash &&
      isRecoverySubmissionActive(record.chainId, record.account)
    )
      return null;
    checking.current = true;
    try {
      if (submissionHash) {
        if (record.submissionHash || !isRecoveryHash(submissionHash))
          throw new Error(
            "Only an unknown submission can be linked to a valid wallet hash.",
          );
        record = { ...record, submissionHash };
        saveRecoveryPending(record);
      }
      const result = await inspect(record, client, await providerFor(record));
      if (result) await refresh();
      return result;
    } catch {
      preserveAttention(
        record,
        "Execution could not be verified. No transaction was resubmitted. Check this transaction in your wallet and refresh its status.",
      );
      return null;
    } finally {
      checking.current = false;
    }
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
          saveRecoveryCompletion(verified);
      } catch {
        /* An unverified persisted receipt must not be displayed as confirmed. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    storedCompletion,
    publicClient,
    account.address,
    account.chainId,
    environment.chainId,
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
          record = {
            version: 1,
            id: crypto.randomUUID(),
            account: address,
            chainId: environment.chainId,
            connectorId: connector?.id ?? "unknown",
            kind: connector?.id === "safe" ? "safe" : "transaction",
            action,
            status: "submitting",
            createdAt: Math.floor(Date.now() / 1000),
            submittedBlock: state.blockNumber.toString(),
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
            if (explicitlyRejected(error)) clearRecoveryPending(record);
            else
              preserveAttention(
                record,
                "Wallet submission is unresolved. Check your wallet for a transaction or Safe proposal hash. Do not submit again.",
              );
            throw error;
          }
          if (!isRecoveryHash(hash)) {
            preserveAttention(
              record,
              "The wallet did not return a valid transaction hash. Check your wallet before continuing.",
            );
            throw new Error("The wallet returned an invalid transaction hash.");
          }
          record = {
            ...record,
            submissionHash: hash,
            status: record.kind === "safe" ? "awaiting-execution" : "mining",
          };
          saveRecoveryPending(record);
          return hash;
        }),
      {
        retries: 0,
        waitForReceipt: async (hash) => {
          if (!record)
            throw new Error("The submitted transaction record is unavailable.");
          try {
            if (record.kind === "transaction") {
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
                      record = {
                        ...current,
                        originalSignedTransaction,
                        replacementHash: replacement.transaction.hash,
                      };
                      saveRecoveryPending(record);
                    })().catch(() => {
                      if (record)
                        preserveAttention(
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
              preserveAttention(
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
      ? completion.status === "nonce-consumed"
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
    refresh,
    dismissCompletion: () => {
      if (account.address)
        dismissRecoveryCompletion(environment.chainId, account.address);
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
