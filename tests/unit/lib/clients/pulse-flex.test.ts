import {describe,it,expect} from "vitest";
import {parsePulseFeed} from "@/lib/clients/pulse/feed";
import {flexFixture} from "../../../fixtures/pulse-flex";
const parse=(f:ReturnType<typeof flexFixture>)=>parsePulseFeed(f,f.generatedAt+60);
describe("Separate Flex feed",()=>{
 it("accepts the five source stocks without changing Yearn accounting",()=>{
  const f=flexFixture(),p=parse(f);
  expect(p.flex?.metrics).toHaveLength(5);
  expect(p.reviewedCapital).toEqual(parsePulseFeed({...f,flex:undefined},f.generatedAt+60).reviewedCapital);
 });
 it("rejects duplicate metrics, wrong units, future points and invented history coverage",()=>{
  const fixtures=[flexFixture(),flexFixture(),flexFixture(),flexFixture()];
  fixtures[0].flex.metrics[1]=fixtures[0].flex.metrics[0];
  fixtures[1].flex.metrics[0].unit="accounts";
  fixtures[2].flex.metrics[0].history[0].observedAt+=1;
  fixtures[3].flex.metrics[0].coverage.observedDays=180;
  for(const f of fixtures)expect(()=>parse(f)).toThrow();
 });
 it("keeps a missing fee history unavailable rather than zero",()=>{
  const f=flexFixture(),m=f.flex.metrics[4];m.history=[];m.latest=null;m.status="unavailable";m.coverage={firstObservedAt:null,lastObservedAt:null,observedDays:0};f.flex.status="partial";
  expect(parse(f).flex!.metrics[4].latest).toBeNull();
 });
 it("rejects fractional borrower accounts and more owners than active positions",()=>{
  const f=flexFixture();f.flex.metrics[3].history[0].value="24.5";expect(()=>parse(f)).toThrow(/integer/);
  const g=flexFixture();g.flex.participation.activeTroves=20;expect(()=>parse(g)).toThrow(/exceed/);
 });
 it("binds participation metadata to the borrower observation and bounded source counts",()=>{
  const f=flexFixture();f.flex.participation.observedAt!--;expect(()=>parse(f)).toThrow(/participation time/);
  const g=flexFixture();g.flex.participation.marketCount=1001;expect(()=>parse(g)).toThrow();
  const h=flexFixture();h.flex.metrics[3].history[0].value="10001";expect(()=>parse(h)).toThrow(/integer/);
 });

});
