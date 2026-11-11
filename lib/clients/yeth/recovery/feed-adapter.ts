import { normalizedRecovery, WAD } from "./model";
import type { RecoveryAuction, RecoverySnapshot } from "./types";
import type { RecoveryFeedData } from "./feed-schema";

export type RecoveryChainObservation = {
  address?: string; blockTimestamp: number; shares: bigint; allowance: bigint; wethBalance: bigint;
  directAssets: bigint; maxRedeem: bigint; vaultPps: bigint; recoveryRate: bigint; auction: RecoveryAuction | null;
  positionTransfersSinceIndexed?: boolean;
};
const ratio = (value: string) => Number(BigInt(value)) / 1e18;
const fresh = (now: number, at: number, age: number) => at <= now + 60 && now - at <= age;
export function buildRecoverySnapshot(data: RecoveryFeedData, options: {
  now: number;
  /** Isolated fork auction/observation clock; production uses now. */
  chainNow?: number;
  address?: string;
  chain?: RecoveryChainObservation;
}): RecoverySnapshot {
  const { head: h } = data;
  const { now, address, chain } = options;
  const chainNow = options.chainNow ?? now;
  const connected = !!address;
  const feedFresh = fresh(now, h.observedAt, h.quality.snapshotMaxAgeSeconds);
  const chainMatches = !!chain && !!address && (!chain.address || chain.address.toLowerCase() === address.toLowerCase());
  const chainFresh = chainMatches && chain.blockTimestamp > 0 && fresh(chainNow, chain.blockTimestamp, 60);
  const historyCurrent = h.quality.historyStatus === "current" && h.quality.unindexedFinalizedBlocks === 0 && !!h.indexedThrough && fresh(now, h.indexedThrough.timestamp, h.quality.historyMaxAgeSeconds);
  const ledgerFresh = !!h.programme.source && fresh(now, h.programme.source.observedAt, h.programme.source.maxAgeSeconds);
  const indexCurrent = feedFresh && historyCurrent;
  const programmeCurrent = indexCurrent && ledgerFresh && h.programme.complete && h.programme.current;
  const holderDataCurrent = indexCurrent && !!data.holders?.complete && !!data.holders?.current;
  const holderPrincipalCurrent = holderDataCurrent && (data.issuedPrincipalVerified ?? programmeCurrent);
  const holder = data.positions.find(p => p.address.toLowerCase() === address?.toLowerCase() && p.classification === "holder");
  const shares = chainMatches ? chain.shares : 0n;
  const principalKnown = holderPrincipalCurrent && chainFresh && !!holder && BigInt(holder.sharesWei) === shares && chain?.positionTransfersSinceIndexed === false;
  const principalUnavailableReason = !connected ? null : !chainFresh ? "Waiting for a current wallet balance." : !holderPrincipalCurrent ? "Claim principal is updating." : !holder || BigInt(holder.sharesWei) !== shares || chain?.positionTransfersSinceIndexed !== false ? "Your share transfers are awaiting finalized accounting." : null;
  const principal = principalKnown && holder ? BigInt(holder.representedClaimWei) : 0n;
  const pps = chainFresh ? chain.vaultPps : BigInt(h.recoveryVault.assetsPerShareWad);
  const recoveryRate = chainFresh ? chain.recoveryRate : BigInt(h.claim.recoveryRateWad);
  const baseline = h.baseline;
  const historyDays = data.days.filter(d => (d.ppsObserved ?? d.complete) && (!baseline || d.closingBlock.timestamp >= baseline.block.timestamp));
  const progressHistory = historyDays.map(d => ({ day: d.dayIndex, recovery: normalizedRecovery(BigInt(d.closing.assetsPerShareWad), BigInt(d.recoveryRateWad)) }));
  const kongFresh = h.kong.status === "available" && h.kong.observedAt != null && fresh(now, h.kong.observedAt, 86400);
  const rateIsFresh = (at: number | null) => at !== null && fresh(now, at, 86400);
  const rates = kongFresh ? (h.kong.rates ?? []).filter(r => rateIsFresh(r.observedAt)) : [];
  const historicalApy = rates.find(r => r.basis === "historical" && r.windowDays === 30)?.value ?? null;
  const estimatedApy = rates.find(r => r.basis === "estimated")?.value ?? null;
  const funding = indexCurrent && h.funding?.current ? h.funding : null;
  const yearnRevenueShare = BigInt(funding?.auctions.yearnRevenueShareWei ?? "0");
  const pendingSources = (data.pendingFunding ?? []).map(entry => ({
    id: entry.id,
    amount: BigInt(entry.amountWei),
    destination: entry.destination,
    // Older auction evidence carries the deposit transaction in the economic flow ID.
    transactionHash: entry.transactionHash ?? /^1:(0x[a-fA-F0-9]{64}):[0-9]+:v1$/.exec(entry.economicFlowId ?? "")?.[1] ?? null,
  }));
  const inputs = h.forecast.inputs;
  const forecastInputsMatch = h.recoveryVault.sharesWei !== "0" && h.yieldVault.assetsWei !== "0" &&
    (!inputs || (inputs.status === "estimated" && inputs.windowDays === h.forecast.basis.windowDays &&
      inputs.currentEarningCapitalWei === h.yieldVault.assetsWei &&
      inputs.currentRecoverySharesWei === h.recoveryVault.sharesWei));
  const principalTotals = programmeCurrent ? h.programme.principal : undefined;
  const growth = h.forecast.dailyAssetsPerShareGrowthWad === null ? null : BigInt(h.forecast.dailyAssetsPerShareGrowthWad);
  return {
    asOf: chainFresh ? chain.blockTimestamp : h.observedAt, now: chainNow, connected, shares,
    allowance: chainMatches ? chain.allowance : 0n, walletWeth: chainMatches ? chain.wethBalance : 0n,
    // This is remaining represented principal, not the wallet's lifetime claim or WETH balance.
    originalClaimEth: principal,
    recoveryStart: { at: baseline?.block.timestamp ?? h.observedAt, recovery: baseline ? ratio(baseline.normalizedRecoveryWad) : ratio(h.recoveryVault.normalizedRecoveryWad) },
    progressHistory, history: progressHistory,
    holders: data.holders ? { asOf: data.holders.block.timestamp, positions: data.positions.map(p => ({ id: p.address, address: p.address as `0x${string}`, kind: p.classification === "holder" ? "holder" : "system", shares: BigInt(p.sharesWei), representedClaimEth: BigInt(p.representedClaimWei) })) } : null,
    auctionHistory: data.auctions?.complete ? data.fills.map((fill) => ({
      id: fill.id, round: Math.max(1, data.rounds.findIndex(r => r.roundId === fill.roundId) + 1), at: fill.block.timestamp,
      recoveryBasis: fill.originalClaimRecoveryWad === null ? "reference" as const : "personal" as const, taker: fill.sharePayer as `0x${string}`, recovery: ratio(fill.originalClaimRecoveryWad ?? fill.normalizedRecoveryWad), weth: BigInt(fill.wethReceivedWei), transactionHash: fill.transactionHash as `0x${string}`,
    })).sort((a,b) => b.at - a.at) : [],
    recoveryRate, vaultPps: pps, vaultAssetsEth: BigInt(h.recoveryVault.assetsWei), totalShares: BigInt(h.recoveryVault.sharesWei),
    yieldAssetsEth: BigInt(h.yieldVault.assetsWei), yieldApy: historicalApy ?? estimatedApy, yieldApyBasis: historicalApy !== null ? "historical" : "estimated",
    claimedPrincipalEth: principalTotals ? BigInt(principalTotals.allocatedWei) : 0n,
    exitedPrincipalEth: principalTotals ? BigInt(principalTotals.totalSettledWei) : 0n,
    funding: [],
    strategies: (kongFresh ? h.kong.strategies ?? [] : []).map(s => ({
      id: s.address, name: s.name, asset: "WETH", description: "", assetsEth: BigInt(s.allocatedAssetsWei),
      historicalApy: kongFresh ? s.rates.find(r => r.basis === "historical" && r.windowDays === 30 && rateIsFresh(r.observedAt))?.value ?? null : null,
      allocationBps: BigInt(s.parentAssetsWei) > 0n ? Number(BigInt(s.allocatedAssetsWei) * 10000n / BigInt(s.parentAssetsWei)) : 0,
    })),
    auction: chainFresh && chain.auction ? chain.auction : {
      kickedAt: chainFresh ? 0 : h.auction.kickedAt, initialWeth: chainFresh ? 0n : BigInt(h.auction.initialAvailableWei), remainingWeth: chainFresh ? 0n : BigInt(h.auction.availableWei),
      startingPrice: BigInt(h.auction.startingPriceWad), minimumPrice: BigInt(h.auction.minimumPriceWad),
      stepDuration: h.auction.stepDurationSeconds, stepDecayBps: h.auction.stepDecayRateBps, length: h.auction.auctionLengthSeconds,
    },
    live: {
      principalKnown, baselineKnown: baseline !== null, principalUnavailableReason, historyCurrent, feedFresh, chainFresh,
      chainAsOf: chainMatches ? chain.blockTimestamp : null, feedAsOf: h.observedAt, indexedAt: h.indexedThrough?.timestamp ?? null,
      directAssets: chainFresh ? chain.directAssets : null, maxRedeem: chainFresh ? chain.maxRedeem : null,
      targetAssetsPerShare: BigInt(h.recoveryVault.targetAssetsPerShareWad),
      dailyAssetsPerShareGrowth: indexCurrent && forecastInputsMatch && growth !== null && growth > 0n ? growth : null,
      publicReferenceRecovery: normalizedRecovery(pps, recoveryRate),
      measuredPerformance: h.performance.windows.filter(w => w.status === "measured" && w.periodReturnWad !== undefined && w.closingBlock).map(w => ({ windowDays: w.windowDays, periodReturn: ratio(w.periodReturnWad!), annualizedReturn: w.annualizedReturn ?? null, asOf: w.closingBlock!.timestamp })),
      ppsHistory: data.days.filter(d => d.ppsObserved ?? d.complete).map(d => ({ at: d.closingBlock.timestamp, pps: Number(BigInt(d.closing.assetsPerShareWad)) / Number(WAD) })),
      fundingTotals: funding ? {
        vault: BigInt(funding.vault.yieldWei) + BigInt(funding.vault.donationsWei),
        auctions: BigInt(funding.auctions.yieldWei) + BigInt(funding.auctions.donationsWei) + yearnRevenueShare,
        complete: funding.complete && funding.unknownWei === "0",
        yearnRevenueShare,
        unclassified: BigInt(funding.unknownWei),
        pendingAllocation: BigInt(funding.pendingAllocationWei),
        pendingSources,
        yieldReceived: BigInt(funding.vault.yieldWei) + BigInt(funding.auctions.yieldWei),
        donations: BigInt(funding.vault.donationsWei) + BigInt(funding.auctions.donationsWei), rounds: funding.totalKickedRounds,
      } : null,
      holderDataCurrent, holderPrincipalCurrent, programmeCurrent, auctionHistoryCurrent: !!data.auctions?.complete && indexCurrent, producerVersion: h.producer.version,
    },
  };
}
