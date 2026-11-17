import original from "./pulse-live.json";
export function tvlFixture() {
  const feed = structuredClone(original);
  const end = Math.floor(feed.generatedAt / 86400) * 86400;
  const history = Array.from({length:91}, (_, i) => ({
    observedAt: i === 90 ? feed.generatedAt : end - (90 - i) * 86400,
    value: String(140000000 + i * 1000), quality:"estimated" as const,
    sourceSha256:"a".repeat(64), provisional:i === 90,
  }));
  return { ...feed, tvlHistory:{
    schema:"pulse-tvl/v1", enabled:true, status:"available", checkedAt:feed.generatedAt, error:null, unit:"USD",
    source:{id:"defillama-yearn-finance",url:"https://api.llama.fi/protocol/yearn-finance",label:"DefiLlama · Yearn Finance",
      scope:"Yearn vaults across seven chains; excludes separate Yearn Curating and yETH pool series",
      chains:[{chainId:1,name:"Ethereum"},{chainId:10,name:"Optimism"},{chainId:137,name:"Polygon"},{chainId:250,name:"Fantom"},{chainId:8453,name:"Base"},{chainId:42161,name:"Arbitrum"},{chainId:747474,name:"Katana"}],
      reviewedAdapterRevision:"b".repeat(40)},
    history, latest:history.at(-1)!,
    coverage:{requestedClosedDays:90,observedClosedDays:90,missingDays:[] as number[],forwardFilled:false,isDailyClose:false,historyStart:history[0].observedAt,historyEnd:history.at(-1)!.observedAt},
    annotations:[{at:1792108800,kind:"methodology",label:"Overlap accounting changed",detail:"Adapter overlap deductions changed on 15–16 October 2026. The TVL movement can include an accounting change; it is not a withdrawal measure."}],
  }};
}
