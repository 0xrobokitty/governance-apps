import { describe, expect, it } from "vitest";
import fixture from "../../../fixtures/pulse-live.json";
import { parsePulseFeed, PulseFeedReader } from "@/lib/clients/pulse/feed";
import { accountTrend, capitalAssets, capitalTrend, coveredDays, metricTrend } from "@/lib/clients/pulse/live";
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
});
