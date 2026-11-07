import { describe, expect, it } from "vitest";
import { parsePulseFeed, PulseFeedReader } from "@/lib/clients/pulse/feed";
import { xTrend } from "@/lib/clients/pulse/live";
import { xFixture } from "../../../fixtures/pulse-x";
const parse = (f = xFixture()) => parsePulseFeed(f, f.generatedAt + 60);
describe("Pulse X boundary", () => {
  it("accepts additive X observations while preserving old feeds", () => {
    const f = xFixture();
    expect(parse(f).x?.history).toHaveLength(10);
    const old = { ...f, x: undefined };
    expect(parsePulseFeed(old, f.generatedAt + 60).x).toBeUndefined();
  });
  it.each([
    ["future observation", (f: ReturnType<typeof xFixture>) => { f.x.history[9].observedAt += 1000; }],
    ["duplicate day", (f: ReturnType<typeof xFixture>) => { f.x.history[9] = f.x.history[8]; }],
    ["latest mismatch", (f: ReturnType<typeof xFixture>) => { f.x.observedAt! -= 1; }],
    ["unsafe count", (f: ReturnType<typeof xFixture>) => { f.x.history[9].followers = Number.MAX_SAFE_INTEGER+1; }],
    ["baseline activity", (f: ReturnType<typeof xFixture>) => { f.x.history[0].impressions = 200; }],
    ["unmeasured clicks", (f: ReturnType<typeof xFixture>) => { f.x.history[9].measuredLinkPosts = 0; }],
    ["wrong follower delta", (f: ReturnType<typeof xFixture>) => { f.x.history[9].netFollowers = 55; }],
    ["unavailable history", (f: ReturnType<typeof xFixture>) => { f.x.status = "unavailable"; }],
    ["missing performance sample", (f: ReturnType<typeof xFixture>) => { f.x.history[9].performancePosts = 0; }],
    ["nonconsecutive interval", (f: ReturnType<typeof xFixture>) => { f.x.history[9].intervalStart! -= 86400; }],
  ])("rejects %s", (_, mutate) => {
    const f=xFixture(); mutate(f); expect(() => parse(f)).toThrow();
  });
  it("preserves baseline and missing days instead of inventing daily activity", () => {
    const f=xFixture();
    f.x.history.splice(6,1);
    const next=f.x.history[6];
    Object.assign(next,{intervalStart:null,netFollowers:null,impressions:null,linkClicks:null,measuredPosts:0,measuredLinkPosts:0});
    const series=xTrend(parse(f),30);
    expect(series.impressions.slice(-4,-2)).toEqual([null,null]);
    expect(series.followers.at(-4)).toBeNull();
    expect(series.impressionAverage.at(-1)).toBeNull();
    expect(series.latest?.followers).toBe(90018);
  });
  it("calculates averages using prior history only when all seven days are measured", () => {
    const trend=xTrend(parse(),7);
    expect(trend.impressions).toHaveLength(7);
    expect(trend.impressionAverage.at(-1)).toBe(1600);
    expect(trend.clickAverage.at(-1)).toBe(16);
    expect(trend.impressionAverage[0]).toBeNull();
    for(const period of [7,30,90,365] as const) expect(xTrend(parse(),period).followers).toHaveLength(period);
  });
  it("rejects dropped or changed X history on subsequent publications", async () => {
    let f=parse();
    const reader=new PulseFeedReader(async()=>f);
    await reader.read();
    f=structuredClone(f); f.generatedAt+=900; f.x!.history.shift();
    await expect(reader.read()).rejects.toThrow(/history changed/);
    f=parse(); f.generatedAt+=900; f.x!.history[1].impressions!+=1;
    await expect(reader.read()).rejects.toThrow(/history changed/);
    f=parse(); f.generatedAt+=900; f.x=undefined;
    await expect(reader.read()).rejects.toThrow(/regressed/);
  });
  it("retains stale and disabled historical observations", () => {
    for(const status of ["stale","disabled"] as const) {
      const f=xFixture(); f.x.status=status;
      expect(xTrend(parse(f),7).followers.at(-1)).toBe(90018);
    }
  });
});
