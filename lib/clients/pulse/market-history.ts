import {z} from "zod";
import type {LiveMetric} from "./feed";
const time=z.number().int().nonnegative();
const price=(decimals:number)=>z.string().regex(new RegExp("^(?:0|[1-9]\\d{0,17})(?:\\.\\d{1,"+decimals+"})?$")).refine(v=>Number(v)>0&&Number(v)<=1e15);
const point=z.object({day:time,yfiUsd:price(12),wethUsd:price(12),yfiEth:price(18),yfiQuoteAt:time,wethQuoteAt:time,yfiConfidence:z.number().min(.9).max(1),wethConfidence:z.number().min(.9).max(1),sourceSha256:z.string().regex(/^[0-9a-f]{64}$/)});
export const marketHistorySchema=z.object({
 schema:z.literal("pulse-market-history/v1"),sourceUrl:z.literal("https://coins.llama.fi"),definition:z.string().min(1).max(2048),checkedAt:time,status:z.enum(["estimated","partial","stale","unavailable"]),reason:z.string().max(2048).nullable(),
 history:z.array(point).max(365),coverage:z.object({fromInclusive:time,untilExclusive:time,expectedDays:z.literal(365),observedDays:time.max(365),missingDays:z.array(time).max(365)}),
});
export type MarketHistory=z.infer<typeof marketHistorySchema>;
const scaled=(v:string,decimals:number)=>{const [whole,fraction=""]=v.split(".");return BigInt(whole+fraction.padEnd(decimals,"0"));};
export function validateMarketHistory(data:MarketHistory,generatedAt:number){
 const until=Math.floor(generatedAt/86400)*86400,from=until-365*86400;
 if(data.checkedAt>generatedAt||data.coverage.untilExclusive!==until||data.coverage.fromInclusive!==from)throw new Error("Invalid market history window.");
 let prior=-1;
 for(const p of data.history){
  if(p.day<=prior||p.day%86400||p.day<from||p.day>=until)throw new Error("Invalid market history day.");prior=p.day;
  if([p.yfiQuoteAt,p.wethQuoteAt].some(at=>at>data.checkedAt||Math.abs(at-p.day)>14400))throw new Error("Invalid market quote time.");
  if(scaled(p.yfiEth,18)!==scaled(p.yfiUsd,12)*10n**18n/scaled(p.wethUsd,12))throw new Error("YFI/ETH ratio disagrees with source prices.");
 }
 const observed=new Set(data.history.map(p=>p.day)),missing=Array.from({length:365},(_,i)=>from+i*86400).filter(day=>!observed.has(day));
 if(data.coverage.observedDays!==data.history.length||JSON.stringify(data.coverage.missingDays)!==JSON.stringify(missing))throw new Error("Market coverage disagrees with history.");
 if((data.status==="unavailable")!==(data.history.length===0))throw new Error("Market availability disagrees with history.");
 const latest=data.history.at(-1);
 if(latest&&latest.day!==until-86400&&data.status!=="stale")throw new Error("Old market history is not marked stale.");
 if(data.status==="estimated"&&(missing.length>0||data.reason!==null))throw new Error("Incomplete market history is not marked partial.");
 if(data.status==="partial"&&(missing.length===0||data.reason!==null))throw new Error("Complete market history has inconsistent status.");
}
export const MARKET_METRIC_IDS=["yfi.market_price_usd","yfi.market_price_eth"] as const;
export function marketMetrics(data:MarketHistory|undefined):LiveMetric[]{
 if(!data)return [];
 return MARKET_METRIC_IDS.map((id,i)=>{
  const history=data.history.map(p=>({observedAt:p.day,value:i?p.yfiEth:p.yfiUsd,quality:"estimated" as const,sourceSha256:p.sourceSha256}));
  return {id,label:i?"YFI / ETH · daily reference":"YFI / USD · daily reference",card:"yfi",unit:i?"ETH":"USD",basis:data.definition,status:data.status,reason:data.reason,history,latest:history.at(-1)??null};
 });
}
