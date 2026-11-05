import { recoveryProjectionYears, WAD } from "./model";
import { poolProgress } from "./journey";
import type { RecoverySnapshot } from "./types";

export type RecoveryPpsPoint = { at: number; pps: number; kind: "observed" | "projected" };

export function recoveryPpsChart(snapshot: RecoverySnapshot) {
  const live = snapshot.live;
  if (!live || live.targetAssetsPerShare <= 0n) return null;
  const targetPps = Number(live.targetAssetsPerShare) / Number(WAD);
  const current: RecoveryPpsPoint = { at: snapshot.asOf, pps: Number(snapshot.vaultPps) / Number(WAD), kind: "observed" };
  const observations = new Map<number, RecoveryPpsPoint>();
  for (const point of live.ppsHistory) {
    if (point.at <= current.at && Number.isFinite(point.at) && Number.isFinite(point.pps) && point.pps >= 0) {
      observations.set(point.at, { ...point, kind: "observed" });
    }
  }
  observations.set(current.at, current);
  const history = [...observations.values()].sort((a, b) => a.at - b.at);
  const years = recoveryProjectionYears(snapshot);
  const estimatedAt = years !== null && years > 0
    ? poolProgress(snapshot).milestones.find(m => m.percent === 100)?.estimatedAt ?? null : null;
  const projected: RecoveryPpsPoint[] = [];
  if (estimatedAt !== null && estimatedAt > current.at && targetPps > current.pps) {
    // Annual inspection points on the same linear, non-compounding forecast as the headline.
    for (let at = current.at + 365 * 86400; at < estimatedAt; at += 365 * 86400) {
      projected.push({ at, pps: current.pps + (targetPps - current.pps) * (at - current.at) / (estimatedAt - current.at), kind: "projected" });
    }
    projected.push({ at: estimatedAt, pps: targetPps, kind: "projected" });
  }
  return {
    current, history, projected, targetPps, estimatedAt,
    targetReached: current.pps >= targetPps,
    // Zero and the full target remain visible, even without an available forecast.
    maxPps: Math.max(targetPps, ...history.map(p => p.pps)),
    startAt: history[0].at, endAt: estimatedAt ?? current.at,
    points: [...history, ...projected],
  };
}

export type RecoveryPpsChartData = NonNullable<ReturnType<typeof recoveryPpsChart>>;
