import { recoveryChoices } from "./decisions";
import { isSnapshotFresh, normalizedRecovery, projectionYears, personalTargetYears, recoveryProjectionYears, quoteTake, WAD } from "./model";
import type { AuctionQuote, RecoverySnapshot } from "./types";

export type ExitMode = "auction" | "complete";
export function exitPlan(s: RecoverySnapshot, quote: AuctionQuote | null, mode: ExitMode) {
  const remainingShares = quote ? s.shares - quote.shares : s.shares;
  const remainingValue = !quote && s.live?.directAssets !== null && s.live?.directAssets !== undefined ? s.live.directAssets : remainingShares * s.vaultPps / WAD;
  const redeemRest = !quote || mode === "complete";
  const payout = (quote?.weth ?? 0n) + (redeemRest ? remainingValue : 0n);
  const claimSpent = redeemRest ? s.live ? s.live.principalKnown ? s.originalClaimEth : 0n : s.recoveryRate > 0n ? s.shares * WAD / s.recoveryRate : 0n : quote!.fullClaimEth;
  const rate = claimSpent > 0n ? Number(payout * WAD / claimSpent) / 1e18 : null;
  const partial = !!quote && !redeemRest && remainingShares > 2n;
  const soldFraction = s.shares > 0n ? Number((redeemRest ? s.shares : quote?.shares ?? 0n) * WAD / s.shares) / 1e18 : 0;
  return { remainingShares, remainingValue, redeemRest, payout, rate, partial, soldFraction, keptFraction: partial ? 1 - soldFraction : 0 };
}

export function exitOffer(s: RecoverySnapshot, mode: ExitMode) {
  const choice = recoveryChoices(s);
  const beneficial = choice.active && choice.auctionIsBetter && !!choice.quote;
  const quote = beneficial ? choice.quote : null;
  const plan = exitPlan(s, quote, mode);
  const fullYears = s.live ? null : projectionYears(s.history, choice.recovery);
  const equivalentFullExit = (quote?.weth ?? 0n) + plan.remainingValue;
  const improvementRate = choice.claimValue > 0n
    ? Number((equivalentFullExit - choice.directValue) * WAD / choice.claimValue) / 1e18 : 0;
  const yearsAhead = s.live ? beneficial ? personalTargetYears(s, equivalentFullExit) : null : beneficial && choice.fresh && fullYears !== null && choice.recovery < 1
    ? fullYears * improvementRate / (1 - choice.recovery) : null;
  // Compare like-for-like: the rate and shares covered by the selected exit.
  const holdTarget = beneficial ? plan.rate : 1;
  const equivalentHoldAssets = quote && mode === "auction"
    ? (quote.weth * s.shares + quote.shares - 1n) / quote.shares
    : plan.payout;
  const holdYears = s.live ? personalTargetYears(s, beneficial ? equivalentHoldAssets : s.originalClaimEth) : choice.fresh && fullYears !== null && holdTarget !== null && holdTarget >= choice.recovery && choice.recovery < 1
    ? fullYears * (holdTarget - choice.recovery) / (1 - choice.recovery) : null;
  return { ...choice, ...plan, beneficial, quote, yearsAhead, holdYears, holdTarget };
}

/** Reprice a reviewed output amount; never silently enlarge its share allowance. */
export function reviewedAuctionQuote(s: RecoverySnapshot, weth: bigint, maxShares: bigint, round: number): AuctionQuote | null {
  if (!s.connected || !isSnapshotFresh(s) || s.auction.kickedAt !== round) return null;
  const available = weth < s.auction.remainingWeth ? weth : s.auction.remainingWeth;
  const quote = quoteTake(s, available);
  return quote && quote.shares <= maxShares ? quote : null;
}

export function poolProgress(s: RecoverySnapshot) {
  const fresh = s.live ? s.live.feedFresh : isSnapshotFresh(s);
  const current = normalizedRecovery(s.vaultPps, s.recoveryRate);
  const fullYears = fresh ? recoveryProjectionYears(s) : null;
  const baseline = s.recoveryStart.recovery;
  const position = (rate: number) => Math.max(0, Math.min(100, (rate - baseline) / Math.max(.0001, 1 - baseline) * 100));
  return {
    current: fresh || s.live ? current : null, baseline,
    currentPosition: fresh || s.live ? position(current) : 0,
    change: fresh || s.live ? current - baseline : null,
    milestones: [50, 75, 100].filter(percent => percent / 100 > baseline).map(percent => {
      const publicTarget = s.live && percent === 100 ? normalizedRecovery(s.live.targetAssetsPerShare, s.recoveryRate) : percent / 100;
      const estimatedYears = s.live ? !fresh || !s.live.dailyAssetsPerShareGrowth ? null : current >= publicTarget ? 0 :
        Number((percent === 100 ? s.live.targetAssetsPerShare : BigInt(percent) * WAD * WAD / (100n * s.recoveryRate)) - s.vaultPps) / Number(s.live.dailyAssetsPerShareGrowth) / 365 :
        !fresh ? null : current >= percent / 100 ? 0 : fullYears === null || current >= 1
        ? null : fullYears * (percent / 100 - current) / (1 - current);
      const years = estimatedYears !== null && estimatedYears <= 100 ? estimatedYears : null;
      return { percent, position: position(percent / 100), years,
        estimatedAt: years !== null && years > 0 ? s.now + Math.ceil(years * 365) * 86400 : null };
    }),
  };
}

export function holderDistribution(s: RecoverySnapshot) {
  if (!s.holders || (s.live ? !s.live.holderDataCurrent : !isSnapshotFresh(s) || s.now - s.holders.asOf > 60 || s.holders.asOf > s.now)) return null;
  const accounts = s.holders.positions.filter(p => p.kind === "holder" && p.shares > 0n).sort((a, b) => a.shares > b.shares ? -1 : a.shares < b.shares ? 1 : 0);
  const total = accounts.reduce((sum, p) => sum + p.shares, 0n);
  if (total <= 0n || s.recoveryRate <= 0n) return null;
  const bounds = [WAD, 10n * WAD, 100n * WAD];
  const buckets = [0, 0, 0, 0];
  const positions = accounts.map(p => {
    const claim = s.live ? p.representedClaimEth ?? 0n : p.shares * WAD / s.recoveryRate;
    const index = bounds.findIndex(bound => claim < bound);
    buckets[index === -1 ? 3 : index] += 1;
    return { ...p, claim, fraction: Number(p.shares * WAD / total) / 1e18 };
  });
  return { positions, buckets, accounts: accounts.length, representedClaim: s.live ? positions.reduce((sum,p) => sum + p.claim, 0n) : total * WAD / s.recoveryRate, largest: positions[0]?.fraction ?? 0, asOf: s.holders.asOf };
}


export function recoveryFunding(s: RecoverySnapshot) {
  if (s.live) {
    const totals = s.live.fundingTotals ?? { vault: 0n, auctions: 0n, yieldReceived: 0n, donations: 0n, rounds: 0 };
    const total = totals.vault + totals.auctions;
    return { ...totals, total, vaultPercent: total > 0n ? Number(totals.vault * 10000n / total) / 100 : null };
  }
  const seen = new Set<string>();
  const rounds = new Set<number>();
  let vault = 0n, auctions = 0n, yieldReceived = 0n, donations = 0n;
  for (const flow of s.funding) {
    if (seen.has(flow.id) || flow.at <= s.now - 30 * 86400 || flow.at > s.now || flow.weth <= 0n) continue;
    seen.add(flow.id);
    if (flow.source === "yield") yieldReceived += flow.weth; else donations += flow.weth;
    if (flow.destination === "vault") vault += flow.weth;
    else { auctions += flow.weth; if (flow.round !== null) rounds.add(flow.round); }
  }
  const total = vault + auctions;
  return { vault, auctions, yieldReceived, donations, total, rounds: rounds.size,
    vaultPercent: total > 0n ? Number(vault * 10000n / total) / 100 : null };
}

export function exitedClaims(s: RecoverySnapshot) {
  if ((s.live ? !s.live.programmeCurrent : !isSnapshotFresh(s)) || s.claimedPrincipalEth <= 0n || s.exitedPrincipalEth < 0n || s.exitedPrincipalEth > s.claimedPrincipalEth) return null;
  return { exited: s.exitedPrincipalEth, total: s.claimedPrincipalEth, fraction: Number(s.exitedPrincipalEth * WAD / s.claimedPrincipalEth) / 1e18 };
}
