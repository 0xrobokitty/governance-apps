import { auctionEnd, auctionPrice, isSnapshotFresh, WAD } from "./model";
import type { RecoverySnapshot } from "./types";

export type AuctionTimelinePoint = { at: number; price: bigint; recoveryWad: bigint; recovery: number };
export type AuctionTimelineMilestone = {
  target: 50 | 75 | 100;
  status: "reached" | "upcoming" | "unreachable";
  at: number | null;
};
export type AuctionTimeline = {
  basis: "personal" | "reference";
  status: "active" | "ended" | "empty" | "unavailable";
  now: number;
  startAt: number;
  endAt: number;
  current: AuctionTimelinePoint | null;
  last: AuctionTimelinePoint | null;
  points: AuctionTimelinePoint[];
  milestones: AuctionTimelineMilestone[];
  maxRecovery: number;
};

const TARGETS = [50, 75, 100] as const;
// The deployed seven-day / 225-second curve has 2,689 steps.
// Refuse an unexpectedly large configuration instead of blocking the UI thread.
const MAX_STEPS = 10_000;

/** Exact rates on shares sold into this round, never a blended whole-position exit. */
export function buildAuctionTimeline(snapshot: RecoverySnapshot): AuctionTimeline {
  const { auction } = snapshot;
  // Contract timestamps are whole seconds; local fork clocks can include milliseconds.
  const now = Math.floor(snapshot.now);
  const personalPrincipal = snapshot.live
    ? snapshot.live.principalKnown ? snapshot.originalClaimEth : 0n
    : snapshot.connected && snapshot.recoveryRate > 0n ? snapshot.shares * WAD / snapshot.recoveryRate : 0n;
  const personal = snapshot.connected && snapshot.shares > 0n && personalPrincipal > 0n;
  // Recovery = numerator / (denominator * price), with price in shares per WETH.
  const numerator = personal ? snapshot.shares * WAD : snapshot.recoveryRate;
  const denominator = personal ? personalPrincipal : 1n;
  const base: AuctionTimeline = {
    basis: personal ? "personal" : "reference", status: "unavailable", now,
    startAt: auction.kickedAt, endAt: auction.kickedAt,
    current: null, last: null, points: [], milestones: [], maxRecovery: 1,
  };
  if (![now, auction.kickedAt, auction.length, auction.stepDuration].every(Number.isSafeInteger)
    || auction.kickedAt <= 0 || now < auction.kickedAt || auction.length < 0 || auction.stepDuration <= 0
    || !Number.isSafeInteger(auction.kickedAt + auction.length + 1)
    || !Number.isFinite(new Date(now * 1000).getTime())
    || !Number.isFinite(new Date((auction.kickedAt + auction.length + 1) * 1000).getTime())
    || !Number.isInteger(auction.stepDecayBps) || auction.stepDecayBps < 0 || auction.stepDecayBps > 10_000
    || auction.initialWeth <= 0n || auction.startingPrice <= 0n || auction.minimumPrice < 0n
    || numerator <= 0n || !isSnapshotFresh(snapshot)) return base;
  if (auction.remainingWeth <= 0n) return { ...base, status: "empty" };
  const maximumStep = Math.floor(auction.length / auction.stepDuration);
  if (maximumStep > MAX_STEPS) return base;
  const endAt = auctionEnd(auction);
  const lastAt = endAt - 1;
  if (lastAt < auction.kickedAt || auctionPrice(auction, lastAt) <= 0n) return base;
  const lastStep = Math.floor((lastAt - auction.kickedAt) / auction.stepDuration);
  const pointAt = (at: number): AuctionTimelinePoint => {
    const price = auctionPrice(auction, at);
    const recoveryWad = numerator * WAD / (denominator * price);
    return { at, price, recoveryWad, recovery: Number(recoveryWad) / Number(WAD) };
  };
  const meets = (step: number, targetWad: bigint) => {
    const price = auctionPrice(auction, auction.kickedAt + step * auction.stepDuration);
    return price > 0n && numerator * WAD >= targetWad * denominator * price;
  };
  const milestones = TARGETS.map((target): AuctionTimelineMilestone => {
    const targetWad = BigInt(target) * WAD / 100n;
    if (!meets(lastStep, targetWad)) return { target, status: "unreachable", at: null };
    let low = 0, high = lastStep;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (meets(middle, targetWad)) high = middle;
      else low = middle + 1;
    }
    const at = auction.kickedAt + low * auction.stepDuration;
    return { target, at, status: at <= now ? "reached" : "upcoming" };
  });
  const current = now < endAt ? pointAt(now) : null;
  const times = new Set(Array.from({ length: lastStep + 1 }, (_, step) => auction.kickedAt + step * auction.stepDuration));
  times.add(lastAt);
  if (current) times.add(now);
  const points = [...times].sort((a, b) => a - b).map(pointAt);
  const last = points.at(-1)!;
  return {
    ...base, status: current ? "active" : "ended", endAt, current, last, points, milestones,
    maxRecovery: Math.max(1, Math.ceil(last.recovery * 4) / 4),
  };
}
