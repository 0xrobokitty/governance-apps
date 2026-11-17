import { describe, expect, it } from "vitest";
import { getFinance, getLoanView, getRecoveryView, getTreasuryView } from "@/lib/clients/pulse/finance";

describe("Pulse financial trend accounting", () => {
  it.each([7, 30, 90, 365] as const)("reconciles the %i-day reserves and gross holdings bridges", period => {
    const data = getFinance(period, "mixed");
    expect(data.days).toHaveLength(period + 1);
    for (const scope of ["reserves", "total"] as const) {
      for (const yfi of [false, true]) {
        const view = getTreasuryView(data, scope, yfi);
        expect(view.market[0]).toBe(view.fixed[0]);
        expect(view.opening + view.netFlows + view.repricing).toBeCloseTo(view.value, 6);
        expect(view.fixed.at(-1)! - view.opening).toBeCloseTo(view.netFlows, 6);
      }
    }
  });
  it("converts returned principal into reserves without treating it as new gross assets", () => {
    const data = getFinance(90, "mixed");
    const reserves = getTreasuryView(data, "reserves", false), total = getTreasuryView(data, "total", false);
    const loans = getLoanView(data, "all");
    expect(loans.returned).toBeGreaterThan(0);
    expect(loans.values[0] - loans.value).toBeCloseTo(loans.returned, 8);
    expect(reserves.netFlows - total.netFlows).toBeCloseTo(loans.returned, 8);
    expect(loans.returned).toBeCloseTo(getLoanView(data, "resupply").returned + getLoanView(data, "other").returned, 8);
  });
  it("keeps YFI out of spendable reserves and optional in gross holdings", () => {
    const data = getFinance(30, "mixed");
    expect(getTreasuryView(data, "reserves", true)).toEqual(getTreasuryView(data, "reserves", false));
    const last = data.days.at(-1)!;
    expect(getTreasuryView(data, "total", true).value - getTreasuryView(data, "total", false).value).toBeCloseTo(last.yfi * last.yfiPrice, 6);
  });
  it("separates below-target recovery exits from funding and actual payouts", () => {
    const data = getFinance(90, "mixed"), view = getRecoveryView(data);
    expect(view.targetReleased).toBeGreaterThan(view.paid);
    expect(view.paid).toBeGreaterThan(0);
    expect(view.change).toBeCloseTo(-view.funding - view.targetReleased + view.paid, 8);
    for (const day of data.days) {
      expect(day.recoveryGap).toBeCloseTo(day.recoveryTarget - day.recoveryBacking, 9);
      expect(day.recoveryFunded).toBeCloseTo(day.recoveryBacking / day.recoveryTarget * 100, 9);
      expect(day.stable).toBeGreaterThan(0);
    }
  });
  it("preserves observed amounts across ranges while resetting only the price baseline", () => {
    const annual = getFinance(365, "mixed"), month = getFinance(30, "mixed");
    expect(annual.days.slice(-31)).toEqual(month.days);
    expect(getTreasuryView(annual, "total", true).value).toBe(getTreasuryView(month, "total", true).value);
    expect(getRecoveryView(annual).value).toBe(getRecoveryView(month).value);
    expect(getTreasuryView(annual, "total", true).fixed.at(-1)).not.toBe(getTreasuryView(month, "total", true).fixed.at(-1));
  });
});
