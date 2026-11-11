import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { recoveryPpsChart } from "@/lib/clients/yeth/recovery/chart";
import { poolProgress } from "@/lib/clients/yeth/recovery/journey";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import type { RecoveryLiveMetadata } from "@/lib/clients/yeth/recovery/types";

export function chartSnapshot() {
  const s = new MockRecoveryPreviewClient().getSnapshot();
  s.vaultPps = parseEther("1.07327");
  s.recoveryRate = parseEther("0.3196079");
  s.asOf = s.now - 120;
  s.live = {
    targetAssetsPerShare: parseEther("3.12883"),
    dailyAssetsPerShareGrowth: parseEther("0.000172349697541250"),
    feedFresh: true, historyCurrent: true,
    ppsHistory: [{ at: s.now - 253 * 86400, pps: 1 }, { at: s.now - 86400, pps: 1.0732 }],
  } as RecoveryLiveMetadata;
  return s;
}

describe("recovery PPS chart domain", () => {
  it("shows the remaining gap and uses the same target date as the headline", () => {
    const s = chartSnapshot();
    const data = recoveryPpsChart(s)!;
    expect(data.targetPps).toBeCloseTo(3.12883, 6);
    expect(data.maxPps).toBe(data.targetPps);
    expect(data.current.pps).toBeCloseTo(1.07327, 6);
    expect(data.history.at(-1)?.at).toBe(s.asOf);
    expect(data.estimatedAt).toBe(poolProgress(s).milestones.find(m => m.percent === 100)?.estimatedAt);
    expect(data.projected.at(-1)).toEqual({ at: data.estimatedAt, pps: data.targetPps, kind: "projected" });
    expect(data.history.every(p => p.kind === "observed")).toBe(true);
    expect((data.current.at - data.startAt) / (data.endAt - data.startAt)).toBeLessThan(.03);
  });
  it.each(["feedFresh", "historyCurrent"] as const)("withholds extrapolation when %s is false but retains the target scale", key => {
    const s = chartSnapshot(); s.live![key] = false;
    const data = recoveryPpsChart(s)!;
    expect(data.projected).toEqual([]);
    expect(data.estimatedAt).toBeNull();
    expect(data.maxPps).toBeCloseTo(3.12883);
    expect(data.history).toHaveLength(3);
  });
  it("never extrapolates a missing or nonpositive earning pace", () => {
    for (const pace of [null, 0n, -1n]) {
      const s = chartSnapshot(); s.live!.dailyAssetsPerShareGrowth = pace;
      expect(recoveryPpsChart(s)!.projected).toEqual([]);
    }
  });
  it("preserves a historical loss from above the target without clipping it", () => {
    const s = chartSnapshot(); s.live!.ppsHistory[0].pps = 3.5;
    const data = recoveryPpsChart(s)!;
    expect(data.maxPps).toBe(3.5);
    expect(data.targetPps).toBeCloseTo(3.12883);
    expect(data.history[0].pps).toBe(3.5);
  });
  it("does not invent further growth once the reference target is reached", () => {
    const s = chartSnapshot(); s.vaultPps = s.live!.targetAssetsPerShare;
    const data = recoveryPpsChart(s)!;
    expect(data.targetReached).toBe(true);
    expect(data.projected).toEqual([]);
    expect(data.endAt).toBe(s.asOf);
  });
});
