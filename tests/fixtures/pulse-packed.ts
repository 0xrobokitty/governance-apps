import type {PulseFeed,CapitalTotals} from "@/lib/clients/pulse/feed";
import type {PackedCapital} from "@/lib/clients/pulse/packed-capital";
export function packCapital(feed:PulseFeed){
 const native=feed.reviewedCapital!;
 const assetMap=new Map<string,PackedCapital["assetDictionary"][number]>(),productMap=new Map<string,PackedCapital["productDictionary"][number]>();
 const assetKey=(a:PackedCapital["assetDictionary"][number])=>JSON.stringify([a.chainId,a.address,a.symbol,a.decimals]);
 const productKey=(p:PackedCapital["productDictionary"][number])=>JSON.stringify([p.chainId,p.address,p.name]);
 for(const d of native.history){
  for(const t of [d.totals,...d.products.map(p=>p.totals)])for(const row of [...t.assets,...t.unresolvedAssets]){
   const a={chainId:d.chainId,...row.asset};assetMap.set(assetKey(a),a);
  }
  for(const p of d.products){const row={chainId:d.chainId,address:p.address,name:p.name};productMap.set(productKey(row),row);}
 }
 const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
 const assetDictionary=[...assetMap.values()].sort((a,b)=>a.chainId-b.chainId||cmp(a.address,b.address)||cmp(a.symbol,b.symbol)||a.decimals-b.decimals);
 const productDictionary=[...productMap.values()].sort((a,b)=>a.chainId-b.chainId||cmp(a.address,b.address)||cmp(a.name,b.name));
 const assets=new Map(assetDictionary.map((a,i)=>[assetKey(a),i])),products=new Map(productDictionary.map((p,i)=>[productKey(p),i]));
 const total=(t:CapitalTotals):PackedCapital["history"][number][14]=>[t.depositingChainAddresses,t.withdrawingChainAddresses,t.unresolvedEvents,t.protocolEvents,t.internalEvents,t.migrationLegs,t.assets.map(a=>[assets.get(assetKey({chainId:a.chainId,...a.asset}))!,a.depositsRaw,a.withdrawalsRaw,a.depositActions,a.withdrawalActions,a.depositingAccounts,a.withdrawingAccounts,a.actionsWithoutAccount]),t.unresolvedAssets.map(a=>[assets.get(assetKey({chainId:a.chainId,...a.asset}))!,a.depositsRaw,a.withdrawalsRaw])];
 const packed:PackedCapital={schema:"pulse-kong-envio/v4",encoding:"dictionary-tuples/v1",assetDictionary,productDictionary,history:native.history.map(d=>[d.chainId,d.day,d.accountingSha256,d.sourceSha256,d.registryProducts,d.nativeEventIneligibleProducts,d.metadataGapProducts,d.day,d.scopedEvents,d.transactions,d.anchor.number,d.anchor.timestamp,d.anchor.hash,0,total(d.totals),d.products.map(p=>[products.get(productKey({chainId:d.chainId,address:p.address,name:p.name}))!,total(p.totals)])])};
 return {...feed,reviewedCapital:{...native,...packed}};
}
