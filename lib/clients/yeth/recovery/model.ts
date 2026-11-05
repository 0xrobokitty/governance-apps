import { parseUnits } from "viem";
import type { AuctionQuote, RecoveryAuction, RecoverySnapshot } from "./types";

export const WAD = 10n ** 18n;
const RAY = 10n ** 27n;
const rmul = (x: bigint, y: bigint) => (x * y + RAY / 2n) / RAY;
function rpow(x: bigint, n: bigint): bigint {
  let z = n % 2n ? x : RAY;
  for (n /= 2n; n !== 0n; n /= 2n) {
    x = rmul(x, x);
    if (n % 2n) z = rmul(z, x);
  }
  return z;
}

/** Mirrors Auction._price and Maths rounding for 18-decimal tokens. */
export function auctionPrice(auction: RecoveryAuction, now: number): bigint {
  if (auction.initialWeth <= 0n || auction.kickedAt <= 0 || now < auction.kickedAt ||
      now - auction.kickedAt > auction.length || auction.stepDuration <= 0 ||
      auction.stepDecayBps < 0 || auction.stepDecayBps > 10_000) return 0n;
  const steps = BigInt(Math.floor((now - auction.kickedAt) / auction.stepDuration));
  const initialPrice = (auction.startingPrice * WAD + auction.initialWeth / 2n) / auction.initialWeth;
  const price = rmul(initialPrice, rpow(RAY - BigInt(auction.stepDecayBps) * 10n ** 23n, steps));
  return price < auction.minimumPrice ? 0n : price;
}

export function normalizedRecovery(pps: bigint, recoveryRate: bigint): number {
  return Number(pps * recoveryRate / WAD) / 1e18;
}

export function auctionRecovery(price: bigint, recoveryRate: bigint): number {
  return price > 0n ? Number(recoveryRate * WAD / price) / 1e18 : 0;
}

export function auctionEnd(auction: RecoveryAuction): number {
  const hardEnd = auction.kickedAt + auction.length + 1;
  if (auctionPrice(auction, auction.kickedAt) === 0n) return auction.kickedAt;
  let lo = 0;
  let hi = Math.floor(auction.length / auction.stepDuration) + 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (auctionPrice(auction, auction.kickedAt + mid * auction.stepDuration) > 0n) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(hardEnd, auction.kickedAt + lo * auction.stepDuration);
}

export function parseWethInput(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{0,18})?$/.test(value)) return null;
  try { return parseUnits(value, 18); } catch { return null; }
}

export function maxTake(snapshot: RecoverySnapshot): bigint {
  const price = auctionPrice(snapshot.auction, snapshot.now);
  if (price <= 0n) return 0n;
  const affordable = snapshot.shares * WAD / price;
  return affordable < snapshot.auction.remainingWeth ? affordable : snapshot.auction.remainingWeth;
}

export function quoteTake(snapshot: RecoverySnapshot, weth: bigint): AuctionQuote | null {
  const price = auctionPrice(snapshot.auction, snapshot.now);
  if (price <= 0n || weth <= 0n || weth > snapshot.auction.remainingWeth || snapshot.recoveryRate <= 0n) return null;
  const shares = weth * price / WAD;
  if (shares <= 0n || shares > snapshot.shares) return null;
  const principal = snapshot.live
    ? snapshot.live.principalKnown && snapshot.shares > 0n ? shares * snapshot.originalClaimEth / snapshot.shares : 0n
    : shares * WAD / snapshot.recoveryRate;
  return {
    weth, shares, price,
    recovery: snapshot.live ? principal > 0n ? Number(weth * WAD / principal) / 1e18 : 0 : auctionRecovery(price, snapshot.recoveryRate),
    fullClaimEth: principal,
    directValueEth: shares * snapshot.vaultPps / WAD,
  };
}

export function projectionYears(history: RecoverySnapshot["history"], current: number, multiplier = 1): number | null {
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last || !Number.isFinite(current) || multiplier <= 0) return null;
  if (current >= 1) return 0;
  const days = last.day - first.day;
  const slope = (last.recovery - first.recovery) / days;
  if (days < 30 || !Number.isFinite(slope) || slope <= 0) return null;
  return (1 - current) / (slope * 365 * multiplier);
}

export function isSnapshotFresh(snapshot: RecoverySnapshot): boolean {
  if (snapshot.live) return snapshot.connected ? snapshot.live.chainFresh : snapshot.live.feedFresh;
  return snapshot.now >= snapshot.asOf && snapshot.now - snapshot.asOf <= 60;
}

export function auctionCurve(snapshot: RecoverySnapshot): Array<{ elapsed: number; recovery: number }> {
  const { auction, recoveryRate } = snapshot;
  const end = auctionEnd(auction);
  const lastActive = Math.max(auction.kickedAt, end - 1);
  return Array.from({ length: 49 }, (_, i) => {
    const time = auction.kickedAt + Math.floor((lastActive - auction.kickedAt) * i / 48);
    return { elapsed: time - auction.kickedAt, recovery: auctionRecovery(auctionPrice(auction, time), recoveryRate) };
  });
}

/** Position and offer values are derived here, outside presentation components. */
export function recoveryMetrics(snapshot: RecoverySnapshot) {
  const price = auctionPrice(snapshot.auction, snapshot.now);
  const directValue = snapshot.live ? snapshot.live.directAssets ?? 0n : snapshot.shares * snapshot.vaultPps / WAD;
  const claimValue = snapshot.live ? snapshot.live.principalKnown ? snapshot.originalClaimEth : 0n : snapshot.recoveryRate > 0n ? snapshot.shares * WAD / snapshot.recoveryRate : 0n;
  return {
    price,
    recovery: snapshot.live && snapshot.connected && claimValue > 0n ? Number(directValue * WAD / claimValue) / 1e18 : normalizedRecovery(snapshot.vaultPps, snapshot.recoveryRate),
    offerRecovery: auctionRecovery(price, snapshot.recoveryRate),
    offerWethPerShare: price > 0n ? WAD * WAD / price : 0n,
    directValue, claimValue,
    untilEnd: auctionEnd(snapshot.auction) - snapshot.now,
    nextStep: snapshot.auction.stepDuration - (snapshot.now - snapshot.auction.kickedAt) % snapshot.auction.stepDuration,
  };
}

/** Net recurring income is supplied by the reconciled producer, never inferred from donation-inclusive PPS. */
export function recoveryProjectionYears(snapshot: RecoverySnapshot, multiplier = 1): number | null {
  if (!snapshot.live) return projectionYears(snapshot.history, normalizedRecovery(snapshot.vaultPps, snapshot.recoveryRate), multiplier);
  const pace = snapshot.live.dailyAssetsPerShareGrowth;
  if (!snapshot.live.feedFresh || !snapshot.live.historyCurrent || !snapshot.live.accountingComplete || pace === null || pace <= 0n || multiplier <= 0) return null;
  const remaining = snapshot.live.targetAssetsPerShare - snapshot.vaultPps;
  const years = remaining <= 0n ? 0 : Number(remaining) / Number(pace) / 365 / multiplier;
  return years <= 100 ? years : null;
}
export function personalTargetYears(snapshot: RecoverySnapshot, targetAssets: bigint): number | null {
  if (!snapshot.live?.principalKnown || !snapshot.live.chainFresh || !snapshot.live.feedFresh || !snapshot.live.dailyAssetsPerShareGrowth || snapshot.live.dailyAssetsPerShareGrowth <= 0n || snapshot.shares <= 0n) return null;
  const requiredPps = (targetAssets * WAD + snapshot.shares - 1n) / snapshot.shares;
  if (requiredPps > snapshot.live.targetAssetsPerShare) return null;
  const remaining = requiredPps - snapshot.vaultPps;
  const years = remaining <= 0n ? 0 : Number(remaining) / Number(snapshot.live.dailyAssetsPerShareGrowth) / 365;
  return years <= 100 ? years : null;
}
