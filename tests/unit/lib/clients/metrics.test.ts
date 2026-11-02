import { describe, expect, it } from "vitest";
import { getMetricsMock, rankProducts, summarizeFlows } from "@/lib/clients/metrics/client";
import { isMetricsMockEnabled } from "@/lib/clients/metrics/config";
import type { LedgerDay, ProductDefinition } from "@/lib/clients/metrics/types";

const product: ProductDefinition = { id: "eth", name: "ETH", asset: "ETH", group: "ETH", chain: "Ethereum", openingUnits: 100, price: 1000, dailyUnits: 10 };
const row: LedgerDay = { day: 0, productId: "eth", price: 1000, deposits: 10, withdrawals: 2, depositAccounts: ["Ethereum:alice"], withdrawalAccounts: ["Ethereum:alice"], depositActions: 4, withdrawalActions: 2 };

describe("metrics measurements", () => {
  it("keeps the flow rate unchanged when movement prices double", () => {
    const before = summarizeFlows([row], [product], [row], []);
    const after = summarizeFlows([{ ...row, price: 2000 }], [product], [row], []);
    expect(before.neutralRate).toBe(8);
    expect(after.neutralRate).toBe(8);
    expect(after.net).toBe(before.net * 2);
  });
  it("weights assets by opening capital instead of averaging their rates", () => {
    const stable = { ...product, id: "usd", price: 1, openingUnits: 900000 };
    const stableRow = { ...row, productId: "usd", price: 1, deposits: 9000, withdrawals: 0 };
    const result = summarizeFlows([row, stableRow], [product, stable], [row, stableRow], []);
    expect(result.neutralRate).toBeCloseTo(1.7);
  });
  it("deduplicates across days and products, retaining chain identity and directional overlap", () => {
    const result = summarizeFlows([row, { ...row, day: 1 }, { ...row, depositAccounts: ["Base:alice"] }], [product], [row], []);
    expect(result.depositors).toBe(2);
    expect(result.withdrawers).toBe(1);
    expect(result.overlap).toBe(1);
    expect(result.depositActions).toBe(12);
  });
  it("reconciles chart and product totals for each period and asset filter", () => {
    for (const period of [1, 7, 30] as const) for (const asset of ["All assets", "Stablecoins", "ETH", "Other"] as const) {
      const snapshot = getMetricsMock(period, asset, "normal")!;
      expect(snapshot.series.reduce((sum, point) => sum + point.net, 0)).toBeCloseTo(snapshot.net, 6);
      expect(snapshot.products.reduce((sum, item) => sum + item.net, 0)).toBeCloseTo(snapshot.net, 6);
      if (asset !== "All assets") expect(snapshot.products.every(item => item.group === asset)).toBe(true);
      expect(snapshot.depositors).toBeLessThanOrEqual(snapshot.products.reduce((sum, item) => sum + item.depositors, 0));
    }
  });
  it("does not apply capital asset filters to protocol-wide fees or staking", () => {
    const all = getMetricsMock(7, "All assets", "normal")!;
    const eth = getMetricsMock(7, "ETH", "normal")!;
    expect(eth.fees).toEqual(all.fees);
    expect(eth.staking).toEqual(all.staking);
    expect(eth.net).not.toBe(all.net);
  });
  it("reverses directional amounts and accounts consistently in the outflow example", () => {
    const positive = getMetricsMock(7, "All assets", "normal")!;
    const negative = getMetricsMock(7, "All assets", "outflows")!;
    expect(negative.net).toBeCloseTo(-positive.net);
    expect(negative.depositors).toBe(positive.withdrawers);
    expect(negative.depositActions).toBe(positive.withdrawalActions);
    expect(negative.neutralRate).toBeCloseTo(-positive.neutralRate);
  });
  it("marks incomplete coverage and never uses zero for unavailable data", () => {
    const partial = getMetricsMock(7, "All assets", "partial")!;
    expect(partial.partial).toBe(true);
    expect(partial.products.some(item => item.chain === "Base")).toBe(false);
    expect(partial.deposits).toBeLessThan(getMetricsMock(7, "All assets", "normal")!.deposits);
    expect(getMetricsMock(7, "All assets", "unavailable")).toBeNull();
  });
  it("ranks without mutating source data", () => {
    const products = getMetricsMock(7, "All assets", "normal")!.products;
    const original = [...products];
    const outflows = rankProducts(products, "outflows");
    expect(outflows[0].net).toBe(Math.min(...products.map(item => item.net)));
    expect(products).toEqual(original);
  });
});

describe("metrics mock route gate", () => {
  const flags = { NEXT_PUBLIC_ENABLE_METRICS_PREVIEW: "true", NEXT_PUBLIC_USE_MOCKS: "true" };
  it("requires both explicit preview and mock flags", () => {
    expect(isMetricsMockEnabled({ NEXT_PUBLIC_RUNTIME_MODE: "development", ...flags })).toBe(true);
    expect(isMetricsMockEnabled({ NEXT_PUBLIC_RUNTIME_MODE: "development" })).toBe(false);
    expect(isMetricsMockEnabled({ ...flags, NEXT_PUBLIC_USE_MOCKS: "false" })).toBe(false);
    expect(isMetricsMockEnabled({ ...flags, NEXT_PUBLIC_ENABLE_METRICS_PREVIEW: "false" })).toBe(false);
  });
  it("stays closed in production even when both flags are set", () => {
    expect(isMetricsMockEnabled({ ...flags, NEXT_PUBLIC_RUNTIME_MODE: "production" })).toBe(false);
    expect(isMetricsMockEnabled({ ...flags, NODE_ENV: "production" })).toBe(false);
    expect(isMetricsMockEnabled({ ...flags, VERCEL_ENV: "production" })).toBe(false);
  });
});
