"use client";

import { useEffect, useRef, useState } from "react";
import type { Hash } from "viem";
import { normalizeTxError } from "@/lib/tx/errors";
import {
  createRecoveryActionQuote, recoveryAllowanceNeedsReset, recoveryRound,
  type RecoveryActionQuote, type RecoveryActionReceipt,
} from "@/lib/clients/yeth/recovery/onchain";
import type { RecoveryCompletion, RecoveryPendingAction } from "@/lib/clients/yeth/recovery/pending";
import type { RecoveryExitStep, RecoveryExitWallet, useYethRecoveryActions } from "./useYethRecoveryActions";

export type RecoveryExitRequest = {
  quote?: RecoveryActionQuote;
  mode: "complete" | "auction";
  originalShares: bigint;
};
export type RecoveryExitState = {
  phase: "idle" | "approval" | "take" | "redeem" | "awaiting" | "paused" | "complete";
  step: RecoveryPendingAction | null;
  mode: "complete" | "auction";
  originalShares: bigint;
  remainingShares: bigint;
  receivedWeth: bigint;
  hash?: Hash;
  error?: string;
  canContinue: boolean;
};
type Actions = Pick<ReturnType<typeof useYethRecoveryActions>,
  "getExitWallet" | "readExitAccount" | "getExitPending" | "getExitCompletion" |
  "submitExitStep" | "refreshPending" | "completion" | "pending">;
type Intent = RecoveryExitRequest & {
  id: string;
  wallet: RecoveryExitWallet;
  auto: boolean;
  waitingId?: string;
  receipt?: RecoveryActionReceipt;
  allowanceConfirmed: boolean;
  resetConfirmed: boolean;
  stopped: boolean;
};
const initial: RecoveryExitState = {
  phase: "idle", step: null, mode: "complete", originalShares: 0n,
  remainingShares: 0n, receivedWeth: 0n, canContinue: false,
};
const min = (a: bigint, b: bigint) => a < b ? a : b;
const sameWallet = (a: RecoveryExitWallet, b: RecoveryExitWallet) =>
  a.address.toLowerCase() === b.address.toLowerCase() && a.chainId === b.chainId && a.connectorId === b.connectorId;

function flowError(error: unknown): string {
  // Viem wraps wallet rejections in contract errors. Inspect causes without
  // rendering request calldata, provider diagnostics, documentation or versions.
  let cause = error;
  for (let depth = 0; depth < 6 && cause && typeof cause === "object"; depth++) {
    const entry = cause as { code?: number; name?: string; cause?: unknown };
    if (entry.code === 4001 || entry.name === "UserRejectedRequestError") return "Transaction cancelled.";
    cause = entry.cause;
  }
  const normalized = normalizeTxError(error);
  if (normalized.code === "user_rejected") return normalized.message;
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : undefined;
  const domainMessage = message && message.length <= 240 && !/[\r\n]/.test(message) &&
    /^(Your wallet|Connect |Reconnect |Review |The vault|The auction|The confirmed|The wallet|The transaction|The receipt|The recovery|The Safe|The exit|This submission|This receipt|This quote|This auction|Ethereum data|The latest block|Approve |Reset |No auction|Wallet submission)/.test(message) &&
    !/(Request Arguments|Contract Call|Docs:|Version:|0x[0-9a-fA-F]{40})/.test(message);
  if (domainMessage) return message;
  if (normalized.code !== "unknown") return normalized.message;
  return "Exit paused. Check your wallet before continuing.";
}

/** One consented exit, with separate wallet signatures and canonical receipts.
 * An in-memory intent permits automatic next steps. Stored progress never does. */
export function useYethRecoveryExit(actions: Actions) {
  const [state, setState] = useState<RecoveryExitState>(initial);
  const latest = useRef(actions);
  const intentRef = useRef<Intent | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const driveRef = useRef<() => Promise<void>>(async () => undefined);
  const restored = useRef<string | null>(null);
  const consumeRef = useRef<(intent: Intent, result: RecoveryCompletion) => void>(() => undefined);
  const current = (intent: Intent) => mounted.current && intentRef.current === intent;
  const update = (intent: Intent, patch: Partial<RecoveryExitState>) => {
    if (current(intent)) setState(previous => ({ ...previous, ...patch }));
  };
  const pauseWith = (intent: Intent, error?: unknown, retry = true) => {
    intent.auto = false;
    if (!retry) intent.stopped = true;
    update(intent, { phase: "paused", error: error === undefined ? undefined : flowError(error), canContinue: retry });
  };
  const checkWallet = (intent: Intent) => {
    if (!sameWallet(latest.current.getExitWallet(), intent.wallet)) {
      throw new Error("Your wallet or network changed. Continue from the original wallet.");
    }
  };
  const consume = (intent: Intent, result: RecoveryCompletion) => {
    if (!current(intent)) return;
    if (result.intent.exitSequenceId !== intent.id) throw new Error("This receipt belongs to a different exit.");
    intent.waitingId = undefined;
    if (result.status !== "confirmed") {
      pauseWith(intent, result.error ?? "The transaction outcome is not confirmed. Review your current position.", result.status === "failed");
      return;
    }
    if (result.action === "reset") intent.resetConfirmed = true;
    if (result.action === "approve") intent.allowanceConfirmed = true;
    if (result.action === "take") {
      if (!result.receipt || result.receipt.sharesSpent > intent.originalShares) throw new Error("The auction receipt does not match this exit.");
      intent.receipt = result.receipt;
      update(intent, { receivedWeth: result.receipt.wethReceived, remainingShares: intent.originalShares - result.receipt.sharesSpent, hash: result.hash });
      if (intent.mode === "auction") {
        intent.auto = false;
        intent.stopped = true;
        update(intent, { phase: "complete", step: null, canContinue: false });
      }
    }
    if (result.action === "redeem") {
      if (!result.receipt) throw new Error("The redemption receipt is not confirmed.");
      intent.auto = false;
      intent.stopped = true;
      update(intent, {
        phase: "complete", step: null, canContinue: false, remainingShares: 0n,
        receivedWeth: (intent.receipt?.wethReceived ?? 0n) + result.receipt.wethReceived,
        hash: result.hash,
      });
    }
  };
  const drive = async () => {
    const intent = intentRef.current;
    if (!intent || !intent.auto || intent.stopped || running.current || !mounted.current) return;
    running.current = true;
    try {
      for (let steps = 0; steps < 5 && current(intent) && intent.auto; steps++) {
        checkWallet(intent);
        if (intent.waitingId) {
          const completed = latest.current.getExitCompletion(intent.wallet);
          if (completed?.verified && completed.id === intent.waitingId) {
            consume(intent, completed);
            if (!intent.auto) break;
          } else {
            update(intent, { phase: "awaiting", canContinue: false });
            break;
          }
        }
        const chain = await latest.current.readExitAccount(intent.wallet, intent.receipt?.blockNumber);
        if (!current(intent) || !intent.auto) break;
        checkWallet(intent);
        const cap = intent.originalShares - (intent.receipt?.sharesSpent ?? 0n);
        let step: RecoveryExitStep;
        if (intent.quote && !intent.receipt) {
          const original = intent.quote;
          if (recoveryRound(chain.auction) !== original.round || chain.auctionPrice > original.price) {
            pauseWith(intent, "The auction offer changed. Review the current offer.", false);
            break;
          }
          const budget = min(original.maxShares, chain.shares);
          const affordable = chain.auctionPrice > 0n ? budget * 10n ** 18n / chain.auctionPrice : 0n;
          const weth = min(original.requestedWeth, min(chain.auction?.remainingWeth ?? 0n, affordable));
          // Renew freshness only inside the original round, price and share bounds.
          const quote = createRecoveryActionQuote(chain, {
            requestedWeth: weth, maxShares: budget,
            reuseAllowance: chain.allowance <= original.maxShares,
          });
          if (quote.maxShares > original.maxShares) throw new Error("The approval exceeds the shares you reviewed.");
          const reset = recoveryAllowanceNeedsReset(chain, quote);
          const approve = chain.allowance === 0n;
          if ((reset && intent.resetConfirmed) || ((reset || approve) && intent.allowanceConfirmed)) {
            pauseWith(intent, "The confirmed allowance has changed or is still updating. Review the current offer.", false);
            break;
          }
          step = {
            action: reset ? "reset" : approve ? "approve" : "take",
            maxShares: reset ? 0n : quote.maxShares, quote, wallet: intent.wallet,
            mode: intent.mode, originalShares: intent.originalShares, sequenceId: intent.id,
            shouldContinue: () => current(intent) && intent.auto,
          };
        } else {
          const shares = min(cap, chain.shares);
          update(intent, { remainingShares: shares });
          if (shares <= 2n) {
            intent.auto = false;
            intent.stopped = true;
            update(intent, { phase: "complete", step: null, canContinue: false });
            break;
          }
          if (chain.maxRedeem < shares) throw new Error("The vault cannot redeem the remaining shares yet. Continue when withdrawals are available.");
          step = {
            action: "redeem", maxShares: shares, wallet: intent.wallet,
            mode: intent.mode, originalShares: intent.originalShares, sequenceId: intent.id,
            shouldContinue: () => current(intent) && intent.auto,
          };
        }
        update(intent, { phase: step.action === "reset" || step.action === "approve" ? "approval" : step.action, step: step.action, error: undefined, canContinue: false });
        const result = await latest.current.submitExitStep(step);
        if (!current(intent)) break;
        if (result) consume(intent, result);
        else {
          const pending = latest.current.getExitPending(intent.wallet);
          const completed = latest.current.getExitCompletion(intent.wallet);
          if (pending?.exitSequenceId === intent.id) {
            intent.waitingId = pending.id;
            update(intent, { phase: intent.auto ? "awaiting" : "paused", canContinue: !intent.auto });
            break;
          }
          if (completed?.verified && completed.intent.exitSequenceId === intent.id && completed.action === step.action) consume(intent, completed);
          else throw new Error("The wallet submission is still being checked. Continue after its status is verified.");
        }
      }
    } catch (error) {
      if (current(intent)) {
        const pending = latest.current.getExitPending(intent.wallet);
        if (pending?.exitSequenceId === intent.id) intent.waitingId = pending.id;
        pauseWith(intent, error);
      }
    } finally {
      running.current = false;
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (intentRef.current) intentRef.current.auto = false;
    };
  }, []);
  useEffect(() => {
    latest.current = actions;
    driveRef.current = drive;
    consumeRef.current = consume;
  });
  useEffect(() => {
    const intent = intentRef.current;
    if (intent?.waitingId) {
      const completed = latest.current.completion;
      if (!intent.auto && completed?.verified && completed.id === intent.waitingId) consumeRef.current(intent, completed);
      else if (intent.auto) void driveRef.current();
    }
    if (intent) return;
    const completed = latest.current.completion;
    if (!completed?.verified || completed.status !== "confirmed" || completed.action !== "take" ||
        completed.exitMode !== "complete" || !completed.receipt || !completed.intent.exitOriginalShares ||
        !completed.intent.exitSequenceId || restored.current === completed.id) return;
    const originalShares = BigInt(completed.intent.exitOriginalShares);
    if (originalShares < completed.receipt.sharesSpent) return;
    restored.current = completed.id;
    const restoredIntent: Intent = {
      id: completed.intent.exitSequenceId, wallet: {
        address: completed.account, chainId: completed.chainId, connectorId: completed.intent.connectorId,
      }, mode: "complete", originalShares, receipt: completed.receipt,
      auto: false, allowanceConfirmed: true, resetConfirmed: false, stopped: false,
    };
    const pending = latest.current.getExitPending(restoredIntent.wallet);
    if (pending?.exitSequenceId === restoredIntent.id) restoredIntent.waitingId = pending.id;
    intentRef.current = restoredIntent;
    setState({
      phase: restoredIntent.waitingId ? "awaiting" : "paused", step: "redeem", mode: "complete", originalShares,
      remainingShares: originalShares - completed.receipt.sharesSpent,
      receivedWeth: completed.receipt.wethReceived, hash: completed.hash, canContinue: !restoredIntent.waitingId,
    });
  }, [actions.completion, actions.pending]); // Never auto-run from restored progress.

  return {
    state,
    start: async (request: RecoveryExitRequest) => {
      if (running.current || latest.current.pending) throw new Error("A recovery transaction is already pending.");
      if (request.originalShares <= 0n || request.originalShares >= 1n << 256n) throw new Error("Review your current share amount.");
      const wallet = latest.current.getExitWallet();
      if (latest.current.getExitPending(wallet)) throw new Error("A recovery transaction is already pending.");
      if (request.quote && (request.quote.address.toLowerCase() !== wallet.address.toLowerCase() ||
          request.quote.chainId !== wallet.chainId || request.quote.maxShares > request.originalShares)) throw new Error("The auction review no longer matches this position.");
      const intent: Intent = { ...request, quote: request.quote ? { ...request.quote } : undefined, wallet, id: crypto.randomUUID(), auto: true, allowanceConfirmed: false, resetConfirmed: false, stopped: false };
      intentRef.current = intent;
      setState({ ...initial, phase: request.quote ? "approval" : "redeem", mode: request.mode, originalShares: request.originalShares, remainingShares: request.originalShares });
      await drive();
    },
    continue: async () => {
      const intent = intentRef.current;
      if (!intent || intent.stopped || running.current) return;
      intent.auto = true;
      update(intent, { error: undefined, canContinue: false });
      if (intent.waitingId) {
        try { await latest.current.refreshPending(); }
        catch (error) {
          if (current(intent)) pauseWith(intent, error);
          return;
        }
      }
      await drive();
    },
    pause: () => {
      const intent = intentRef.current;
      if (intent && !intent.stopped) pauseWith(intent);
    },
  };
}
