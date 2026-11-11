import type { Period } from "./types";
import { assetId, type PulseFeed, type CapitalDay, type LiveMetric } from "./feed";
export const dayAt = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
export function windowDays(now: number, period: Period, closed = false) {
  const end = Math.floor(now / 86400) * 86400 - (closed ? 86400 : 0);
  return Array.from({ length: period }, (_, i) => end - (period - 1 - i) * 86400);
}
export function lockerPegValue(feed: PulseFeed, product: "ycrv" | "yyb", date: string): number | null {
  const peg = feed.yLockers?.peg;
  const quote = peg?.history.find(p => dayAt(p.observedAt) === date)?.quoteOutRaw[product];
  if (quote === undefined || !peg || BigInt(peg.quoteInRaw) === 0n) return null;
  return Number(quote) / Number(peg.quoteInRaw) * 100;
}
export function coveredDays(feed: PulseFeed, period: Period) {
  const dates = windowDays(feed.generatedAt, period, true);
  const bad = new Set(feed.reviewedCapital?.coverage.quarantined ?? []);
  return (feed.reviewedCapital?.enabled ? feed.reviewedCapital.history : []).filter(d => d.day >= dates[0] && d.day <= dates.at(-1)! && !bad.has(d.chainId + ":" + d.day));
}
export function capitalChains(feed: PulseFeed) {
  return [...new Set([...(feed.reviewedCapital?.coverage.supportedChains ?? []), ...(feed.reviewedCapital?.sources.chains.map(c => c.chainId) ?? [])])].sort((a, b) => a - b);
}
export function metricStatus(metrics: (LiveMetric | undefined)[]) {
  if (metrics.every(m => !m || m.status === "unavailable")) return "unavailable";
  if (metrics.some(m => m?.status === "stale")) return "stale";
  if (metrics.some(m => !m || m.status === "unavailable" || m.status === "partial")) return "partial";
  if (metrics.some(m => m?.status === "estimated")) return "estimated";
  return "available";
}
export function capitalAssets(days: CapitalDay[]) {
  return [...new Map(days.flatMap(d => [...d.totals.assets, ...d.totals.unresolvedAssets]).map(a => [assetId(a), { id: assetId(a), chainId: a.chainId, asset: a.asset }])).values()];
}
export function capitalTrend(feed: PulseFeed, period: Period, selected: string) {
  const days = coveredDays(feed, period);
  const dates = windowDays(feed.generatedAt, period, true);
  const chain = Number(selected.split(":")[0]);
  const selectedDays = days.filter(d => d.chainId === chain);
  const rows = dates.map(t => selectedDays.find(d => d.day === t));
  const read = (d: CapitalDay | undefined, direction: "deposits" | "withdrawals" | "net") => !d ? null : Number(d.totals.assets.find(a => assetId(a) === selected)?.[direction] ?? "0");
  const products = new Map<string, { name: string; netRaw: bigint; decimals: number; actions: number }>();
  for (const d of selectedDays) for (const p of d.products) {
    const a = p.totals.assets.find(a => assetId(a) === selected);
    if (!a) continue;
    const row = products.get(p.address) ?? { name: p.name, netRaw: 0n, decimals: a.asset.decimals, actions: 0 };
    row.netRaw += BigInt(a.depositsRaw) - BigInt(a.withdrawalsRaw);
    row.actions += a.depositActions + a.withdrawalActions;
    products.set(p.address, row);
  }
  const unknown = selectedDays.flatMap(d => d.totals.unresolvedAssets.filter(a => assetId(a) === selected));
  const asset = capitalAssets(days).find(a => a.id === selected);
  const scale = 10 ** (asset?.asset.decimals ?? 18);
  return {
    dates: dates.map(dayAt), net: rows.map(d => read(d, "net")), deposits: rows.map(d => read(d, "deposits")), withdrawals: rows.map(d => read(d, "withdrawals")),
    observed: selectedDays.length,
    gapIn: Number(unknown.reduce((n, a) => n + BigInt(a.depositsRaw), 0n)) / scale,
    gapOut: Number(unknown.reduce((n, a) => n + BigInt(a.withdrawalsRaw), 0n)) / scale,
    unresolved: selectedDays.reduce((n, d) => n + d.totals.unresolvedEvents, 0),
    products: [...products].map(([id, p]) => ({ id, name: p.name, net: Number(p.netRaw) / 10 ** p.decimals, actions: p.actions, values: rows.map(d => !d ? null : Number(d.products.find(row => row.address === id)?.totals.assets.find(a => assetId(a) === selected)?.net ?? "0")) })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 5),
  };
}
export function accountTrend(feed: PulseFeed, period: Period, chainId?: number) {
  const covered = coveredDays(feed, period).filter(d => chainId === undefined || d.chainId === chainId);
  const dates = windowDays(feed.generatedAt, period, true);
  const rows = dates.map(t => covered.filter(d => d.day === t));
  const expectedChains = chainId === undefined ? capitalChains(feed) : [chainId];
  const complete = (ds: CapitalDay[]) => expectedChains.length > 0 && expectedChains.every(id => ds.some(d => d.chainId === id));
  return {
    dates: dates.map(dayAt),
    deposits: rows.map(ds => complete(ds) ? ds.reduce((n, d) => n + d.totals.depositingChainAddresses, 0) : null),
    withdrawals: rows.map(ds => complete(ds) ? ds.reduce((n, d) => n + d.totals.withdrawingChainAddresses, 0) : null),
    chainDays: covered.length, expected: period * expectedChains.length, completeDays: rows.filter(complete).length,
  };
}
export function metricTrend(feed: Pick<PulseFeed,"generatedAt"|"metrics">, period: Period, id: string, closed=false) {
  const metric = feed.metrics.find(m => m.id === id);
  const days = windowDays(feed.generatedAt, period,closed);
  const points = new Map(metric?.history.map(p => [Math.floor(p.observedAt / 86400) * 86400, Number(p.value)]));
  return { metric, dates: days.map(dayAt), values: days.map(day => points.get(day) ?? null) };
}

export function xTrend(feed: PulseFeed, period: Period) {
  const dates = windowDays(feed.generatedAt, period);
  const all = new Map(feed.x?.history.map(p => [Math.floor(p.observedAt / 86400) * 86400, p]));
  const rows = dates.map(day => all.get(day));
  const average = (day: number, field: "impressions" | "linkClicks") => {
    const values = Array.from({ length: 7 }, (_, i) => all.get(day - i * 86400)?.[field] ?? null);
    return values.every((n): n is number => n !== null) ? values.reduce((a, b) => a + b, 0) / 7 : null;
  };
  return {
    dates: dates.map(dayAt), latest: rows.findLast(p => p !== undefined),
    impressions: rows.map(p => p?.impressions ?? null), linkClicks: rows.map(p => p?.linkClicks ?? null),
    followers: rows.map(p => p?.followers ?? null),
    impressionAverage: dates.map(day => average(day, "impressions")),
    clickAverage: dates.map(day => average(day, "linkClicks")),
  };
}

export function tvlTrend(feed: PulseFeed, period: Period) {
  const days = windowDays(feed.generatedAt, period);
  const points = new Map(feed.tvlHistory?.history.map(p => [Math.floor(p.observedAt / 86400) * 86400, p]));
  return {
    dates: days.map(dayAt),
    values: days.map(day => points.has(day) ? Number(points.get(day)!.value) : null),
    points: days.map(day => points.get(day)),
    chains: (feed.tvlHistory?.source.chains ?? []).map(chain => ({
      ...chain, values: days.map(day => {
        const p = points.get(day);
        return p?.chains ? Number(p.chains.find(c => c.chainId === chain.chainId)!.value) : null;
      }),
    })),
    annotations: feed.tvlHistory?.annotations.filter(a => a.at >= days[0] && a.at < days.at(-1)! + 86400) ?? [],
  };
}

export function productActivity(feed: PulseFeed, period: Period) {
  const days = coveredDays(feed, period);
  const dates = windowDays(feed.generatedAt, period, true);
  const products = new Map<string, { chainId: number; address: string; name: string; actions: number; byDay: Map<number, number> }>();
  for (const day of days) for (const product of day.products) {
    const actions = product.totals.assets.reduce((sum, asset) => sum + asset.depositActions + asset.withdrawalActions, 0);
    if (!actions) continue;
    const id = day.chainId + ":" + product.address;
    const row = products.get(id) ?? { chainId: day.chainId, address: product.address, name: product.name, actions: 0, byDay: new Map<number, number>() };
    row.actions += actions;
    row.byDay.set(day.day, actions);
    products.set(id, row);
  }
  const observed = new Set(days.map(d => d.chainId + ":" + d.day));
  return {
    dates: dates.map(dayAt), observedChainDays: days.length, expectedChainDays: period * capitalChains(feed).length,
    products: [...products].map(([id, product]) => ({
      id, chainId: product.chainId, address: product.address, name: product.name, actions: product.actions,
      values: dates.map(day => observed.has(product.chainId + ":" + day) ? product.byDay.get(day) ?? 0 : null),
    })).sort((a, b) => b.actions - a.actions || a.id.localeCompare(b.id)).slice(0, 5),
  };
}

export function globalCapitalTrend(feed: PulseFeed, period: Period) {
  const days = windowDays(feed.generatedAt, period, true);
  const points = new Map(feed.globalCapital?.enabled ? feed.globalCapital.history.map(p => [p.day, p]) : []);
  const rows = days.map(day => points.get(day));
  const depositsCents=rows.reduce((n,p)=>n+(p?.depositsUsd==null?0n:BigInt(p.depositsUsd.replace(".",""))),0n);
  const withdrawalsCents=rows.reduce((n,p)=>n+(p?.withdrawalsUsd==null?0n:BigInt(p.withdrawalsUsd.replace(".",""))),0n);
  const grossCents=depositsCents+withdrawalsCents;
  let runningDeposits=0n,runningWithdrawals=0n;
  const cumulativeNet:(number|null)[]=[],runningBalance:(number|null)[]=[];
  for(const p of rows){
    if(!p || p.depositsUsd===null || p.withdrawalsUsd===null){cumulativeNet.push(null);runningBalance.push(null);continue;}
    runningDeposits+=BigInt(p.depositsUsd.replace(".",""));
    runningWithdrawals+=BigInt(p.withdrawalsUsd.replace(".",""));
    cumulativeNet.push(Number(runningDeposits-runningWithdrawals)/100);
    const gross=runningDeposits+runningWithdrawals;
    runningBalance.push(gross>0n?Number((runningDeposits-runningWithdrawals)*10000n/gross)/100:null);
  }
  const products = new Map<string, {chainId:number; name:string; netCents:bigint; actions:number; pricedActions:number; byDay:Map<number,number|null>}>();
  for (const p of rows) if (p) for (const product of p.products) {
    const id = product.chainId + ":" + product.address;
    const row = products.get(id) ?? {chainId:product.chainId,name:product.name,netCents:0n,actions:0,pricedActions:0,byDay:new Map<number,number|null>()};
    if (product.netUsd !== null) row.netCents += BigInt(product.netUsd.replace(".", ""));
    row.actions += product.depositActions + product.withdrawalActions;
    row.pricedActions += product.pricedActions;
    row.byDay.set(p.day, product.netUsd === null ? null : Number(product.netUsd));
    products.set(id, row);
  }
  return {
    dates:days.map(dayAt), rows, observed:rows.filter(Boolean).length, cumulativeNet,runningBalance,
    deposits:rows.map(p=>p?.depositsUsd==null?null:Number(p.depositsUsd)),
    withdrawals:rows.map(p=>p?.withdrawalsUsd==null?null:Number(p.withdrawalsUsd)),
    depositsUsd:Number(depositsCents)/100, withdrawalsUsd:Number(withdrawalsCents)/100,
    periodBalance:grossCents>0n?Number((depositsCents-withdrawalsCents)*10000n/grossCents)/100:null,
    net:rows.map(p => p?.netUsd == null ? null : Number(p.netUsd)),
    balance:rows.map(p => p?.flowBalanceBps == null ? null : p.flowBalanceBps / 100),
    pricedActions:rows.reduce((n,p)=>n+(p?.priceCoverage.pricedActionCount??0),0),
    actions:rows.reduce((n,p)=>n+(p?.priceCoverage.actionCount??0),0),
    unresolved:rows.reduce((n,p)=>n+(p?.unresolvedEvents??0),0),
    partial:rows.some(p=>p && p.priceCoverage.pricedActionCount < p.priceCoverage.actionCount),
    products:[...products].filter(([,p])=>[...p.byDay.values()].some(v=>v!==null)).map(([id,p])=>({
      id,chainId:p.chainId,name:p.name,net:Number(p.netCents)/100,actions:p.actions,partial:p.pricedActions<p.actions,
      values:days.map(day=>!points.has(day)?null:p.byDay.has(day)?p.byDay.get(day)!:0),
    })).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)||a.id.localeCompare(b.id)).slice(0,5),
  };
}
