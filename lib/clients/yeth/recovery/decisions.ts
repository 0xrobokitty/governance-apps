import { isSnapshotFresh, maxTake, normalizedRecovery, projectionYears, personalTargetYears, quoteTake, recoveryMetrics, WAD } from "./model";
import type { RecoverySnapshot } from "./types";

export function recoveryChoices(snapshot: RecoverySnapshot) {
  const metrics = recoveryMetrics(snapshot);
  const fresh = isSnapshotFresh(snapshot);
  const active = fresh && metrics.price > 0n && snapshot.auction.remainingWeth > 0n;
  const quote = active ? quoteTake(snapshot, maxTake(snapshot)) : null;
  const representedClaim = metrics.claimValue;
  const previouslyRecovered = snapshot.live ? 0n : snapshot.walletWeth;
  const totalRecovered = previouslyRecovered + metrics.directValue;
  const roundingRemainder = (snapshot.live || previouslyRecovered > 0n) && snapshot.shares > 0n && snapshot.shares <= 2n;
  return {
    roundingRemainder,
    nextEvent: metrics.untilEnd <= metrics.nextStep ? "end" as const : "increase" as const,
    nextEventIn: Math.min(metrics.untilEnd, metrics.nextStep),
    hasUsablePosition: snapshot.shares > 0n && !roundingRemainder,
    ...metrics, fresh, active, quote, representedClaim,
    accountRecovery: snapshot.originalClaimEth > 0n ? Number(totalRecovered * WAD / snapshot.originalClaimEth) / 1e18 : null,
    // Ignore at most two wei introduced by share/output conversion rounding.
    auctionIsBetter: !!quote && quote.weth > quote.directValueEth + 2n,
    coversPosition: !!quote && snapshot.shares - quote.shares <= 2n,
    positionFraction: quote && snapshot.shares > 0n ? Number(quote.shares * WAD / snapshot.shares) / 1e18 : 0,
    auctionAccountRecovery: quote && snapshot.originalClaimEth > 0n
      ? Number((previouslyRecovered + quote.weth + (snapshot.shares - quote.shares) * snapshot.vaultPps / WAD) * WAD / snapshot.originalClaimEth) / 1e18
      : null,
  };
}

export type RecoveryTarget = {
  status: "estimated" | "reached" | "unavailable" | "outside-claim";
  years: number | null;
  targetEth: bigint;
};
/** A target refers to the full original account claim, including already-paid recovery. */
export function recoveryTarget(snapshot: RecoverySnapshot, targetPercent: number): RecoveryTarget {
  if (!Number.isInteger(targetPercent) || targetPercent < 0 || targetPercent > 100 || snapshot.originalClaimEth <= 0n) {
    return { status: "unavailable", years: null, targetEth: 0n };
  }
  const targetEth = snapshot.originalClaimEth * BigInt(targetPercent) / 100n;
  const { directValue, claimValue } = recoveryMetrics(snapshot);
  if (!isSnapshotFresh(snapshot) || !snapshot.connected) return { status: "unavailable", years: null, targetEth };
  if (snapshot.live) {
    if (!snapshot.live.principalKnown) return { status: "unavailable", years: null, targetEth };
    if (directValue >= targetEth) return { status: "reached", years: 0, targetEth };
    const requiredPps = snapshot.shares > 0n ? (targetEth * WAD + snapshot.shares - 1n) / snapshot.shares : 0n;
    if (requiredPps > snapshot.live.targetAssetsPerShare) return { status: "outside-claim", years: null, targetEth };
    const years = personalTargetYears(snapshot, targetEth);
    return { status: years === null ? "unavailable" : "estimated", years, targetEth };
  }
  if (snapshot.walletWeth + directValue >= targetEth) return { status: "reached", years: 0, targetEth };
  if (claimValue <= 0n || snapshot.walletWeth + claimValue < targetEth) {
    return { status: "outside-claim", years: null, targetEth };
  }
  const targetRate = Number((targetEth - snapshot.walletWeth) * WAD / claimValue) / 1e18;
  const current = normalizedRecovery(snapshot.vaultPps, snapshot.recoveryRate);
  const fullYears = projectionYears(snapshot.history, current);
  if (fullYears === null || current >= 1) return { status: "unavailable", years: null, targetEth };
  const years = fullYears * (targetRate - current) / (1 - current);
  return Number.isFinite(years) && years >= 0
    ? { status: "estimated", years, targetEth }
    : { status: "unavailable", years: null, targetEth };
}

export function countdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total % 86400 / 3600).toString().padStart(2, "0");
  const minutes = Math.floor(total % 3600 / 60).toString().padStart(2, "0");
  return (days ? days + "d " : "") + hours + ":" + minutes + ":" + (total % 60).toString().padStart(2, "0");
}
