import { describe, expect, it } from "vitest";
import fixture from "../../../fixtures/pulse-live.json";
import { parsePulseFeed, PulseFeedReader } from "@/lib/clients/pulse/feed";
import { accountTrend, capitalAssets, capitalChains, capitalTrend, coveredDays, metricStatus, metricTrend, productActivity } from "@/lib/clients/pulse/live";
const now = fixture.generatedAt + 60;
const parse = (value: unknown) => parsePulseFeed(value, now);
describe("Pulse live data boundary", () => {
  it("accepts the recorded live feed, with no fixture substitution", () => {
    const feed = parse(fixture);
    expect(feed.metrics.filter(m => m.latest).length).toBe(13);
    expect(feed.yLockers?.peg.history).toHaveLength(1);
    expect(() => parse({ ...fixture, mode: "fixture" })).toThrow();
    expect(() => parse({ ...fixture, generatedAt: now + 120 })).toThrow();
  });
  it("accepts an explicit publication window and rejects inconsistent bounds", () => {
    const feed = parse(fixture);
    expect(feed.reviewedCapital!.coverage.publishedHistory).toBeUndefined();
    const until = Math.floor(feed.generatedAt / 86400) * 86400;
    feed.reviewedCapital!.coverage.publishedHistory = { days:90, from:until-90*86400, until, durableRetentionDays:740, basis:"Last 90 closed UTC days." };
    expect(parse(feed).reviewedCapital!.coverage.publishedHistory?.days).toBe(90);
    const bad = structuredClone(feed);
    bad.reviewedCapital!.coverage.publishedHistory!.from -= 86400;
    expect(() => parse(bad)).toThrow(/published capital window/);
    const outside = structuredClone(feed);
    outside.reviewedCapital!.history[0].day = until - 91 * 86400;
    expect(() => parse(outside)).toThrow(/outside the published window/);
  });
  it("rejects duplicate and conflicting metric observations", () => {
    const bad = structuredClone(parse(fixture));
    const metric = bad.metrics.find(m => m.latest)!;
    metric.history.push(metric.history[0]);
    expect(() => parse(bad)).toThrow();
    const conflict = structuredClone(parse(fixture));
    conflict.metrics.find(m => m.latest)!.latest!.value = "999";
    expect(() => parse(conflict)).toThrow();
  });
  it("leaves unknown dates empty in every range", () => {
    const feed = parse(fixture);
    for (const period of [7,30,90,365] as const) {
      const series = metricTrend(feed,period,"yfi.staked");
      expect(series.values).toHaveLength(period);
      expect(series.values.filter(v => v !== null)).toHaveLength(1);
      expect(series.values[0]).toBeNull();
    }
  });
  it("uses reviewed capital only and excludes quarantined days", () => {
    const feed = parse(fixture);
    const days = coveredDays(feed,30);
    expect(days.length).toBeGreaterThan(0);
    const assets = capitalAssets(days);
    const row = capitalTrend(feed,30,assets[0].id);
    expect(row.net.filter(v => v !== null)).toHaveLength(1);
    expect(row.observed).toBe(1);
    feed.reviewedCapital!.coverage.quarantined.push(days[0].chainId + ":" + days[0].day);
    expect(coveredDays(feed,30)).toHaveLength(0);
    expect(accountTrend(feed,30).deposits.every(n => n === null)).toBe(true);
  });
  it("cannot mix assets or chains in capital totals", () => {
    const feed = parse(fixture);
    const assets = capitalAssets(coveredDays(feed,30));
    for (const a of assets) {
      const trend = capitalTrend(feed,30,a.id);
      const expected = feed.reviewedCapital!.history.flatMap(d => d.totals.assets).filter(r => r.chainId === a.chainId && r.asset.address === a.asset.address).reduce((n,r) => n + Number(r.net),0);
      expect(trend.net.reduce<number>((n,v) => n+(v??0),0)).toBeCloseTo(expected,7);
    }
  });
  it("retains the last accepted publication on regression", async () => {
    const feed = parse(fixture);
    let value = feed;
    const reader = new PulseFeedReader(async () => value);
    expect(await reader.read()).toEqual(feed);
    value = { ...feed, generatedAt: feed.generatedAt - 1 };
    await expect(reader.read()).rejects.toThrow(/regressed/);
    value = feed;
    expect(await reader.read()).toEqual(feed);
  });
  it("keeps supported mainnet visible even when its first day is missing", () => {
    const feed = parse(fixture);
    feed.reviewedCapital!.history = feed.reviewedCapital!.history.filter(d => d.chainId !== 1);
    expect(capitalChains(feed)).toContain(1);
    const accounts = accountTrend(feed, 90, 1);
    expect(accounts.expected).toBe(90);
    expect(accounts.chainDays).toBe(0);
    expect(accounts.deposits.every(v => v === null)).toBe(true);
  });
  it("keeps product movement gaps distinct from observed zero", () => {
    const feed = parse(fixture);
    const days = coveredDays(feed, 30);
    const choice = capitalAssets(days)[0];
    const trend = capitalTrend(feed, 30, choice.id);
    for (const product of trend.products) {
      expect(product.values).toHaveLength(30);
      expect(product.values.filter(v => v !== null)).toHaveLength(trend.observed);
      expect(product.values.reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBeCloseTo(product.net, 6);
    }
  });
  it("reports availability, estimation and freshness separately from history length", () => {
    const feed = parse(fixture);
    const m = feed.metrics.find(m => m.status === "available")!;
    expect(m.history).toHaveLength(1);
    expect(metricStatus([m])).toBe("available");
    expect(metricStatus([{...m, status:"estimated"}])).toBe("estimated");
    expect(metricStatus([{...m, status:"stale"}])).toBe("stale");
    expect(metricStatus([m, undefined])).toBe("partial");
    expect(metricStatus([undefined])).toBe("unavailable");
  });

  it("ranks global product activity once per chain-qualified product without adding token amounts", () => {
    const feed = parse(fixture);
    const day = structuredClone(feed.reviewedCapital!.history[0]);
    const product = day.products.find(p => p.totals.assets.length)!;
    const first = structuredClone(product.totals.assets[0]);
    first.depositActions = 100; first.withdrawalActions = 50;
    const other = structuredClone(first);
    other.asset.address = "0x0000000000000000000000000000000000000001";
    other.asset.symbol = "OTHER"; other.asset.decimals = 18;
    other.depositActions = 200; other.withdrawalActions = 25;
    product.totals.assets = [first, other];
    day.products = [product];
    const next = structuredClone(day); next.day += 86400;
    next.products[0].totals.assets = [{...first, depositActions:3, withdrawalActions:2}];
    const secondChain = structuredClone(day); secondChain.chainId = 10;
    secondChain.products[0].totals.assets = [{...first, chainId:10, depositActions:10, withdrawalActions:5}];
    feed.reviewedCapital!.history = [day, next, secondChain];
    const activity = productActivity(feed, 90);
    expect(activity.products).toHaveLength(2);
    expect(activity.products[0].actions).toBe(380);
    expect(activity.products[1].actions).toBe(15);
    expect(activity.products[0].id).not.toEqual(activity.products[1].id);
    expect(activity.products[0].values.filter(v => v !== null)).toEqual([375,5]);
    expect(activity.observedChainDays).toBe(3);
    expect(activity.expectedChainDays).toBe(540);
    feed.reviewedCapital!.coverage.quarantined.push(day.chainId + ":" + day.day);
    expect(productActivity(feed,90).products.find(p => p.chainId === day.chainId)?.actions).toBe(5);
  });

  it("rejects duplicate product rows before they can inflate activity rankings", () => {
    const feed = parse(fixture);
    const day = feed.reviewedCapital!.history.find(d => d.products.length)!;
    day.products.push(structuredClone(day.products[0]));
    expect(() => parse(feed)).toThrow(/Duplicate capital product/);
  });

});
