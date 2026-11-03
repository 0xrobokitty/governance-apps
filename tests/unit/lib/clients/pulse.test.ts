import { describe, expect, it } from "vitest";
import { getPulse, priceNeutral, reconcile, rollingAverage } from "@/lib/clients/pulse/client";
import { createLedger, DAYS } from "@/lib/clients/pulse/mock";
import { isPulseMockEnabled } from "@/lib/clients/pulse/config";

describe("Pulse reconciled history", () => {
  it("reconciles TVL change into flows, earned assets and repricing on every day", () => {
    const ledger = createLedger("mixed");
    for (let day = 0; day < DAYS; day++) {
      const result = reconcile(ledger.filter(row => row.day === day));
      expect(result.closing - result.opening).toBeCloseTo(result.flows + result.earnings + result.repricing, 6);
    }
  });
  it("reconciles each full period, including product totals and normalized daily flows", () => {
    for (const period of [7, 30, 90] as const) for (const asset of ["all", "stable", "eth", "other"] as const) {
      const data = getPulse(period, asset, "mixed")!;
      expect(data.days).toHaveLength(period);
      expect(data.tvl - data.openingTVL).toBeCloseTo(data.net + data.earned + data.repricing, 6);
      expect(data.days.reduce((n, day) => n + day.netRate, 0)).toBeCloseTo(data.flowRate, 10);
      expect(data.products.reduce((n, product) => n + product.net, 0)).toBeCloseTo(data.net, 6);
      expect(data.days.at(-1)!.tvlIndex).toBeCloseTo(100 + data.tvlChange);
      expect(data.days.at(-1)!.fixedIndex).toBeCloseTo(100 + data.fixedChange);
    }
  });
  it("does not change normalized flows when current market prices change", () => {
    const row = createLedger("mixed")[0];
    const prices = new Map([[row.product, 1]]);
    const a = priceNeutral([row], prices, 1000000);
    const b = priceNeutral([{ ...row, price: row.price * 10 }], prices, 1000000);
    expect(a).toEqual(b);
  });
  it("holds the opening-price anchor fixed throughout the selected window", () => {
    const data = getPulse(30, "all", "mixed")!;
    expect(data.tvlChange).toBeGreaterThan(data.fixedChange);
    const last = data.days.at(-1)!;
    expect(last.cumulativeRate).toBeCloseTo(data.fixedNet / data.openingTVL * 100);
    expect(data.fixedChange).toBeGreaterThan(data.flowRate); // earned assets also change balances
  });
  it("uses capital-weighted normalized totals rather than adding asset percentages", () => {
    const all = getPulse(30, "all", "mixed")!;
    const groups = ["stable", "eth", "other"].map(asset => getPulse(30, asset as "stable" | "eth" | "other", "mixed")!);
    const weighted = groups.reduce((n, group) => n + group.flowRate * group.openingTVL, 0) / all.openingTVL;
    expect(all.flowRate).toBeCloseTo(weighted, 10);
    expect(all.flowRate).not.toBeCloseTo(groups.reduce((n, group) => n + group.flowRate, 0));
  });
  it("deduplicates account identity across products and days", () => {
    const data = getPulse(30, "all", "mixed")!;
    expect(data.depositors).toBeLessThan(data.days.reduce((n, day) => n + day.depositors, 0));
    expect(data.depositors).toBeLessThan(data.products.reduce((n, product) => n + product.depositors, 0));
    expect(data.depositActions).toBeGreaterThan(data.depositors);
  });
  it("uses historical warmup for moving averages", () => {
    expect(rollingAverage([1, 2, 3, 4, 5, 6, 7, 8], 7)).toBe(5);
    const seven = getPulse(7, "all", "mixed")!;
    const thirty = getPulse(30, "all", "mixed")!;
    expect(seven.days[0].depositorAverage).toBe(thirty.days.at(-7)!.depositorAverage);
    expect(seven.days[0].feeAverage).toBe(thirty.days.at(-7)!.feeAverage);
  });
  it("keeps fees and governance protocol-wide when capital is filtered", () => {
    const all = getPulse(30, "all", "mixed")!;
    const eth = getPulse(30, "eth", "mixed")!;
    expect(eth.fees).toBe(all.fees);
    expect(eth.governance).toEqual(all.governance);
    expect(eth.tvl).not.toBe(all.tvl);
  });
  it("keeps governance observations dated and counts underlying YFI once", () => {
    const data = getPulse(30, "all", "mixed")!;
    for (const day of data.governance) {
      expect(day.total).toBe(day.direct + day.delegated);
      expect(day.rate).toBeCloseTo(day.directRate + day.delegatedRate);
      if (day.vote) expect(day.vote.rate).toBeCloseTo(day.vote.used / day.vote.eligible * 100);
    }
    expect(data.governance.some(day => day.vote === null)).toBe(true);
    expect(data.governance.filter(day => day.vote).length).toBeLessThan(10);
  });
  it("uses common reduced coverage through partial history and suppresses unavailable totals", () => {
    const full = getPulse(30, "all", "mixed")!;
    const partial = getPulse(30, "all", "partial")!;
    expect(partial.partial).toBe(true);
    expect(partial.products.some(product => product.chain === "Base")).toBe(false);
    expect(partial.days.every((day, index) => day.tvl < full.days[index].tvl)).toBe(true);
    expect(getPulse(30, "all", "unavailable")).toBeNull();
  });
  it("provides mixed signals rather than making all sample measures rise", () => {
    const data = getPulse(30, "all", "mixed")!;
    expect(data.tvlChange).toBeGreaterThan(0);
    expect(data.recentNet).toBeLessThan(0);
    expect(data.products.some(product => product.net < 0)).toBe(true);
    expect(data.products.some(product => product.net > 0)).toBe(true);
  });
});

describe("Pulse route gate", () => {
  const flags = { NEXT_PUBLIC_ENABLE_PULSE_PREVIEW: "true", NEXT_PUBLIC_USE_MOCKS: "true" };
  it("requires explicit preview and mock flags outside production", () => {
    expect(isPulseMockEnabled({ ...flags, NEXT_PUBLIC_RUNTIME_MODE: "development" })).toBe(true);
    expect(isPulseMockEnabled({ ...flags, NEXT_PUBLIC_USE_MOCKS: "false" })).toBe(false);
    expect(isPulseMockEnabled({ NEXT_PUBLIC_USE_MOCKS: "true" })).toBe(false);
    expect(isPulseMockEnabled({ NEXT_PUBLIC_ENABLE_METRICS_PREVIEW: "true", NEXT_PUBLIC_USE_MOCKS: "true" })).toBe(false);
    expect(isPulseMockEnabled({ ...flags, NEXT_PUBLIC_RUNTIME_MODE: "production" })).toBe(false);
    expect(isPulseMockEnabled({ ...flags, NODE_ENV: "production" })).toBe(false);
  });
});
