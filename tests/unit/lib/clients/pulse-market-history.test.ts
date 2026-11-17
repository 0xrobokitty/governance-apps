import {describe,it,expect} from "vitest";
import {parsePulseFeed} from "@/lib/clients/pulse/feed";
import {marketMetrics} from "@/lib/clients/pulse/market-history";
import {metricTrend} from "@/lib/clients/pulse/live";
import {marketFixture} from "../../../fixtures/pulse-market-history";
const parse=(f:ReturnType<typeof marketFixture>)=>parsePulseFeed(f,f.generatedAt+60);
describe("Daily same-source YFI market history",()=>{
 it("keeps reference prices separate from Chainlink and gives365 closed date slots",()=>{
  const f=marketFixture(),p=parse(f),metrics=marketMetrics(p.marketHistory);
  expect(metrics.map(m=>m.id)).toEqual(["yfi.market_price_usd","yfi.market_price_eth"]);
  expect(metricTrend({...p,metrics},365,metrics[1].id,true).values.at(-1)).toBe(.7);
  expect(p.metrics).toEqual(parsePulseFeed({...f,marketHistory:undefined},f.generatedAt+60).metrics);
 });
 it("checks exact fixed-point ratio, timestamps, confidence and missing-day coverage",()=>{
  const fs=[marketFixture(),marketFixture(),marketFixture(),marketFixture(),marketFixture()];
  fs[0].marketHistory.history[0].yfiEth="0.700000000000000001";
  fs[1].marketHistory.history[0].yfiQuoteAt+=14400;
  fs[2].marketHistory.history[0].wethConfidence=.89;
  fs[3].marketHistory.coverage.missingDays=[];
  fs[4].marketHistory.status="estimated";
  for(const f of fs)expect(()=>parse(f)).toThrow();
 });
 it("requires old observations to be marked stale and accepts unavailable empty history",()=>{
  const f=marketFixture();f.marketHistory.history[0].day-=86400;f.marketHistory.history[0].yfiQuoteAt-=86400;f.marketHistory.history[0].wethQuoteAt-=86400;
  f.marketHistory.coverage.missingDays=f.marketHistory.coverage.missingDays.filter(d=>d!==f.marketHistory.history[0].day).concat(f.marketHistory.coverage.untilExclusive-86400).sort((a,b)=>a-b);
  expect(()=>parse(f)).toThrow(/stale/);f.marketHistory.status="stale";expect(parse(f).marketHistory?.status).toBe("stale");
  f.marketHistory.history=[];f.marketHistory.status="unavailable";f.marketHistory.coverage.observedDays=0;f.marketHistory.coverage.missingDays=Array.from({length:365},(_,i)=>f.marketHistory.coverage.fromInclusive+i*86400);
  expect(parse(f).marketHistory?.history).toEqual([]);
 });
});
