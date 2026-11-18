// lib/tx/useTx.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PreparedTransaction,
  TransactionHash,
  TxErrorType,
  TxState,
} from "./types";
import { waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import { toast } from "@/components/ui/Toast";
import { normalizeTxError } from "./errors";
import { useProtocol } from "@/state/protocol";
import { isSimulationTransportFallbackEnabled } from "@/lib/runtime/features";

import { findTrackedSubmission, PendingSubmissionError, subscribeTrackedCompletions, type TrackedCompletion, type TrackedSubmission } from "./pending-transactions";
import { checkTrackedSubmission, readConnectedIdentity } from "./tracked-write";

type TxExecuteOptions = {
  tracking?: "domain";
  onSubmitted?: (hash: TransactionHash) => void | Promise<void>;
  waitForReceipt?: (hash: TransactionHash) => Promise<void | TransactionHash | { pending: true }>;
  onSuccess?: (hash: TransactionHash) => void | Promise<void>;
  onError?: (error: unknown, hash?: TransactionHash) => void | Promise<void>;
  invalidate?: () => void | Promise<void>;
  skipWaitForReceipt?: boolean;
  retries?: number;
  retryDelayMs?: number;
  submittedMessage?: string;
};

type PendingOwner = { id: string; generation: number; options?: TxExecuteOptions; settled: boolean; completion?: Promise<void> };

const initialState: TxState = {
  status: "idle",
};

function mapNormalizedCode(code: string): TxErrorType {
  switch (code) {
    case "user_rejected":
      return "user_rejected";
    case "cooldown_not_ready":
      return "cooldown_not_ready";
    case "cap_exceeded":
      return "cap_exceeded";
    case "insufficient_balance":
      return "insufficient_balance";
    case "network":
      return "network";
    case "revert":
      return "revert";
    default:
      return "unknown";
  }
}

export function useTx() {
  const [state, setState] = useState<TxState>(initialState);
  const { publicClient } = useProtocol();
  const running = useRef(false);
  const generation = useRef(0);
  const pending = useRef<PendingOwner | null>(null);
  useEffect(() => subscribeTrackedCompletions((completion: TrackedCompletion) => {
    const owner = pending.current;
    if (!owner || owner.id !== completion.submission.id) return;
    owner.settled = true;
    pending.current = null;
    owner.completion = (async () => {
      try { await owner.options?.invalidate?.(); } catch (error) { console.error("[tx] Confirmed transaction refresh failed.", error); }
      const identity = readConnectedIdentity();
      if (owner.generation !== generation.current || identity.account?.toLowerCase() !== completion.submission.account.toLowerCase() || identity.chainId !== completion.submission.chainId) return;
      if (completion.outcome === "confirmed" && completion.hash) {
        setState({ status: "success", hash: completion.hash });
        try { await owner.options?.onSuccess?.(completion.hash); } catch (error) { console.error("[tx] Confirmed transaction observer failed.", error); }
      } else {
        const message = completion.outcome === "nonce-consumed"
          ? "The Safe nonce was consumed. This proposal cannot execute again; its action outcome was not verified."
          : completion.outcome === "reconciled"
            ? "Queue review recorded. The original submission outcome remains unknown."
            : "The wallet execution reverted.";
        setState({ status: "error", hash: completion.hash, errorType: completion.outcome === "failed" ? "revert" : "unknown", errorMessage: message });
        try { await owner.options?.onError?.(new Error(message), completion.hash); } catch (error) { console.error("[tx] Transaction observer failed.", error); }
      }
    })();
    void owner.completion;
  }), []);
  const txTransportFallbackEnabled = isSimulationTransportFallbackEnabled();

  const reset = useCallback(() => {
    generation.current += 1;
    setState(initialState);
  }, []);

  const execute = useCallback(
    async (prepared: PreparedTransaction, options?: TxExecuteOptions) => {
      // React state updates are asynchronous. Fence a second click immediately,
      // including while reset hides the status of a transaction still in flight.
      if (!prepared || running.current) return;
      running.current = true;
      const execution = ++generation.current;
      let trackedOwner: TrackedSubmission | undefined;
      let observerOwner: PendingOwner | undefined;
      const ownsCurrentWallet = () => {
        if (!trackedOwner) return true;
        const identity = readConnectedIdentity();
        return identity.account?.toLowerCase() === trackedOwner.account.toLowerCase() && identity.chainId === trackedOwner.chainId;
      };
      const updateState = (next: TxState) => {
        if (generation.current === execution && ownsCurrentWallet()) setState(next);
      };
      const callbackErrors: unknown[] = [];
      const notify = async (callback: (() => void | Promise<void>) | undefined) => {
        try {
          await callback?.();
        } catch (error) {
          callbackErrors.push(error);
          console.error("[tx] Transaction lifecycle callback failed.", error);
        }
      };

      let hash: TransactionHash | undefined;
      const toastId = toast.loading("Check your wallet...");
      const maxRetries = Math.max(0, options?.retries ?? 0);
      const retryDelay = Math.max(0, options?.retryDelayMs ?? 750);
      let attempt = 0;

      const attemptExecute = async () => {
        try {
          updateState({
            status: "signing",
          });

          hash = await prepared();

          trackedOwner = options?.tracking !== "domain" ? findTrackedSubmission(hash) : undefined;
          if (trackedOwner) {
            observerOwner = { id: trackedOwner.id, generation: execution, options, settled: false };
            pending.current = observerOwner;
          }
          updateState({
            status: "submitted",
            hash: trackedOwner || options?.tracking === "domain" ? undefined : hash,
            submissionHash: trackedOwner || options?.tracking === "domain" ? hash : undefined,
          });

          await notify(options?.onSubmitted ? () => options.onSubmitted!(hash!) : undefined);
          if (observerOwner?.settled) {
            toast.dismiss(toastId);
            await observerOwner.completion;
            return;
          }

          if (options?.skipWaitForReceipt) {
            toast.success(
              options.submittedMessage ?? "Transaction submitted (Mock)",
              { id: toastId }
            );
          } else {
            toast.loading("Transaction submitted. Waiting...", { id: toastId });
            updateState({
              status: trackedOwner ? "pending" : "mining",
              hash: trackedOwner || options?.tracking === "domain" ? undefined : hash,
              submissionHash: trackedOwner || options?.tracking === "domain" ? hash : undefined,
            });

            if (options?.waitForReceipt) {
              const waited = await options.waitForReceipt(hash);
              if (waited && typeof waited === "object" && waited.pending) {
                toast.dismiss(toastId);
                updateState({ status: "pending" });
                return;
              }
              if (typeof waited === "string") hash = waited;
            } else if (trackedOwner) {
              const tracked = trackedOwner;
              let checked;
              try { checked = await checkTrackedSubmission(tracked); }
              catch (error) { checked = { status: "pending" as const, error: error instanceof Error ? error.message : "Execution could not be verified." }; }
              if (observerOwner?.settled) {
                toast.dismiss(toastId);
                await observerOwner.completion;
                return;
              }
              if (checked.status === "pending" || checked.status === "reconciliation-required") {
                updateState({ status: "pending", pendingId: tracked.id, submissionHash: hash, errorMessage: checked.status === "pending" ? checked.error : "Check the wallet queue before reconciling this submission." });
                toast.dismiss(toastId);
                return;
              }
              hash = checked.hash;
              if (checked.status === "failed") throw new Error("Transaction reverted.");
            } else {
              let replacementReason: string | undefined;
              const receiptOptions = {
                hash,
                onReplaced: ({ reason }: { reason: string }) => {
                  replacementReason = reason;
                },
              };
              const receipt = await (async () => {
                if (!publicClient) return waitForTransactionReceipt(wagmiConfig, receiptOptions);
                try {
                  return await publicClient.waitForTransactionReceipt(receiptOptions);
                } catch (waitError) {
                  const normalizedWaitError = normalizeTxError(waitError);
                  if (!(txTransportFallbackEnabled && normalizedWaitError.code === "network")) {
                    throw waitError;
                  }
                  console.warn(
                    "[tx] Wallet RPC receipt wait failed; falling back to configured app RPC.",
                    waitError
                  );
                  return waitForTransactionReceipt(wagmiConfig, receiptOptions);
                }
              })();
              hash = receipt.transactionHash;
              if (receipt.status !== "success") throw new Error("Transaction reverted.");
              if (replacementReason === "cancelled") throw new Error("Transaction cancelled by a replacement.");
              if (replacementReason === "replaced") throw new Error("Transaction replaced by a different transaction.");
            }
            toast.success("Transaction confirmed!", { id: toastId });
          }

          // The receipt determines the chain outcome. A failed refresh or UI
          // callback cannot turn a confirmed write into a failed transaction.
          updateState({ status: "success", hash });
          await notify(options?.invalidate);
          if (generation.current === execution && ownsCurrentWallet()) {
            await notify(options?.onSuccess ? () => options.onSuccess!(hash!) : undefined);
          }
          if (callbackErrors.length > 0) {
            toast.error("Transaction confirmed, but the app could not update. Refresh to check the latest state.", { id: toastId });
          }
        } catch (error: unknown) {
          if (error instanceof PendingSubmissionError) {
            trackedOwner = error.submission;
            pending.current = { id: error.submission.id, generation: execution, options, settled: false };
            updateState({ status: "pending", pendingId: error.submission.id, submissionHash: error.submission.submissionHash, errorMessage: error.message });
            toast.dismiss(toastId);
            return;
          }
          const normalized = normalizeTxError(error);
          const errorType = mapNormalizedCode(normalized.code);

          // Retry once for network errors if configured
          if (!hash && normalized.code === "network" && attempt < maxRetries) {
            attempt += 1;
            await new Promise((r) => setTimeout(r, retryDelay));
            return attemptExecute();
          }

          const errorMessage = normalized.message || "Transaction failed";

          if (errorType === "user_rejected") {
            toast.dismiss(toastId);
          } else {
            toast.error(errorMessage, { id: toastId });
          }

          updateState({
            status: "error",
            hash: options?.tracking === "domain" ? undefined : hash,
            submissionHash: options?.tracking === "domain" ? hash : undefined,
            errorType,
            errorMessage,
          });

          if (generation.current === execution && ownsCurrentWallet()) {
            await notify(options?.onError ? () => options.onError!(error, hash) : undefined);
          }
        }
      };

      try {
        await attemptExecute();
      } finally {
        running.current = false;
      }
    },
    [publicClient, txTransportFallbackEnabled]
  );

  return {
    state,
    status: state.status,
    execute,
    reset,
  };
}
