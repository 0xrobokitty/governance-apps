import { describe, expect, it } from "vitest";
import { parsePulseFeed } from "@/lib/clients/pulse/feed";
import { tvlTrend } from "@/lib/clients/pulse/live";
import { tvlFixture } from "../../../fixtures/pulse-tvl";
import producer from "../../../fixtures/pulse-tvl-producer.json";
import base from "../../../fixtures/pulse-live.json";
const parse = (value: unknown) => parsePulseFeed(value, tvlFixture().generatedAt + 60);
describe("Pulse vault TVL history", () => {
  it("accepts the captured Rust-produced 90-day provider feed without adapting its fields", () => {
    const feed = parsePulseFeed({...base,generatedAt:producer.checkedAt,tvlHistory:producer},producer.checkedAt);
    expect(feed.tvlHistory?.coverage.observedClosedDays).toBe(90);
    expect(feed.tvlHistory?.history).toHaveLength(91);
    expect(feed.tvlHistory?.latest?.value).toBe("144619681.00");
  });
  it("accepts one consistent estimated provider with 90 closed dates and a provisional quote", () => {
    const feed = parse(tvlFixture());
    expect(feed.tvlHistory?.history).toHaveLength(91);
    expect(feed.tvlHistory?.latest?.provisional).toBe(true);
    expect(tvlTrend(feed, 90).values.filter(v => v !== null)).toHaveLength(90);
    expect(tvlTrend(feed, 365).values.filter(v => v !== null)).toHaveLength(91);
  });
  it("keeps missing dates empty and validates the reported gap", () => {
    const fixture = tvlFixture();
    const missing = fixture.tvlHistory.history.splice(50,1)[0];
    fixture.tvlHistory.coverage.missingDays = [missing.observedAt];
    fixture.tvlHistory.coverage.observedClosedDays = 89;
    const feed = parse(fixture);
    expect(tvlTrend(feed,90).values.filter(v => v !== null)).toHaveLength(89);
    fixture.tvlHistory.coverage.observedClosedDays = 90;
    expect(() => parse(fixture)).toThrow(/coverage/);
  });
  it("rejects wrong provider, nonfinite values, false chronology and mismatched latest", () => {
    const fixtures = [tvlFixture(),tvlFixture(),tvlFixture(),tvlFixture()];
    fixtures[0].tvlHistory.source.id = "kong";
    fixtures[1].tvlHistory.history[0].value = "999999999999999999999999999999999999";
    fixtures[2].tvlHistory.history[1].observedAt = fixtures[2].tvlHistory.history[0].observedAt;
    fixtures[3].tvlHistory.latest = {...fixtures[3].tvlHistory.latest,value:"1"};
    for (const fixture of fixtures) expect(() => parse(fixture)).toThrow();
  });
  it("accepts a reconciled chain breakdown and rejects missing chains or a false total", () => {
    const fixture = tvlFixture();
    const withChains = fixture.tvlHistory.history.map(p => ({
      ...p, chains: fixture.tvlHistory.source.chains.map((c, i) => ({chainId:c.chainId,value:i ? "0" : p.value})),
    }));
    const data = {...fixture,tvlHistory:{...fixture.tvlHistory,history:withChains,latest:withChains.at(-1)!}};
    expect(tvlTrend(parse(data),90).chains).toHaveLength(7);
    const scope = structuredClone(data); scope.tvlHistory.source.chains.pop();
    expect(() => parse(scope)).toThrow(/breakdown|scope/);
    const missing = structuredClone(data); missing.tvlHistory.history[0].chains.pop();
    expect(() => parse(missing)).toThrow(/breakdown/);
    const mismatch = structuredClone(data); mismatch.tvlHistory.history[0].chains[0].value="1";
    expect(() => parse(mismatch)).toThrow(/reconcile/);
  });
  it("marks methodology changes only in the selected window", () => {
    const feed = parse(tvlFixture());
    expect(tvlTrend(feed,30).annotations).toHaveLength(1);
    expect(tvlTrend(feed,7).annotations).toHaveLength(0);
  });
});
