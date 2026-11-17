import original from "./pulse-live.json";
import { parsePulseFeed } from "@/lib/clients/pulse/feed";
export function globalCapitalFixture() {
  const feed = parsePulseFeed(structuredClone(original), original.generatedAt + 60);
  const until = Math.floor(feed.generatedAt / 86400) * 86400;
  const day = until - 86400;
  const chains = [1,10,137,8453,42161,747474];
  const source = feed.reviewedCapital!.history[0];
  feed.reviewedCapital!.coverage.quarantined = [];
  feed.reviewedCapital!.history = chains.map(chainId => {
    const row = structuredClone(source); row.chainId = chainId; row.day = day;
    for (const totals of [row.totals, ...row.products.map(p => p.totals)]) {
      for (const asset of [...totals.assets, ...totals.unresolvedAssets]) asset.chainId = chainId;
    }
    return row;
  });
  const rows = feed.reviewedCapital!.history;
  const depositActions = rows.reduce((n,d) => n+d.totals.assets.reduce((n,a)=>n+a.depositActions,0),0);
  const withdrawalActions = rows.reduce((n,d) => n+d.totals.assets.reduce((n,a)=>n+a.withdrawalActions,0),0);
  const assetCount = rows.reduce((n,d)=>n+d.totals.assets.filter(a=>a.depositActions+a.withdrawalActions>0).length,0);
  const products = rows.flatMap(d=>d.products.map(p=>({
    chainId:d.chainId,address:p.address,name:p.name,
    depositsUsd:"20.00",withdrawalsUsd:"5.00",netUsd:"15.00",
    depositActions:p.totals.assets.reduce((n,a)=>n+a.depositActions,0),
    withdrawalActions:p.totals.assets.reduce((n,a)=>n+a.withdrawalActions,0),
    pricedActions:p.totals.assets.reduce((n,a)=>n+a.depositActions+a.withdrawalActions,0),
  })).filter(p=>p.pricedActions>0));
  const point = {
    day,quality:"estimated" as const,sourceSha256:"c".repeat(64),
    capital: rows.map(d=>({chainId:d.chainId,accountingSha256:d.accountingSha256})),
    depositsUsd:(products.length*20).toFixed(2),withdrawalsUsd:(products.length*5).toFixed(2),netUsd:(products.length*15).toFixed(2),flowBalanceBps:6000,
    depositingAccounts:rows.reduce((n,d)=>n+d.totals.depositingChainAddresses,0),
    withdrawingAccounts:rows.reduce((n,d)=>n+d.totals.withdrawingChainAddresses,0),
    actionsWithoutAccount:rows.reduce((n,d)=>n+d.totals.assets.reduce((n,a)=>n+a.actionsWithoutAccount,0),0),depositActions,withdrawalActions,unresolvedEvents:rows.reduce((n,d)=>n+d.totals.unresolvedEvents,0),
    priceCoverage:{assetCount,pricedAssetCount:assetCount,actionCount:depositActions+withdrawalActions,pricedActionCount:depositActions+withdrawalActions,unpricedAssets:[]},
    products,
  };
  feed.globalCapital = {
    schema:"pulse-global-capital/v1",enabled:true,status:"available",checkedAt:feed.generatedAt,error:null,
    source:{id:"defillama-coins",url:"https://coins.llama.fi",valuation:"Daily UTC opening reference prices; estimates, not execution prices",searchWidthSeconds:14400,minConfidence:0.9},
    coverage:{allYearn:false,supportedChains:chains,publishedDays:90,from:until-90*86400,until,observedDays:1,
      missingDays:Array.from({length:89},(_,i)=>until-(90-i)*86400),forwardFilled:false,accountMeaning:"distinct chain-qualified beneficiary addresses, not people",unresolvedRoutesExcluded:true},
    history:[point],
  };
  return feed;
}
