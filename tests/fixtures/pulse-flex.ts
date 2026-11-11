import {FLEX_IDS,type FlexFeed} from "@/lib/clients/pulse/flex";
import {globalCapitalFixture} from "./pulse-global-capital";
export function flexFixture(){
 const feed=globalCapitalFixture(),at=feed.generatedAt;
 const flex:FlexFeed={schema:"pulse-flex/v1",chainId:1,checkedAt:at,status:"estimated",sourceUrl:"https://flexmeow.com/info",scope:"Seven endorsed Ethereum markets. Separate venue; not added to Yearn totals.",metrics:FLEX_IDS.map((id,i)=>{
  const point={observedAt:at,value:id==="flex.borrower_accounts"?"24":String(1000+i*100),quality:"estimated" as const,sourceSha256:"f".repeat(64)};
  return {id,label:id,unit:id==="flex.borrower_accounts"?"accounts" as const:"USD" as const,definition:"Observed source stock, not daily earned revenue.",status:"estimated" as const,reason:null,latest:point,history:[point],coverage:{firstObservedAt:at,lastObservedAt:at,observedDays:1}};
 }),participation:{observedAt:at,activeTroves:34,excludedProtocolAccounts:0,marketCount:7},limitations:["Source-defined active borrower accounts, not people."]};
 return {...feed,flex};
}
