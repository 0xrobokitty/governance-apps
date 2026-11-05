"use client";

import { useRef } from "react";
import { useAccount } from "wagmi";
import { useChainModal, useConnectModal } from "@/web3/wallet-ui";
import { Button } from "@/components/ui/Button";
import { useYethRecovery } from "@/lib/hooks/useYethRecovery";
import { useYethRecoveryActions } from "@/lib/hooks/useYethRecoveryActions";
import { useYethRecoveryExit } from "@/lib/hooks/useYethRecoveryExit";
import { buildRecoveryForkSnapshot } from "@/lib/clients/yeth/recovery/fork-fixture";
import { buildRecoverySnapshot } from "@/lib/clients/yeth/recovery/feed";
import {
  createRecoveryActionQuote, type RecoveryAccountState, type RecoveryActionQuote,
} from "@/lib/clients/yeth/recovery/onchain";
import { RecoveryDashboard } from "./RecoveryPreviewClient";
import { recoveryProductionCopy as copy } from "./messages";

export function RecoveryLiveClient() {
  const account = useAccount();
  // Changing identity discards review consent; pending receipts remain scoped to their wallet.
  return <RecoveryLiveSession key={(account.address ?? "disconnected") + ":" + account.chainId} />;
}

function RecoveryLiveSession() {
  const account = useAccount();
  const feed = useYethRecovery();
  const actions = useYethRecoveryActions(feed.data?.head.indexedThrough ? BigInt(feed.data.head.indexedThrough.number) : undefined);
  const exit = useYethRecoveryExit(actions);
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const quoteRef = useRef<{ action: RecoveryActionQuote; round: number } | null>(null);
  const observedChain = actions.accountQuery.data;
  const receipt = actions.receipt;
  // A confirmed receipt wins over a cached pre-transaction balance. Until a newer
  // read succeeds, retain the remaining shares but disable another transaction.
  const receiptAdjustedChain = observedChain && receipt && observedChain.blockNumber < receipt.blockNumber
    ? { ...observedChain, shares: receipt.remainingShares, blockTimestamp: 0 }
    : observedChain;
  const chain = receiptAdjustedChain && actions.accountQuery.error
    ? { ...receiptAdjustedChain, blockTimestamp: 0 }
    : receiptAdjustedChain;
  const snapshotFrom = (observation?: RecoveryAccountState) => feed.data ? (actions.environment.fork ? buildRecoveryForkSnapshot : buildRecoverySnapshot)(feed.data, {
    now: feed.now,
    chainId: account.chainId,
    observedAt: actions.accountQuery.dataUpdatedAt / 1000,
    address: account.address,
    chain: observation ? { ...observation, auction: observation.auction ?? {
      kickedAt: 0, initialWeth: 0n, remainingWeth: 0n, startingPrice: 0n,
      minimumPrice: 0n, stepDuration: 1, stepDecayBps: 0, length: 0,
    } } : undefined,
  }) : null;
  const snapshot = snapshotFrom(chain);
  const currentQuote = (shares: bigint, round?: number) => {
    const stored = quoteRef.current;
    if (!stored || stored.action.maxShares !== shares || (round !== undefined && stored.round !== round)) {
      throw new Error(copy.reviewAgain);
    }
    return stored.action;
  };
  const reason = actions.wrongChain ? copy.wrongChain : chain && chain.shares > chain.maxRedeem ? copy.limitedRedemption : snapshot?.live?.chainFresh && chain && chain.shares > 2n ? snapshot.live.principalUnavailableReason : null;
  const canTransact = Boolean(account.address && !actions.wrongChain && chain && snapshot?.live?.chainFresh && !actions.pending);
  return <RecoveryDashboard mode={actions.environment.fork ? "fork" : "live"} connect={
    !account.address || actions.wrongChain ? <Button variant="secondary" onClick={() => actions.wrongChain ? openChainModal?.() : openConnectModal?.()}>
      {actions.wrongChain ? copy.switchNetwork : copy.connect}
    </Button> : null
  } controller={{
    snapshot,
    error: feed.error?.message ?? actions.accountQuery.error?.message ?? null,
    unavailableReason: reason,
    canTransact,
    canRedeem: Boolean(chain && chain.maxRedeem >= chain.shares && chain.shares > 0n),
    tx: actions.tx,
    walletPromptActive: actions.walletPromptActive,
    exit: {
      state: exit.state, continue: exit.continue, pause: exit.pause,
      start: async request => {
        const quote = request.weth !== undefined && request.maxShares !== undefined
          ? currentQuote(request.maxShares, request.round) : undefined;
        if (quote && (request.weth === undefined || request.weth <= 0n || request.weth > quote.requestedWeth)) throw new Error(copy.reviewAgain);
        await exit.start({ quote: quote ? { ...quote, requestedWeth: request.weth! } : undefined, mode: request.mode, originalShares: request.originalShares });
      },
    },
    pendingExecution: actions.pending,
    completion: actions.wrongChain ? null : actions.completion,
    refreshPending: actions.refreshPending,
    refresh: () => Promise.all([feed.refetch(), ...(account.address ? [actions.accountQuery.refetch()] : [])]),
    reviewAuction: async (weth, shares, round) => {
      const result = await actions.accountQuery.refetch();
      if (result.error || !result.data) throw result.error ?? new Error(copy.reviewAgain);
      if (result.data.auction?.kickedAt !== round) throw new Error(copy.reviewAgain);
      const action = createRecoveryActionQuote(result.data, { requestedWeth: weth, maxShares: shares, reuseAllowance: true });
      quoteRef.current = { action, round };
      return { weth: action.requestedWeth, shares: action.maxShares, round, originalShares: result.data.shares };
    },
    allowanceNeedsReset: shares => Boolean(chain && chain.allowance > 0n && chain.allowance !== shares),
    resetAllowance: actions.resetAllowance,
    approve: shares => actions.approve(currentQuote(shares)),
    take: async (weth, shares, round, exitMode) => {
      const quote = currentQuote(shares, round);
      if (weth > quote.requestedWeth) throw new Error(copy.reviewAgain);
      if (weth <= 0n) throw new Error(copy.reviewAgain);
      const confirmed = await actions.take({ ...quote, requestedWeth: weth }, exitMode);
      if (!confirmed) return null;
      quoteRef.current = null;
      const refreshed = await actions.accountQuery.refetch();
      const observation = !refreshed.error && refreshed.data && refreshed.data.blockNumber >= confirmed.blockNumber
        ? refreshed.data
        : chain ? { ...chain, shares: confirmed.remainingShares, blockTimestamp: 0 } : undefined;
      const next = snapshotFrom(observation);
      if (!next) throw new Error(copy.confirmedRefresh);
      return { snapshot: next, received: confirmed.wethReceived, hash: confirmed.hash };
    },
    redeem: async shares => Boolean(await actions.redeem(shares)),
  }} />;
}
