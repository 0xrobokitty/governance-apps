import type {MarketHistory} from "@/lib/clients/pulse/market-history";
import {globalCapitalFixture} from "./pulse-global-capital";
export function marketFixture(){
 const f=globalCapitalFixture(),until=Math.floor(f.generatedAt/86400)*86400,from=until-365*86400,day=until-86400;
 const marketHistory:MarketHistory={schema:"pulse-market-history/v1",sourceUrl:"https://coins.llama.fi",definition:"Same-source daily opening reference prices.",checkedAt:f.generatedAt,status:"partial",reason:null,
 history:[{day,yfiUsd:"2100",wethUsd:"3000",yfiEth:"0.7",yfiQuoteAt:day+600,wethQuoteAt:day+900,yfiConfidence:.95,wethConfidence:.97,sourceSha256:"e".repeat(64)}],
 coverage:{fromInclusive:from,untilExclusive:until,expectedDays:365,observedDays:1,missingDays:Array.from({length:364},(_,i)=>from+i*86400)}};
 return {...f,marketHistory};
}
