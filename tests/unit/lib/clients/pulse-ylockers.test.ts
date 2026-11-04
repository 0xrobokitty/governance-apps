import { describe, expect, it } from "vitest";
import { getPulse } from "@/lib/clients/pulse/client";
import { getYLockers } from "@/lib/clients/pulse/ylockers";

describe("yLockers metric boundaries", () => {
  it("reconciles external native flows and fixed-denominator rates in each range", () => {
    for (const period of [7, 30, 90, 365] as const) for (const scenario of ["mixed", "growth", "outflows"] as const) {
      const data = getYLockers(period, scenario);
      for (const product of data.products) {
        expect(product.days).toHaveLength(period);
        expect(product.days.reduce((sum, day) => sum + (day.net ?? 0), 0)).toBeCloseTo(product.net);
        expect(product.days.reduce((sum, day) => sum + (day.netRate ?? 0), 0)).toBeCloseTo(product.netRate, 10);
        expect(product.netRate).toBeCloseTo(product.net / product.openingBalance * 100, 10);
      }
    }
  });
  it("retains complete reward weeks and warmup when the display window changes", () => {
    const short = getYLockers(7, "mixed"), long = getYLockers(90, "mixed");
    expect(short.rewardDates).toHaveLength(1);
    expect(short.rewardDates[0]).toBe(long.rewardDates.at(-1));
    for (const product of short.products) {
      const other = long.products.find(p => p.id === product.id)!;
      expect(product.rewards.at(-1)).toBe(other.lastReward);
      expect(product.lastReward).toBe(other.lastReward);
      expect(product.rewardAverages.at(-1)).toBeCloseTo(other.rewards.slice(-4).reduce<number>((sum, value) => sum + value!, 0) / 4);
      expect(product.days.map(day => day.net)).toEqual(other.days.slice(-7).map(day => day.net));
      for (const [i, day] of product.days.entries()) {
        expect(day.averageRate! * product.openingBalance).toBeCloseTo(other.days.at(-7 + i)!.averageRate! * other.openingBalance, 5);
      }
    }
  });
  it("preserves unavailable pre-launch observations and stays independent of the capital filter", () => {
    const all = getPulse(365, "all", "mixed")!;
    expect(getPulse(365, "eth", "mixed")!.ylockers).toEqual(all.ylockers);
    const yyb = all.ylockers.products.find(p => p.id === "yyb")!;
    expect(yyb.days[0].peg).toBeNull();
    expect(yyb.days[0].netRate).toBeNull();
    expect(yyb.rewards[0]).toBeNull();
    expect(yyb.days.filter(day => day.date < yyb.coverageStart).every(day => day.net === null)).toBe(true);
    const firstCovered = yyb.days.findIndex(day => day.date === yyb.coverageStart);
    expect(yyb.days.slice(firstCovered, firstCovered + 6).every(day => day.averageRate === null)).toBe(true);
    expect(yyb.days[firstCovered + 6].averageRate).not.toBeNull();
    expect(yyb.days.at(-1)!.peg).toBeGreaterThan(0);
    expect(getPulse(30, "all", "unavailable")).toBeNull();
  });
});
