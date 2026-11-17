import {z} from "zod";
import type {LiveMetric} from "./feed";
const timestamp=z.number().int().nonnegative();
const decimal=z.string().regex(/^\d{1,78}(?:\.\d{1,36})?$/).refine(v=>Number.isFinite(Number(v)));
const status=z.enum(["estimated","partial","stale","unavailable"]);
const point=z.object({observedAt:timestamp,value:decimal,quality:z.enum(["estimated","partial"]),sourceSha256:z.string().regex(/^[0-9a-f]{64}$/)});
export const FLEX_IDS=["flex.debt_usd","flex.deposits_usd","flex.value_usd","flex.borrower_accounts","flex.claimable_fees_usd"] as const;
export const flexSchema=z.object({
 schema:z.literal("pulse-flex/v1"),chainId:z.literal(1),checkedAt:timestamp,status,
 sourceUrl:z.literal("https://flexmeow.com/info"),scope:z.string().min(1).max(2048),
 metrics:z.array(z.object({
  id:z.enum(FLEX_IDS),label:z.string().min(1).max(256),unit:z.enum(["USD","accounts"]),definition:z.string().min(1).max(2048),
  status,reason:z.string().max(2048).nullable(),latest:point.nullable(),history:z.array(point).max(740),
  coverage:z.object({firstObservedAt:timestamp.nullable(),lastObservedAt:timestamp.nullable(),observedDays:timestamp.max(740)}),
 })).length(5),
 participation:z.object({observedAt:timestamp.nullable(),activeTroves:timestamp.max(10000).nullable(),excludedProtocolAccounts:timestamp.max(10000).nullable(),marketCount:timestamp.max(1000).nullable(),excludedNonActiveTroves:timestamp.max(10000).nullable().optional(),excludedZeroDebtTroves:timestamp.max(10000).nullable().optional(),sourceSha256:z.string().regex(/^[0-9a-f]{64}$/).nullable().optional()}),
 limitations:z.array(z.string().min(1).max(2048)).max(20),
});
export type FlexFeed=z.infer<typeof flexSchema>;
export function validateFlex(flex:FlexFeed,generatedAt:number){
 if(flex.checkedAt>generatedAt)throw new Error("Flex collection is in the future.");
 const ids=new Set<string>();
 for(const metric of flex.metrics){
  if(ids.has(metric.id))throw new Error("Duplicate Flex metric.");ids.add(metric.id);
  const accounts=metric.id==="flex.borrower_accounts";
  if(metric.unit!==(accounts?"accounts":"USD"))throw new Error("Flex metric unit mismatch.");
  let priorDay=-1;
  for(const point of metric.history){
   const day=Math.floor(point.observedAt/86400);
   if(day<=priorDay||point.observedAt>flex.checkedAt)throw new Error("Invalid Flex observation order.");
   if(accounts&&(!/^\d+$/.test(point.value)||BigInt(point.value)>10000n))throw new Error("Flex account count must be an integer.");
   priorDay=day;
  }
  if(JSON.stringify(metric.latest)!==JSON.stringify(metric.history.at(-1)??null))throw new Error("Flex latest disagrees with history.");
  if((metric.status==="unavailable")!==(metric.history.length===0))throw new Error("Flex metric availability disagrees with history.");
  if(metric.coverage.firstObservedAt!==(metric.history[0]?.observedAt??null)||metric.coverage.lastObservedAt!==(metric.latest?.observedAt??null)||metric.coverage.observedDays!==metric.history.length)throw new Error("Flex coverage disagrees with history.");
 }
 if((flex.status==="unavailable")!==flex.metrics.every(m=>m.history.length===0))throw new Error("Flex availability disagrees with metrics.");
 if(flex.participation.observedAt!==null&&flex.participation.observedAt>flex.checkedAt)throw new Error("Flex participation is in the future.");
 const borrowers=flex.metrics.find(m=>m.id==="flex.borrower_accounts")!.latest;
 if(flex.participation.observedAt!==(borrowers?.observedAt??null))throw new Error("Flex participation time disagrees with borrower accounts.");
 if(flex.participation.sourceSha256!=null&&flex.participation.sourceSha256!==borrowers?.sourceSha256)throw new Error("Flex participation evidence disagrees with borrower accounts.");
 if(borrowers&&flex.participation.observedAt===borrowers.observedAt&&flex.participation.activeTroves!==null&&BigInt(borrowers.value)>BigInt(flex.participation.activeTroves))throw new Error("Flex accounts exceed active troves.");
}
export function flexMetrics(flex:FlexFeed|undefined):LiveMetric[]{
 return flex?.metrics.map(m=>({...m,card:"flex",basis:m.definition}))??[];
}
