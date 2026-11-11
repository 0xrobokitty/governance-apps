import {describe,it,expect} from "vitest";
import {parsePulseFeed} from "@/lib/clients/pulse/feed";
import {accountTrend,globalCapitalTrend} from "@/lib/clients/pulse/live";
import {globalCapitalFixture} from "../../../fixtures/pulse-global-capital";
const parse=(f:ReturnType<typeof globalCapitalFixture>)=>parsePulseFeed(f,f.generatedAt+60);
describe("Global capital consumer contract",()=>{
  it("accepts six-chain source-bound daily USD estimates without changing legacy native amounts",()=>{
    const feed=parse(globalCapitalFixture());
    expect(Number(feed.globalCapital!.history[0].netUsd)).toBe(feed.globalCapital!.history[0].products.length*15);
    expect(accountTrend(feed,7).completeDays).toBe(1);
    expect(accountTrend(feed,7).deposits.at(-1)).toBe(feed.globalCapital!.history[0].depositingAccounts);
  });
  it("does not present a missing chain as a lower global account total",()=>{
    const f=globalCapitalFixture(); f.reviewedCapital!.history.pop(); delete f.globalCapital;
    expect(accountTrend(parse(f),7).deposits.every(v=>v===null)).toBe(true);
  });
  it("rejects incomplete chains, changed accounting hashes and false coverage",()=>{
    const fixtures=[globalCapitalFixture(),globalCapitalFixture(),globalCapitalFixture()];
    fixtures[0].globalCapital!.history[0].capital.pop();
    fixtures[1].globalCapital!.history[0].capital[0].accountingSha256="f".repeat(64);
    fixtures[2].globalCapital!.coverage.missingDays=[];
    for(const f of fixtures) expect(()=>parse(f)).toThrow();
  });
  it("rejects duplicate products and contradictory USD amounts",()=>{
    const f=globalCapitalFixture(); f.globalCapital!.history[0].products.push(f.globalCapital!.history[0].products[0]);
    expect(()=>parse(f)).toThrow(/product/);
    const g=globalCapitalFixture(); g.globalCapital!.history[0].netUsd="99.00";
    expect(()=>parse(g)).toThrow(/reconcile/);
  });
  it("uses gross-weighted window balance rather than averaging daily percentages",()=>{
    const f=globalCapitalFixture();
    const first=f.globalCapital!.history[0];
    first.depositsUsd="100.00";first.withdrawalsUsd="0.00";first.netUsd="100.00";first.flowBalanceBps=10000;
    const second=structuredClone(first);second.day-=86400;
    second.depositsUsd="0.00";second.withdrawalsUsd="900.00";second.netUsd="-900.00";second.flowBalanceBps=-10000;
    f.globalCapital!.history=[second,first];
    const trend=globalCapitalTrend(f,7);
    expect(trend.periodBalance).toBe(-80);
    expect(trend.cumulativeNet.slice(-2)).toEqual([-900,-800]);
    expect(trend.runningBalance.slice(-2)).toEqual([-100,-80]);
    expect(trend.depositsUsd).toBe(100);
    expect(trend.withdrawalsUsd).toBe(900);
    expect(trend.net.slice(0,-2).every(v=>v===null)).toBe(true);
  });
  it("rejects an invented flow balance, product totals and source metadata",()=>{
    const balance=globalCapitalFixture(); balance.globalCapital!.history[0].flowBalanceBps=-9000;
    expect(()=>parse(balance)).toThrow(/balance/);
    const totals=globalCapitalFixture(); const p=totals.globalCapital!.history[0].products[0];
    p.depositsUsd="200.00";p.netUsd="195.00";
    expect(()=>parse(totals)).toThrow(/product USD/);
    const counts=globalCapitalFixture(); counts.globalCapital!.history[0].depositActions++;
    expect(()=>parse(counts)).toThrow(/actions/);
  });
  it("retains unpriced coverage without losing chain-qualified accounts",()=>{
    const f=globalCapitalFixture(); const p=f.globalCapital!.history[0];
    p.depositsUsd=null;p.withdrawalsUsd=null;p.netUsd=null;p.flowBalanceBps=null;
    p.priceCoverage.pricedAssetCount=0;p.priceCoverage.pricedActionCount=0;
    p.priceCoverage.unpricedAssets=f.reviewedCapital!.history.flatMap(d=>d.totals.assets.filter(a=>a.depositActions+a.withdrawalActions>0).map(a=>({chainId:d.chainId,...a.asset,depositActions:a.depositActions,withdrawalActions:a.withdrawalActions,reason:"No quote"})));
    for(const product of p.products){product.depositsUsd=null;product.withdrawalsUsd=null;product.netUsd=null;product.pricedActions=0;}
    expect(parse(f).globalCapital!.history[0].netUsd).toBeNull();
    expect(accountTrend(parse(f),7).deposits.at(-1)).toBe(p.depositingAccounts);
  });
});
