import {describe,it,expect} from "vitest";
import {parsePulseFeed,parsePulseWireFeed} from "@/lib/clients/pulse/feed";
import {readPackedCapital} from "@/lib/clients/pulse/packed-capital";
import {packCapital} from "../../../fixtures/pulse-packed";
import {globalCapitalFixture} from "../../../fixtures/pulse-global-capital";
const fixture=()=>packCapital(globalCapitalFixture());
describe("Bounded compact capital transport",()=>{
 it("preserves native accounting and global validation while retaining compact HTTP rows",()=>{
  const f=fixture(),parsed=parsePulseFeed(f,f.generatedAt+60),legacy=parsePulseFeed(globalCapitalFixture(),f.generatedAt+60);
  expect(parsed).toEqual(legacy);
  const wire=parsePulseWireFeed({...f,unknown:"stripped"},f.generatedAt+60);
  expect(wire.reviewedCapital?.schema).toBe("pulse-kong-envio/v4");
  expect(Array.isArray(wire.reviewedCapital?.history[0])).toBe(true);
  expect(wire).not.toHaveProperty("unknown");
  expect(parsePulseFeed(wire,f.generatedAt+60)).toEqual(parsed);
 });
 it("rejects out-of-range references, mismatched chains, noncanonical and unused dictionary entries",()=>{
  const fs=[fixture(),fixture(),fixture(),fixture()];
  fs[0].reviewedCapital.history[0][14][6][0][0]=99999;
  fs[1].reviewedCapital.assetDictionary[0].chainId=999;
  fs[2].reviewedCapital.assetDictionary.reverse();
  const extra={...fs[3].reviewedCapital.assetDictionary.at(-1)!,address:"0xffffffffffffffffffffffffffffffffffffffff"};
  fs[3].reviewedCapital.assetDictionary.push(extra);
  for(const f of fs)expect(()=>parsePulseFeed(f,f.generatedAt+60)).toThrow();
 });
 it("rejects duplicate metadata and address aliases inside a daily summary",()=>{
  const f=fixture();f.reviewedCapital.assetDictionary.splice(1,0,f.reviewedCapital.assetDictionary[0]);
  expect(()=>readPackedCapital(f.reviewedCapital)).toThrow(/canonical/);
  const g=fixture(),rows=g.reviewedCapital.history[0][14][6];rows.push(rows[0]);
  expect(()=>readPackedCapital(g.reviewedCapital)).toThrow(/aliased/);
 });
 it("rejects malformed tuple lengths and excessive reference expansion before decoding",()=>{
  const f=fixture();(f.reviewedCapital.history[0] as unknown[]).push("extra");expect(()=>readPackedCapital(f.reviewedCapital)).toThrow();
  const g=fixture(),chain=g.reviewedCapital.history[0][0];
  g.reviewedCapital.assetDictionary=Array.from({length:10000},(_,i)=>({chainId:chain,address:"0x"+i.toString(16).padStart(40,"0"),symbol:"T",decimals:18}));
  g.reviewedCapital.productDictionary=[];
  const d=g.reviewedCapital.history[0];d[15]=[];d[14][7]=[];
  d[14][6]=g.reviewedCapital.assetDictionary.map((_,i)=>[i,"0","0",0,0,0,0,0]);
  g.reviewedCapital.history=Array.from({length:11},(_,i)=>[...d.slice(0,1),d[1]+i*86400,...d.slice(2)] as typeof d);
  expect(()=>readPackedCapital(g.reviewedCapital)).toThrow(/reference limit/);
 });
});
